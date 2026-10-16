"""Appwrite Cloud Storage integration for KORD mastered-audio files.

Upload policy
-------------
ONLY the final mastered audio (``master.wav``) is ever uploaded to Appwrite.
Original uploads, DSP intermediates, stems, analysis files, preview renders,
waveform data and debug files stay on the KORD backend and keep following the
application's existing temporary-file lifecycle.

Uploads are deliberately **decoupled from the job's ``ephemeral`` flag**.
``ephemeral`` governs the *local* job folder (removed ~10 min after the
WebSocket disconnects); it has no bearing on whether the finished master is
worth keeping in cloud storage. Gating the upload on ``not ephemeral`` meant
that the real UI flow -- which always sends ``ephemeral=true`` -- never
uploaded anything at all. To keep the cloud copy traceable (and therefore
deletable) the Appwrite tracking keys are persisted to ``metadata.json`` for
every job, ephemeral or not, even though the rest of the record is not.

Downloads
---------
The bucket is never made publicly writable. User-facing access uses Appwrite
*file tokens* (the token is passed as a URL search parameter) so the mastered
file can be downloaded without exposing the server API key. If token minting
fails, ``download_master`` streams the file through the KORD backend using the
server key, so ``download_url`` is never left dangling.

Lifecycle
---------
Recorded in persisted job metadata (``metadata.json``) and enforced by a
periodic in-process cleanup loop that, ~``APPWRITE_TTL_HOURS`` after upload:

* deletes the Appwrite file, and
* purges the local master and its derived exports

so cloud and local retention expire together. Because the expiry state lives on
disk and the loop is rescheduled at startup, cleanup survives process restarts
and is idempotent (a 404 is treated as already-cleaned). The user's original
upload (``input.wav``) is kept unless ``APPWRITE_PURGE_LOCAL_INPUT`` is set.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import re
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator, Optional
from urllib.parse import quote

from appwrite.client import Client
from appwrite.exception import AppwriteException
from appwrite.id import ID
from appwrite.input_file import InputFile
from appwrite.query import Query
from appwrite.services.storage import Storage
from appwrite.services.tokens import Tokens

from utils.config import get_settings

logger = logging.getLogger(__name__)

MASTERS_ROOT_FOLDER = "masters"
CLEANUP_INTERVAL_SECONDS = 15 * 60  # periodic cleanup pass every 15 minutes
STREAM_CHUNK_BYTES = 512 * 1024  # re-chunk size for the proxy download fallback
PENDING_METADATA_FILENAME = "appwrite_pending.json"

# Keys written to job records/metadata by this module.
APPWRITE_META_KEYS = (
    "appwrite_state",
    "appwrite_file_id",
    "appwrite_filename",
    "appwrite_created_at",
    "appwrite_expires_at",
    "appwrite_download_url",
    "appwrite_error",
)

# Local paths removed when a master's retention window closes. `input.wav` is
# the user's own upload and is only removed when explicitly opted in.
_PURGE_LOCAL_DIRS = ("exports", "streaming_sim")
_PURGE_LOCAL_FILES = ("master.wav", "master_playback.wav")

# Appwrite "folder" segments must be safe path components.
_SAFE_JOB_ID_RE = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")


class AppwriteStorageError(Exception):
    """Raised when an Appwrite storage operation cannot be completed."""


def appwrite_configured() -> bool:
    """True when every credential required for Appwrite is present."""
    return get_settings().appwrite_enabled


def jobs_root() -> Path:
    """Directory holding per-job folders.

    Shared with :mod:`services.job_store` so the cleanup loop and the record
    store can never disagree about where job state lives.
    """
    return get_settings().data_dir / "jobs"


def pending_metadata_path() -> Path:
    """Durable tracking file for cloud masters whose local job was removed."""
    return get_settings().data_dir / PENDING_METADATA_FILENAME


def preserve_appwrite_metadata(rec: Any) -> None:
    """Keep ephemeral-job cloud metadata after its local folder is removed."""
    if rec.appwrite_state != "uploaded" or not rec.appwrite_file_id:
        return
    path = pending_metadata_path()
    try:
        entries: list[dict[str, Any]] = []
        if path.exists():
            with path.open("r", encoding="utf-8") as fh:
                loaded = json.load(fh)
            if isinstance(loaded, list):
                entries = [item for item in loaded if isinstance(item, dict)]
        entries = [item for item in entries if item.get("file_id") != rec.appwrite_file_id]
        entries.append(
            {
                "job_id": rec.job_id,
                "file_id": rec.appwrite_file_id,
                "filename": rec.appwrite_filename,
                "download_url": rec.appwrite_download_url,
                "expires_at": rec.appwrite_expires_at.isoformat() if rec.appwrite_expires_at else None,
            }
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as fh:
            json.dump(entries, fh)
    except Exception:
        logger.exception("Could not preserve Appwrite metadata for job=%s", rec.job_id)


def load_pending_appwrite_metadata(job_id: str) -> Optional[dict[str, Any]]:
    path = pending_metadata_path()
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as fh:
            entries = json.load(fh)
        for entry in entries if isinstance(entries, list) else []:
            if isinstance(entry, dict) and entry.get("job_id") == job_id:
                return entry
    except Exception:
        logger.exception("Could not read pending Appwrite metadata")
    return None


def find_master_metadata(job_id: str) -> Optional[dict[str, Any]]:
    """Recover cloud metadata when local job metadata was lost."""
    storage = _storage()
    if storage is None:
        return None
    try:
        files = storage.list_files(
            bucket_id=get_settings().appwrite_bucket_id,
            queries=[Query.equal("folder", f"{MASTERS_ROOT_FOLDER}/{job_id}/")],
            total=False,
        )
    except AppwriteException as exc:
        logger.warning("Could not recover Appwrite metadata for job=%s: %s", job_id, _sanitized_error(exc))
        return None
    if not files.files:
        return None
    file = files.files[0]
    return {
        "job_id": job_id,
        "file_id": file.id,
        "filename": file.name,
        "download_url": None,
        "expires_at": None,
    }


def _client() -> Optional[Client]:
    if not appwrite_configured():
        return None
    s = get_settings()
    client = Client()
    client.set_endpoint(s.appwrite_endpoint)
    client.set_project(s.appwrite_project_id)
    client.set_key(s.appwrite_api_key)
    return client


def _storage() -> Optional[Storage]:
    client = _client()
    return Storage(client) if client else None


def _tokens() -> Optional[Tokens]:
    client = _client()
    return Tokens(client) if client else None


def _sanitized_error(exc: AppwriteException) -> str:
    """Return a log-safe description of an Appwrite error (no secrets)."""
    return f"code={exc.code} type={exc.type or exc.message or 'unknown'}"


def _build_signed_view_url(file_id: str, token_secret: str) -> str:
    s = get_settings()
    base = (s.appwrite_endpoint or "").rstrip("/")
    token = quote(token_secret, safe="A-Za-z0-9-_.~")
    return (
        f"{base}/storage/buckets/{s.appwrite_bucket_id}/files/{file_id}/view"
        f"?project={s.appwrite_project_id}&token={token}"
    )


def upload_master(
    job_id: str,
    master_path: Path,
    original_filename: Optional[str] = None,
    ttl_hours: Optional[int] = None,
) -> dict[str, Any]:
    """Upload ONLY the final mastered audio file to Appwrite.

    Returns a dict of ``APPWRITE_META_KEYS`` describing the upload. Raises
    :class:`AppwriteStorageError` with a sanitized message on failure so the
    caller can record a clean ``appwrite_state="failed"`` without aborting the
    mastering pipeline.
    """
    settings = get_settings()
    storage = _storage()
    if storage is None:
        raise AppwriteStorageError("Appwrite storage is not configured")

    if not _SAFE_JOB_ID_RE.match(job_id):
        raise AppwriteStorageError("Invalid job id for storage path")

    if not master_path or not Path(master_path).is_file():
        raise AppwriteStorageError("Mastered audio file not found")

    if Path(master_path).suffix.lower() != ".wav":
        raise AppwriteStorageError(f"Refusing to store non-master format: {Path(master_path).suffix}")

    ttl = settings.appwrite_ttl_hours if ttl_hours is None else ttl_hours
    folder = f"{MASTERS_ROOT_FOLDER}/{job_id}"
    original_stem = Path(original_filename or "").stem
    stored_name = f"{original_stem}_mastered_{job_id}.wav" if original_stem else "master.wav"
    upload_path = Path(master_path).with_name(stored_name)
    if upload_path != Path(master_path):
        shutil.copyfile(master_path, upload_path)
    file_id = ID.unique()

    try:
        uploaded = storage.create_file(
            bucket_id=settings.appwrite_bucket_id,
            file_id=file_id,
            file=InputFile.from_path(str(upload_path)),
            permissions=None,  # bucket stays private; access via file tokens
            folder=folder,
        )
    except AppwriteException as exc:
        if upload_path != Path(master_path):
            upload_path.unlink(missing_ok=True)
        raise AppwriteStorageError(
            f"Appwrite upload failed: {_sanitized_error(exc)}"
        ) from exc

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=ttl)

    download_url: Optional[str] = None
    try:
        token = _tokens().create_file_token(
            bucket_id=settings.appwrite_bucket_id,
            file_id=uploaded.id,
            expire=expires_at.isoformat(),
        )
        download_url = _build_signed_view_url(uploaded.id, token.secret)
    except AppwriteException as exc:
        # Upload succeeded but token minting failed. Keep the file: clients fall
        # back to the backend proxy route, which streams it with the server key
        # and still enforces expires_at.
        logger.warning(
            "Master uploaded but file token creation failed (job=%s): %s",
            job_id,
            _sanitized_error(exc),
        )
    if upload_path != Path(master_path):
        upload_path.unlink(missing_ok=True)

    logger.info(
        "Master uploaded to Appwrite (job=%s, file=%s, folder=%s, expires=%s)",
        job_id,
        uploaded.id,
        uploaded.folder or folder,
        expires_at.isoformat(),
    )
    return {
        "appwrite_state": "uploaded",
        "appwrite_file_id": uploaded.id,
        "appwrite_filename": stored_name,
        "appwrite_created_at": now,
        "appwrite_expires_at": expires_at,
        "appwrite_download_url": download_url,
        "appwrite_error": None,
    }


def upload_master_for_job(
    job_id: str,
    master_path: Path,
    original_filename: Optional[str] = None,
) -> dict[str, Any]:
    """Upload orchestrator that never raises into the mastering pipeline.

    Returns a full ``APPWRITE_META_KEYS`` dict — either the upload metadata or
    a ``failed`` state describing why the upload did not happen. Returns an
    empty dict when Appwrite is simply not configured, so that "cloud storage
    switched off" is reported as ``state="none"`` rather than as a failure.
    """
    if not appwrite_configured():
        return {}
    try:
        return upload_master(job_id, master_path)
    except AppwriteStorageError as exc:
        logger.error("Appwrite upload failed for job %s: %s", job_id, exc)
        return {
            "appwrite_state": "failed",
            "appwrite_file_id": None,
            "appwrite_filename": None,
            "appwrite_created_at": None,
            "appwrite_expires_at": None,
            "appwrite_download_url": None,
            "appwrite_error": str(exc),
        }
    except Exception as exc:  # noqa: BLE001 - defensive: pipeline must not break
        logger.exception("Unexpected Appwrite upload error for job %s", job_id)
        return {
            "appwrite_state": "failed",
            "appwrite_file_id": None,
            "appwrite_filename": None,
            "appwrite_created_at": None,
            "appwrite_expires_at": None,
            "appwrite_download_url": None,
            "appwrite_error": f"Unexpected upload error: {exc}",
        }


def refresh_master_for_job(
    job_id: str,
    master_path: Path,
    previous_file_id: Optional[str],
    original_filename: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Replace the stored cloud master after a /finalize re-render.

    Deletes the previous Appwrite file first so no orphaned cloud master
    outlives its metadata. Returns the new ``APPWRITE_META_KEYS`` dict, or
    ``None`` when the replacement could not be completed (previous file is left
    untouched so the record never points at a file whose master changed).
    """
    if previous_file_id:
        try:
            delete_file_by_id(previous_file_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Could not replace cloud master (delete old file=%s) for job %s: %s; keeping previous master",
                previous_file_id,
                job_id,
                exc,
            )
            return None
    return upload_master_for_job(job_id, master_path, original_filename)


def delete_file_by_id(file_id: str) -> bool:
    """Delete an Appwrite file idempotently.

    Returns ``True`` when the file is gone (deleted or already absent). Raises
    on transient errors so the cleanup mechanism will retry.
    """
    settings = get_settings()
    storage = _storage()
    if storage is None:
        return True
    try:
        storage.delete_file(bucket_id=settings.appwrite_bucket_id, file_id=file_id)
        return True
    except AppwriteException as exc:
        if exc.type == "storage_file_not_found" or exc.code == 404:
            return True  # already cleaned
        raise
    except Exception as exc:  # noqa: BLE001
        raise AppwriteStorageError(f"Appwrite delete failed: {exc}") from exc


async def delete_file_safe(file_id: str, *, retries: int = 0) -> bool:
    """Async delete with best-effort retries; returns success flag, never raises."""
    for attempt in range(retries + 1):
        try:
            return await asyncio.to_thread(delete_file_by_id, file_id)
        except Exception as exc:  # noqa: BLE001
            if attempt < retries:
                await asyncio.sleep(1.5)
                continue
            logger.warning("Appwrite delete failed (file=%s): %s", file_id, exc)
            return False
    return False


def stream_master(file_id: str) -> Iterator[bytes]:
    """Yield the stored master from Appwrite in chunks, using the server key.

    This is the fallback for when file-token minting failed: the client still
    gets the audio, the server API key never leaves the backend, and the caller
    is responsible for enforcing the job's retention window.

    Note the Appwrite server SDK's ``get_file_download`` returns the whole
    response as a single ``bytes`` object rather than a stream, so the body is
    already fully buffered by the time we see it. We re-chunk it here so
    Starlette can release it incrementally instead of holding the entire file
    for the life of the response. This is a fallback path only — the signed
    file-token URL is preferred precisely because the browser then streams
    straight from Appwrite's CDN without the backend buffering anything.
    """
    settings = get_settings()
    storage = _storage()
    if storage is None:
        raise AppwriteStorageError("Appwrite storage is not configured")
    try:
        payload = storage.get_file_download(
            bucket_id=settings.appwrite_bucket_id,
            file_id=file_id,
        )
    except AppwriteException as exc:
        raise AppwriteStorageError(
            f"Appwrite download failed: {_sanitized_error(exc)}"
        ) from exc

    return _iter_chunks(payload, STREAM_CHUNK_BYTES)


def _iter_chunks(payload: bytes, size: int) -> Iterator[bytes]:
    """Slice a buffered response into chunks for StreamingResponse.

    Iterating raw `bytes` directly yields ints, which Starlette cannot write —
    so re-chunk explicitly.
    """
    if not payload:
        return iter(())
    buffer = io.BytesIO(payload)
    return iter(lambda: buffer.read(size), b"")


def purge_local_master(job_dir: Path) -> list[str]:
    """Remove the local master and everything derived from it.

    Called when a master's retention window closes so local and cloud retention
    expire together. The user's original ``input.wav`` is preserved unless
    ``APPWRITE_PURGE_LOCAL_INPUT`` is enabled. Returns the removed paths.
    """
    if not job_dir or not job_dir.is_dir():
        return []

    removed: list[str] = []

    def _drop(path: Path) -> None:
        try:
            if path.is_dir():
                shutil.rmtree(str(path), ignore_errors=True)
            elif path.exists():
                path.unlink()
            else:
                return
            removed.append(path.name)
        except Exception:  # noqa: BLE001 - purge is best-effort
            logger.warning("Could not purge local artifact %s", path)

    for name in _PURGE_LOCAL_FILES:
        _drop(job_dir / name)
    for name in _PURGE_LOCAL_DIRS:
        _drop(job_dir / name)
    if get_settings().appwrite_purge_local_input:
        _drop(job_dir / "input.wav")

    if removed:
        logger.info("Local master artifacts purged (job=%s): %s", job_dir.name, ", ".join(removed))
    return removed


async def run_appwrite_cleanup_once() -> dict[str, Any]:
    """Expire every uploaded master past its retention window.

    For each job whose window has closed this deletes the Appwrite file *and*
    purges the local master plus its exports, so cloud and local retention
    expire together rather than leaving a stale copy on the backend volume.

    Driven entirely by persisted job metadata so it survives process restarts
    and in-memory record eviction. Idempotent: already-deleted files (404) and
    records already marked ``expired`` are skipped without error.
    """
    from services.job_store import job_store

    if not appwrite_configured():
        return {"scanned": 0, "deleted": 0, "errors": 0, "purged": 0}

    stats = {"scanned": 0, "deleted": 0, "errors": 0, "purged": 0}
    now = datetime.now(timezone.utc)
    pending_path = pending_metadata_path()
    pending_entries: list[dict[str, Any]] = []
    if pending_path.exists():
        try:
            with pending_path.open("r", encoding="utf-8") as fh:
                loaded = json.load(fh)
            if isinstance(loaded, list):
                pending_entries = [item for item in loaded if isinstance(item, dict)]
        except Exception:
            stats["errors"] += 1

    async def expire_pending_entries() -> None:
        remaining: list[dict[str, Any]] = []
        for item in pending_entries:
            file_id = item.get("file_id")
            expires_at = item.get("expires_at")
            if not file_id or not expires_at:
                remaining.append(item)
                continue
            try:
                expires = datetime.fromisoformat(expires_at)
            except Exception:
                stats["errors"] += 1
                remaining.append(item)
                continue
            if expires > now:
                remaining.append(item)
                continue
            stats["scanned"] += 1
            try:
                if await asyncio.to_thread(delete_file_by_id, file_id):
                    stats["deleted"] += 1
                    logger.info("Expired ephemeral master deleted (job=%s, file=%s)", item.get("job_id"), file_id)
                else:
                    stats["errors"] += 1
                    remaining.append(item)
            except Exception as exc:
                stats["errors"] += 1
                remaining.append(item)
                logger.warning("Cleanup retry pending for file=%s: %s", file_id, exc)
        try:
            if remaining:
                with pending_path.open("w", encoding="utf-8") as fh:
                    json.dump(remaining, fh)
            elif pending_path.exists():
                pending_path.unlink()
        except Exception:
            stats["errors"] += 1

    await expire_pending_entries()

    root = jobs_root()
    if not root.is_dir():
        return stats

    for job_dir in sorted(root.iterdir()):
        if not job_dir.is_dir():
            continue
        meta_path = job_dir / "metadata.json"
        try:
            with open(meta_path, "r", encoding="utf-8") as fh:
                meta = json.load(fh)
        except Exception:
            continue

        if meta.get("appwrite_state") != "uploaded":
            continue
        file_id = meta.get("appwrite_file_id")
        expires_at = meta.get("appwrite_expires_at")
        if not file_id or not expires_at:
            continue
        try:
            expires = datetime.fromisoformat(expires_at)
        except Exception:
            stats["errors"] += 1
            continue
        if expires > now:
            continue

        stats["scanned"] += 1
        try:
            deleted = await asyncio.to_thread(delete_file_by_id, file_id)
        except Exception as exc:  # noqa: BLE001 - retry on the next pass
            stats["errors"] += 1
            logger.warning("Cleanup retry pending for job=%s file=%s: %s", job_dir.name, file_id, exc)
            continue
        if not deleted:
            stats["errors"] += 1
            continue

        stats["deleted"] += 1
        logger.info("Expired master deleted (job=%s, file=%s)", job_dir.name, file_id)

        # Reflect the deletion in both disk metadata (source of truth) and, if
        # the record is resident, the in-memory store. The disk write happens
        # first so a crash cannot leave local files purged but the record still
        # claiming `uploaded` (which would make them permanently unreachable).
        meta["appwrite_state"] = "expired"
        meta["appwrite_file_id"] = None
        meta["appwrite_download_url"] = None
        meta["appwrite_error"] = None
        try:
            with open(meta_path, "w", encoding="utf-8") as fh:
                json.dump(meta, fh)
        except Exception:
            stats["errors"] += 1

        stats["purged"] += len(await asyncio.to_thread(purge_local_master, job_dir))

        try:
            await job_store.get(job_dir.name)
            await job_store.update(
                job_dir.name,
                appwrite_state="expired",
                appwrite_file_id=None,
                appwrite_download_url=None,
                appwrite_error=None,
            )
        except Exception:
            pass

    return stats


async def start_appwrite_cleanup_loop() -> None:
    """Periodic cleanup scheduler; rescheduled at startup so it survives restarts."""
    if not appwrite_configured():
        return
    try:
        await run_appwrite_cleanup_once()
    except Exception:  # noqa: BLE001
        logger.exception("Appwrite cleanup initial pass failed")
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        try:
            await run_appwrite_cleanup_once()
        except Exception:  # noqa: BLE001
            logger.exception("Appwrite cleanup pass failed")