"""Appwrite cloud-storage tests.

Everything here runs against an in-memory fake of the Appwrite SDK, so the suite
never touches the network or the live bucket (see the env scrubbing in
conftest.py). conftest clears the APPWRITE_* vars before the app is imported, so
these tests opt back in explicitly through the `appwrite_enabled` fixture.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from appwrite.exception import AppwriteException
from services import appwrite_storage as aws
from services.job_store import JobRecord, delete_job_by_id, job_store
from utils.config import get_settings


# --------------------------------------------------------------------------
# Fake Appwrite SDK
# --------------------------------------------------------------------------
class FakeFile:
    def __init__(self, file_id: str, name: str, folder: str = ""):
        self.id = file_id
        self.name = name
        self.folder = folder


class FakeToken:
    def __init__(self, secret: str):
        self.secret = secret


class FakeStorage:
    """Records calls; `fail_upload` / `fail_token` drive the error paths."""

    def __init__(self, owner: "FakeAppwrite", token_service: bool = True):
        self._owner = owner
        self._token_service = token_service
        self.fail_upload: Exception | None = None
        self.fail_delete: Exception | None = None
        self.fail_token: Exception | None = None
        self.fail_download: Exception | None = None

    def create_file(self, *, bucket_id, file_id, file, permissions=None, folder=""):
        self._owner.created.append(
            {"bucket_id": bucket_id, "file_id": file_id, "folder": folder, "permissions": permissions}
        )
        if self.fail_upload:
            raise self.fail_upload
        self._owner.files[file_id] = {"name": Path(str(file.path)).name, "folder": folder}
        return FakeFile(file_id, Path(str(file.path)).name, folder)

    def delete_file(self, *, bucket_id, file_id):
        self._owner.deleted.append(file_id)
        if self.fail_delete:
            raise self.fail_delete
        if file_id not in self._owner.files:
            raise AppwriteException("not found", 404, "storage_file_not_found", "File not found")
        del self._owner.files[file_id]
        return None

    def get_file_download(self, *, bucket_id, file_id):
        self._owner.downloaded.append(file_id)
        if self.fail_download:
            raise self.fail_download
        # The real server SDK returns the whole body as `bytes` (it is NOT a
        # stream). Returning bytes here is what makes the chunking in
        # stream_master() load-bearing rather than accidentally correct.
        return b"RIFFfakewavdata"

    def create_file_token(self, *, bucket_id, file_id, expire=None):
        self._owner.tokens.append({"file_id": file_id, "expire": expire})
        if self.fail_token:
            raise self.fail_token
        return FakeToken(f"secret-{file_id}")


class FakeAppwrite:
    """Stands in for both the Storage and Tokens services."""

    def __init__(self):
        self.files: dict[str, dict] = {}
        self.created: list[dict] = []
        self.deleted: list[str] = []
        self.tokens: list[dict] = []
        self.downloaded: list[str] = []
        self.storage = FakeStorage(self)
        self._monkey = None

    def install(self, monkeypatch) -> None:
        self._monkey = monkeypatch
        monkeypatch.setattr(aws, "appwrite_configured", lambda: True)
        monkeypatch.setattr(aws, "_storage", lambda: self.storage)
        monkeypatch.setattr(aws, "_tokens", lambda: self.storage if self.storage._token_service else None)

    @property
    def settings(self):
        return get_settings()


@pytest.fixture
def fake_appwrite(monkeypatch, settings_override):
    fake = FakeAppwrite()
    # Credentials must look configured or the code paths short-circuit.
    settings_override(
        appwrite_endpoint="https://fra.cloud.appwrite.io/v1",
        appwrite_project_id="proj_test",
        appwrite_api_key="standard_test_key",
        appwrite_bucket_id="bucket_test",
    )
    fake.install(monkeypatch)
    return fake


@pytest.fixture
def master_file(tmp_path) -> Path:
    p = tmp_path / "master.wav"
    p.write_bytes(b"RIFF....WAVEfmt ")
    return p


def _not_found() -> AppwriteException:
    return AppwriteException("Not found", 404, "storage_file_not_found", "File not found")


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------
def test_appwrite_disabled_is_not_a_failure(master_file):
    """Not configured => empty updates, so the job reports state 'none' not 'failed'."""
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(aws, "appwrite_configured", lambda: False)
        assert aws.upload_master_for_job("job-1", master_file) == {}


def test_jobs_root_matches_settings_data_dir():
    assert aws.jobs_root() == get_settings().data_dir / "jobs"


# --------------------------------------------------------------------------
# upload_master
# --------------------------------------------------------------------------
def test_upload_master_records_metadata(fake_appwrite, master_file):
    meta = aws.upload_master("job-abc", master_file)

    assert meta["appwrite_state"] == "uploaded"
    assert meta["appwrite_file_id"]
    assert meta["appwrite_error"] is None
    assert meta["appwrite_created_at"] < meta["appwrite_expires_at"]
    # TTL honoured from settings.
    delta = meta["appwrite_expires_at"] - meta["appwrite_created_at"]
    assert delta == timedelta(hours=aws.get_settings().appwrite_ttl_hours)
    # Stored under masters/<job_id>, bucket left private (no file-level ACL).
    assert fake_appwrite.created[0]["folder"] == "masters/job-abc"
    assert fake_appwrite.created[0]["permissions"] is None


def test_upload_master_mints_file_token(fake_appwrite, master_file):
    meta = aws.upload_master("job-abc", master_file)
    url = meta["appwrite_download_url"]
    assert url is not None
    assert "project=proj_test" in url
    assert "token=secret-" in url
    assert "/files/" in url and "/view?" in url
    assert f"/storage/buckets/bucket_test/files/{meta['appwrite_file_id']}/view" in url


def test_upload_master_token_failure_keeps_file(fake_appwrite, master_file):
    """A token failure must not discard the upload, and must not leak the error."""
    fake_appwrite.storage.fail_token = AppwriteException("nope", 401, "unauthorized", "Unauthorized")
    meta = aws.upload_master("job-abc", master_file)

    assert meta["appwrite_state"] == "uploaded"
    assert meta["appwrite_file_id"] in fake_appwrite.files
    assert meta["appwrite_download_url"] is None


def test_upload_master_failure_is_sanitized(fake_appwrite, master_file):
    fake_appwrite.storage.fail_upload = AppwriteException("boom", 401, "general_unauthorized", "Unauthorized")
    meta = aws.upload_master_for_job("job-abc", master_file)

    assert meta["appwrite_state"] == "failed"
    assert meta["appwrite_file_id"] is None
    # The message must describe the error without echoing the API key.
    assert "401" in meta["appwrite_error"]
    assert "standard_test_key" not in meta["appwrite_error"]


def test_upload_master_rejects_bad_job_id(fake_appwrite, master_file):
    meta = aws.upload_master_for_job("../escape", master_file)
    assert meta["appwrite_state"] == "failed"
    assert "Invalid job id" in meta["appwrite_error"]
    assert fake_appwrite.created == []


def test_upload_master_rejects_non_wav(fake_appwrite, tmp_path):
    other = tmp_path / "master.mp3"
    other.write_bytes(b"x")
    meta = aws.upload_master_for_job("job-abc", other)
    assert meta["appwrite_state"] == "failed"
    assert "non-master format" in meta["appwrite_error"]


def test_upload_master_requires_existing_file(fake_appwrite, tmp_path):
    meta = aws.upload_master_for_job("job-abc", tmp_path / "nope.wav")
    assert meta["appwrite_state"] == "failed"
    assert "not found" in meta["appwrite_error"]


# --------------------------------------------------------------------------
# refresh / delete
# --------------------------------------------------------------------------
def test_refresh_replaces_previous_file(fake_appwrite, master_file):
    first = aws.upload_master("job-abc", master_file)
    second = aws.refresh_master_for_job("job-abc", master_file, first["appwrite_file_id"])

    assert first["appwrite_file_id"] in fake_appwrite.deleted
    assert second["appwrite_file_id"] != first["appwrite_file_id"]
    assert len(fake_appwrite.files) == 1


def test_refresh_keeps_previous_master_when_delete_fails(fake_appwrite, master_file):
    """If the old file can't be removed, don't upload a second copy."""
    first = aws.upload_master("job-abc", master_file)
    fake_appwrite.storage.fail_delete = AppwriteException("boom", 500, "general_internal", "Internal")

    assert aws.refresh_master_for_job("job-abc", master_file, first["appwrite_file_id"]) is None
    assert len(fake_appwrite.created) == 1  # no second upload


def test_delete_file_is_idempotent(fake_appwrite):
    fake_appwrite.files["f1"] = {"name": "master.wav"}
    assert aws.delete_file_by_id("f1") is True
    # Already gone: 404 counts as success so cleanup can retry safely.
    assert aws.delete_file_by_id("f1") is True


def test_delete_file_safe_retries_then_gives_up(fake_appwrite, monkeypatch, run_async):
    fake_appwrite.storage.fail_delete = AppwriteException("boom", 500, "general_internal", "Internal")
    monkeypatch.setattr(aws.asyncio, "sleep", _no_sleep)
    assert run_async(aws.delete_file_safe("f1", retries=2)) is False
    assert fake_appwrite.deleted == ["f1", "f1", "f1"]


async def _no_sleep(_seconds):
    return None


def test_stream_master_uses_server_key(fake_appwrite, master_file):
    meta = aws.upload_master("job-abc", master_file)
    assert b"".join(aws.stream_master(meta["appwrite_file_id"])) == b"RIFFfakewavdata"
    assert fake_appwrite.downloaded == [meta["appwrite_file_id"]]


# --------------------------------------------------------------------------
# Local purge
# --------------------------------------------------------------------------
def _make_job_files(job_dir: Path) -> None:
    (job_dir / "master.wav").write_bytes(b"m")
    (job_dir / "master_playback.wav").write_bytes(b"p")
    (job_dir / "input.wav").write_bytes(b"i")
    (job_dir / "exports").mkdir()
    (job_dir / "exports" / "master_spotify.flac").write_bytes(b"e")
    (job_dir / "streaming_sim").mkdir()
    (job_dir / "streaming_sim" / "mono.wav").write_bytes(b"s")
    (job_dir / "mastering_context.json").write_text("{}")


def test_purge_local_master_keeps_input_and_context(fake_appwrite, tmp_path):
    job_dir = tmp_path / "job-1"
    job_dir.mkdir()
    _make_job_files(job_dir)

    removed = aws.purge_local_master(job_dir)

    assert set(removed) == {"master.wav", "master_playback.wav", "exports", "streaming_sim"}
    assert not (job_dir / "master.wav").exists()
    assert not (job_dir / "exports").exists()
    # The user's upload and the DSP context survive: re-rendering still works.
    assert (job_dir / "input.wav").exists()
    assert (job_dir / "mastering_context.json").exists()


def test_purge_local_master_can_also_drop_input(fake_appwrite, tmp_path, settings_override):
    settings_override(appwrite_purge_local_input=True)
    job_dir = tmp_path / "job-2"
    job_dir.mkdir()
    _make_job_files(job_dir)

    removed = aws.purge_local_master(job_dir)

    assert "input.wav" in removed
    assert not (job_dir / "input.wav").exists()


def test_purge_local_master_tolerates_missing_dir(fake_appwrite, tmp_path):
    assert aws.purge_local_master(tmp_path / "nope") == []


# --------------------------------------------------------------------------
# Cleanup loop
# --------------------------------------------------------------------------
def _write_meta(job_dir: Path, **overrides) -> None:
    meta = {
        "job_id": job_dir.name,
        "status": "completed",
        "appwrite_state": "uploaded",
        "appwrite_file_id": "file-1",
        "appwrite_created_at": (datetime.now(timezone.utc) - timedelta(hours=13)).isoformat(),
        "appwrite_expires_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
        "appwrite_download_url": "https://appwrite.example/view?token=secret",
        "appwrite_error": None,
    }
    meta.update(overrides)
    (job_dir / "metadata.json").write_text(json.dumps(meta))


def test_cleanup_expires_master_and_purges_local(fake_appwrite, run_async):
    job_dir = aws.jobs_root() / "expired-job"
    job_dir.mkdir(parents=True, exist_ok=True)
    _make_job_files(job_dir)
    _write_meta(job_dir)
    fake_appwrite.files["file-1"] = {"name": "master.wav"}

    try:
        stats = run_async(aws.run_appwrite_cleanup_once())

        assert stats["scanned"] == 1
        assert stats["deleted"] == 1
        assert stats["errors"] == 0
        assert stats["purged"] == 4
        # Cloud file gone and local derived artifacts purged.
        assert fake_appwrite.files == {}
        assert not (job_dir / "master.wav").exists()
        assert not (job_dir / "exports").exists()
        assert (job_dir / "input.wav").exists()
        # Disk metadata is the source of truth for the next pass.
        meta = json.loads((job_dir / "metadata.json").read_text())
        assert meta["appwrite_state"] == "expired"
        assert meta["appwrite_file_id"] is None
        assert meta["appwrite_download_url"] is None
    finally:
        import shutil

        shutil.rmtree(job_dir, ignore_errors=True)


def test_cleanup_skips_unexpired(fake_appwrite, run_async):
    job_dir = aws.jobs_root() / "fresh-job"
    job_dir.mkdir(parents=True, exist_ok=True)
    _make_job_files(job_dir)
    _write_meta(
        job_dir,
        appwrite_expires_at=(datetime.now(timezone.utc) + timedelta(hours=5)).isoformat(),
    )
    fake_appwrite.files["file-1"] = {"name": "master.wav"}

    try:
        stats = run_async(aws.run_appwrite_cleanup_once())
        assert stats["scanned"] == 0
        assert (job_dir / "master.wav").exists()
        assert "file-1" in fake_appwrite.files
    finally:
        import shutil

        shutil.rmtree(job_dir, ignore_errors=True)


def test_cleanup_is_idempotent(fake_appwrite, run_async):
    job_dir = aws.jobs_root() / "idempotent-job"
    job_dir.mkdir(parents=True, exist_ok=True)
    _make_job_files(job_dir)
    _write_meta(job_dir)
    fake_appwrite.files["file-1"] = {"name": "master.wav"}

    try:
        run_async(aws.run_appwrite_cleanup_once())
        second = run_async(aws.run_appwrite_cleanup_once())
        # Second pass sees state 'expired' and does nothing.
        assert second == {"scanned": 0, "deleted": 0, "errors": 0, "purged": 0}
    finally:
        import shutil

        shutil.rmtree(job_dir, ignore_errors=True)


def test_cleanup_noop_when_unconfigured(monkeypatch, run_async):
    monkeypatch.setattr(aws, "appwrite_configured", lambda: False)
    assert run_async(aws.run_appwrite_cleanup_once()) == {
        "scanned": 0,
        "deleted": 0,
        "errors": 0,
        "purged": 0,
    }


def test_cleanup_updates_resident_record(fake_appwrite, run_async):
    """An in-memory record must be flipped to 'expired' too, not just disk."""
    job_id = "resident-job"
    job_dir = aws.jobs_root() / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    _make_job_files(job_dir)
    _write_meta(job_dir, appwrite_file_id="file-1")

    rec = JobRecord(
        job_id=job_id,
        input_path=job_dir / "input.wav",
        master_path=job_dir / "master.wav",
        appwrite_state="uploaded",
        appwrite_file_id="file-1",
        appwrite_expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    job_store._jobs[job_id] = rec
    fake_appwrite.files["file-1"] = {"name": "master.wav"}

    try:
        run_async(aws.run_appwrite_cleanup_once())
        assert rec.appwrite_state == "expired"
        assert rec.appwrite_file_id is None
        assert rec.appwrite_download_url is None
    finally:
        job_store._jobs.pop(job_id, None)
        import shutil

        shutil.rmtree(job_dir, ignore_errors=True)


# --------------------------------------------------------------------------
# Ephemeral jobs
# --------------------------------------------------------------------------
def test_ephemeral_job_persists_appwrite_tracking(fake_appwrite, run_async):
    """An ephemeral job's cloud master must still be discoverable for cleanup.

    This is the regression guard for the bug where the upload was gated on
    `not ephemeral` — the real UI always sets ephemeral, so nothing was ever
    stored and the tracking metadata was never written to disk.
    """

    async def _scenario():
        rec = await job_store.create_job(
            get_settings().data_dir,
            ephemeral=True,
            user_id=None,
            user_role="ADMIN",
        )
        master = rec.input_path.parent / "master.wav"
        master.write_bytes(b"RIFF....WAVEfmt ")

        updates = aws.upload_master_for_job(rec.job_id, master)
        await job_store.update(rec.job_id, master_path=master, **updates)
        return rec.job_id, rec.input_path.parent

    job_id, job_dir = run_async(_scenario())

    try:
        meta = json.loads((job_dir / "metadata.json").read_text())
        assert meta["appwrite_state"] == "uploaded"
        assert meta["appwrite_file_id"]
        assert meta["appwrite_expires_at"]
        # Only the tracking keys are persisted — no bulk analysis payload.
        assert "analysis" not in meta
    finally:
        run_async(delete_job_by_id(job_id))


def test_delete_job_removes_cloud_master(fake_appwrite, run_async):
    async def _scenario():
        rec = await job_store.create_job(
            get_settings().data_dir, ephemeral=False, user_id=None, user_role="ADMIN"
        )
        master = rec.input_path.parent / "master.wav"
        master.write_bytes(b"RIFF....WAVEfmt ")
        file_id = aws.upload_master_for_job(rec.job_id, master)["appwrite_file_id"]
        await job_store.update(
            rec.job_id, master_path=master, appwrite_state="uploaded", appwrite_file_id=file_id
        )
        await delete_job_by_id(rec.job_id)
        return rec.job_id, file_id

    job_id, file_id = run_async(_scenario())

    assert file_id in fake_appwrite.deleted
    assert fake_appwrite.files == {}
    assert job_id not in job_store._jobs


# --------------------------------------------------------------------------
# HTTP surface
# --------------------------------------------------------------------------
def test_result_reports_master_state(client, seed_job, fake_appwrite):
    """The result payload must describe the cloud copy so the UI can link it."""
    rec = seed_job(with_master=True)
    rec.user_role = "ADMIN"
    meta = aws.upload_master_for_job(rec.job_id, rec.master_path)
    for k, v in meta.items():
        setattr(rec, k, v)

    body = client.get(f"/api/jobs/{rec.job_id}/result").json()

    assert body["master"] is not None
    assert body["master"]["state"] == "uploaded"
    assert body["master"]["filename"] == "master.wav"
    assert body["master"]["file_id"]
    assert body["master"]["expires_at"]
    assert "token=secret-" in body["master"]["download_url"]


def test_result_master_state_none_when_not_configured(client, seed_job):
    rec = seed_job(with_master=True)
    body = client.get(f"/api/jobs/{rec.job_id}/result").json()
    assert body["master"]["state"] == "none"
    assert body["master"]["download_url"] is None


def test_download_route_streams_from_appwrite(client, seed_job, fake_appwrite):
    rec = seed_job(with_master=True)
    meta = aws.upload_master_for_job(rec.job_id, rec.master_path)
    for k, v in meta.items():
        setattr(rec, k, v)

    resp = client.get(f"/api/jobs/{rec.job_id}/master/download", follow_redirects=False)

    assert resp.status_code == 200
    assert resp.headers["content-disposition"].endswith('master.wav"')
    assert resp.content == b"RIFFfakewavdata"


def test_download_route_proxies_when_no_token(client, seed_job, fake_appwrite):
    """No token => stream through the backend rather than dead-ending."""
    rec = seed_job(with_master=True)
    fake_appwrite.storage.fail_token = AppwriteException("nope", 401, "unauthorized", "Unauthorized")
    meta = aws.upload_master_for_job(rec.job_id, rec.master_path)
    for k, v in meta.items():
        setattr(rec, k, v)
    assert meta["appwrite_download_url"] is None

    resp = client.get(f"/api/jobs/{rec.job_id}/master/download")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert resp.content == b"RIFFfakewavdata"
    assert meta["appwrite_file_id"] in fake_appwrite.downloaded


def test_download_route_falls_back_to_local_when_unconfigured(client, seed_job):
    rec = seed_job(with_master=True)
    resp = client.get(f"/api/jobs/{rec.job_id}/master/download")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"


def test_download_route_410_after_expiry(client, seed_job):
    rec = seed_job(with_master=True)
    rec.appwrite_expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    resp = client.get(f"/api/jobs/{rec.job_id}/master/download")
    assert resp.status_code == 410


def test_expired_master_gates_files_and_artifacts(client, seed_job):
    rec = seed_job(with_master=True)
    rec.appwrite_expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    (rec.input_path.parent / "exports").mkdir()
    (rec.input_path.parent / "exports" / "master_spotify.flac").write_bytes(b"x")

    assert client.get(f"/api/jobs/{rec.job_id}/files/master").status_code == 410
    assert client.get(f"/api/jobs/{rec.job_id}/files/master_wav").status_code == 410
    assert client.get(f"/api/jobs/{rec.job_id}/artifacts/master.wav").status_code == 410
    assert client.get(f"/api/jobs/{rec.job_id}/artifacts/exports/master_spotify.flac").status_code == 410
    # Non-gated artifacts and the user's own upload stay reachable.
    assert client.get(f"/api/jobs/{rec.job_id}/files/input").status_code == 200
    assert client.get(f"/api/jobs/{rec.job_id}/artifacts/input.wav").status_code == 200


def test_expired_master_gates_ephemeral_job_artifacts(client, seed_job):
    """Ephemeral jobs are purged on expiry too, so they are gated the same way."""
    rec = seed_job(with_master=True, ephemeral=True)
    rec.appwrite_expires_at = datetime.now(timezone.utc) - timedelta(hours=1)

    assert client.get(f"/api/jobs/{rec.job_id}/artifacts/master.wav").status_code == 410
    assert client.get(f"/api/jobs/{rec.job_id}/files/master").status_code == 410
    assert client.get(f"/api/jobs/{rec.job_id}/master/download").status_code == 410


def test_artifact_not_gated_before_expiry(client, seed_job):
    rec = seed_job(with_master=True)
    rec.appwrite_expires_at = datetime.now(timezone.utc) + timedelta(hours=5)
    assert client.get(f"/api/jobs/{rec.job_id}/artifacts/master.wav").status_code == 200


def test_stream_master_rechunks_buffered_bytes(fake_appwrite, monkeypatch):
    """Regression: the SDK returns `bytes`, not a stream.

    Handing raw bytes to StreamingResponse makes Starlette iterate ints, which
    blows up at response time. stream_master must yield byte chunks, and it must
    yield more than one for anything larger than the chunk size.
    """
    payload = b"RIFF" + b"\x00" * (aws.STREAM_CHUNK_BYTES * 2 + 7)
    monkeypatch.setattr(fake_appwrite.storage, "get_file_download", lambda **kw: payload)

    chunks = list(aws.stream_master("f1"))

    assert b"".join(chunks) == payload
    assert all(isinstance(c, bytes) for c in chunks)
    assert len(chunks) == 3


def test_stream_master_handles_empty_body(fake_appwrite, monkeypatch):
    monkeypatch.setattr(fake_appwrite.storage, "get_file_download", lambda **kw: b"")
    assert list(aws.stream_master("f1")) == []
