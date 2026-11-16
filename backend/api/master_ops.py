"""Shared helpers for anything that replaces a job's master (finalize, studio commit/revert)."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from auth.schemas import UserRole
from exports.pcm_export import export_all_artifacts
from services.appwrite_storage import refresh_master_for_job
from services.job_store import JobRecord, job_store

# Serialize re-renders per job so slider spam / repeated commits can't stack renders.
_render_locks: dict[str, asyncio.Lock] = {}


def render_lock(job_id: str) -> asyncio.Lock:
    lock = _render_locks.get(job_id)
    if lock is None:
        lock = asyncio.Lock()
        _render_locks[job_id] = lock
    return lock


async def publish_master(rec: JobRecord, master_path: Path) -> dict[str, Any]:
    """Regenerate exports/simulations from `master_path` and refresh the Appwrite copy.

    Returns the job_store update kwargs (caller applies them, typically together
    with finalizing=False). Must be called while holding `render_lock(job_id)`.
    """
    job_id = rec.job_id
    job_dir = master_path.parent
    exports: list[dict[str, str]] = []
    notes: list[str] = []
    if rec.user_role != UserRole.ROLLOUT.value:
        exports_list, notes = await asyncio.to_thread(
            export_all_artifacts,
            master_path,
            job_dir / "exports",
            job_dir / "streaming_sim",
        )
        for item in exports_list:
            p = Path(item["path"]).resolve()
            rel = p.relative_to(job_dir.resolve()).as_posix()
            exports.append({**item, "download_url": f"/api/jobs/{job_id}/artifacts/{rel}"})

    # Replace the stored cloud master (delete old Appwrite file, upload new,
    # fresh retention window). Not gated on `ephemeral`: the real UI flow always
    # sets it, so gating would mean nothing is ever uploaded.
    appwrite_updates: dict[str, Any] = {}
    if master_path.exists():
        appwrite_updates = (
            await asyncio.to_thread(
                refresh_master_for_job,
                job_id,
                master_path,
                rec.appwrite_file_id,
                rec.original_filename,
            )
        ) or {}
    return {"master_path": master_path, "exports": exports, "streaming_notes": notes, **appwrite_updates}


async def finish_publish(job_id: str, updates: dict[str, Any]) -> None:
    await job_store.update(
        job_id,
        message="Done",
        finalizing=False,
        finalize_error=None,
        **updates,
    )
