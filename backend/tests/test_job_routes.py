"""Tests for job + misc routes defined in api/main.py."""
from __future__ import annotations

import asyncio

import api.main as main
from api.schemas import JobStatus
from auth.schemas import UserRole
from services.job_store import JobRecord, job_store
from utils.config import get_settings


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_create_job_requires_auth(client, sample_wav):
    resp = client.post(
        "/api/jobs",
        files={"file": ("song.wav", sample_wav(), "audio/wav")},
    )
    assert resp.status_code == 401


def test_create_job_success(client, rollout_headers, sample_wav, monkeypatch):
    monkeypatch.setattr(main, "process_job", lambda *a, **k: None)
    resp = client.post(
        "/api/jobs",
        headers=rollout_headers,
        files={"file": ("song.wav", sample_wav(), "audio/wav")},
    )
    assert resp.status_code == 200
    assert resp.json()["job_id"]


def test_create_job_rejects_unsupported_extension(client, rollout_headers, sample_wav, monkeypatch):
    monkeypatch.setattr(main, "process_job", lambda *a, **k: None)
    resp = client.post(
        "/api/jobs",
        headers=rollout_headers,
        files={"file": ("song.mp3", sample_wav(), "audio/mpeg")},
    )
    assert resp.status_code == 400


def test_create_job_missing_file(client, rollout_headers):
    resp = client.post("/api/jobs", headers=rollout_headers)
    assert resp.status_code == 422


def test_job_status_not_found(client):
    assert client.get("/api/jobs/does-not-exist/status").status_code == 404


def test_job_status_found(client, seed_job):
    rec = seed_job(status=JobStatus.mastering)
    resp = client.get(f"/api/jobs/{rec.job_id}/status")
    assert resp.status_code == 200
    assert resp.json()["status"] == "mastering"


def test_job_result_not_found(client):
    assert client.get("/api/jobs/nope/result").status_code == 404


def test_job_result_not_completed(client, seed_job):
    rec = seed_job(status=JobStatus.mastering)
    resp = client.get(f"/api/jobs/{rec.job_id}/result")
    assert resp.status_code == 409


def test_job_result_completed(client, seed_job):
    rec = seed_job(status=JobStatus.completed, user_role=UserRole.ADMIN.value)
    resp = client.get(f"/api/jobs/{rec.job_id}/result")
    assert resp.status_code == 200
    body = resp.json()
    assert body["job_id"] == rec.job_id
    assert body["master_wav_url"].endswith("/files/master_wav")
    assert body["master_playback_url"].endswith("/files/master")


def test_completed_result_restores_report_and_intents_from_disk(client, sample_wav):
    """Persistent jobs free analysis/intents/report from memory at completion;
    the result payload must hydrate them from the on-disk metadata."""
    settings = get_settings()
    rec = JobRecord(
        job_id=__import__("uuid").uuid4().hex,
        status=JobStatus.mastering,
        user_role=UserRole.ADMIN.value,
        ephemeral=False,
    )
    job_dir = settings.data_dir / "jobs" / rec.job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    rec.input_path = job_dir / "input.wav"
    rec.input_path.write_bytes(sample_wav())
    rec.master_path = job_dir / "master.wav"
    rec.master_path.write_bytes(sample_wav())
    job_store._jobs[rec.job_id] = rec

    async def complete():
        await job_store.update(
            rec.job_id,
            report={"mix_assessment": "bright and punchy", "final_summary": "ready"},
            analysis={"lufs": -14.0, "duration_sec": 1.0},
            safe_intent={"final_notes": ["polished"]},
            raw_intent={"raw": "yes"},
        )
        await job_store.update(
            rec.job_id,
            status=JobStatus.completed,
            progress=1.0,
            master_path=rec.master_path,
        )

    asyncio.run(complete())
    assert rec.report is None  # in-memory fields were freed (the original bug)

    resp = client.get(f"/api/jobs/{rec.job_id}/result")
    assert resp.status_code == 200
    body = resp.json()
    assert body["report"]["mix_assessment"] == "bright and punchy"
    assert body["report"]["final_summary"] == "ready"
    assert body["analysis"]["lufs"] == -14.0
    assert body["safe_intent"]["final_notes"] == ["polished"]
    assert body["raw_intent"] == {"raw": "yes"}


def test_result_waveform_peaks_from_temporal(client, seed_job):
    rec = seed_job(status=JobStatus.completed, user_role=UserRole.ADMIN.value)
    rec.analysis = {"temporal_analysis": [{"rms": 0.1}, {"rms": 0.5}, {"rms": 0.2}]}
    resp = client.get(f"/api/jobs/{rec.job_id}/result")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["waveform_peaks"]) == 100
    assert max(body["waveform_peaks"]) == 1.0


def test_rollout_result_keeps_waveform_peaks(client, seed_job):
    rec = seed_job(status=JobStatus.completed, user_role=UserRole.ROLLOUT.value)
    rec.analysis = {"temporal_analysis": [{"rms": 0.1}, {"rms": 0.5}, {"rms": 0.2}]}
    resp = client.get(f"/api/jobs/{rec.job_id}/result")
    assert resp.status_code == 200
    body = resp.json()
    assert body["analysis"] == {}
    assert len(body["waveform_peaks"]) == 100
    assert max(body["waveform_peaks"]) == 1.0


def test_job_artifact_path_traversal_blocked(client, seed_job):
    rec = seed_job()
    # A traversal attempt must never return an out-of-bounds file (200).
    resp = client.get(
        f"/api/jobs/{rec.job_id}/artifacts/..%2f..%2fsecret.txt",
        headers={"x-test": "traversal"},
    )
    assert resp.status_code != 200


def test_job_artifact_not_found(client, seed_job):
    rec = seed_job()
    resp = client.get(f"/api/jobs/{rec.job_id}/artifacts/missing.wav")
    assert resp.status_code == 404


def test_job_artifact_success(client, seed_job):
    rec = seed_job()
    resp = client.get(f"/api/jobs/{rec.job_id}/artifacts/master.wav")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"


def test_job_file_unknown_kind(client, seed_job):
    rec = seed_job()
    resp = client.get(f"/api/jobs/{rec.job_id}/files/bogus")
    assert resp.status_code == 404


def test_job_file_not_found_job(client):
    assert client.get("/api/jobs/nope/files/master").status_code == 404


def test_job_file_master_success(client, seed_job):
    rec = seed_job(with_master=True)
    resp = client.get(f"/api/jobs/{rec.job_id}/files/master")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"


def test_job_file_master_prefers_playback_wav(client, seed_job):
    import io

    import numpy as np
    import soundfile as sf

    rec = seed_job(with_master=True)
    n = int(1.0 * 44100)
    y = np.sin(2 * np.pi * 440 * (np.arange(n) / 44100)).astype("float32")
    buf = io.BytesIO()
    sf.write(buf, y, 44100, format="WAV", subtype="PCM_16")
    buf.seek(0)
    playback = rec.master_path.with_name("master_playback.wav")
    playback.write_bytes(buf.read())

    resp = client.get(f"/api/jobs/{rec.job_id}/files/master")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert "master_playback.wav" in resp.headers["content-disposition"]


def test_job_file_master_wav_always_wav(client, seed_job):
    rec = seed_job(with_master=True)
    rec.master_path.with_name("master_playback.wav").write_bytes(b"playback")

    resp = client.get(f"/api/jobs/{rec.job_id}/files/master_wav")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert "master.wav" in resp.headers["content-disposition"]


def test_job_file_master_unavailable(client, seed_job):
    rec = seed_job(with_master=False)
    resp = client.get(f"/api/jobs/{rec.job_id}/files/master")
    assert resp.status_code == 404


def test_delete_job_not_found(client):
    resp = client.delete("/api/jobs/does-not-exist")
    assert resp.status_code == 200
    assert resp.json()["status"] == "not_found"


def test_delete_job_success(client, seed_job):
    rec = seed_job()
    resp = client.delete(f"/api/jobs/{rec.job_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"
