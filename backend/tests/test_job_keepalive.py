"""Ephemeral jobs must survive while in use (regression: deleted mid-edit)."""
from __future__ import annotations

import asyncio

from services.job_store import job_store, schedule_delete, touch_job


def test_touch_postpones_pending_delete(seed_job, run_async):
    rec = seed_job(ephemeral=True)

    async def scenario():
        await schedule_delete(rec.job_id, delay_secs=0.3)
        await asyncio.sleep(0.2)
        await touch_job(rec.job_id, delay_secs=0.3)  # user still active
        await asyncio.sleep(0.2)  # past the original deadline
        alive_mid = rec.job_id in job_store._jobs
        await asyncio.sleep(0.25)  # idle long enough → deleted
        return alive_mid, rec.job_id in job_store._jobs

    alive_mid, alive_end = run_async(scenario())
    assert alive_mid is True
    assert alive_end is False
    assert not rec.input_path.parent.exists()


def test_touch_without_pending_delete_is_noop(seed_job, run_async):
    rec = seed_job(ephemeral=True)
    run_async(touch_job(rec.job_id, delay_secs=0.01))
    assert rec.job_id not in job_store._pending_deletes
    assert rec.job_id in job_store._jobs


def test_api_requests_touch_the_job(client, seed_job, monkeypatch):
    import api.main as main

    rec = seed_job(ephemeral=True)
    touched = []

    async def fake_touch(job_id, delay_secs=600):
        touched.append(job_id)

    monkeypatch.setattr(main, "touch_job", fake_touch)
    client.get(f"/api/jobs/{rec.job_id}/status")
    client.get(f"/api/jobs/{rec.job_id}/master/download")
    client.delete(f"/api/jobs/{rec.job_id}")  # deleting must not "keep alive"
    client.get("/api/health")
    assert touched == [rec.job_id, rec.job_id]
