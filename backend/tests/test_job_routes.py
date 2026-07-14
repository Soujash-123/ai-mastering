"""Tests for job + misc routes defined in api/main.py."""
from __future__ import annotations

import api.main as main
from api.schemas import JobStatus
from auth.schemas import UserRole


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
    assert body["master_wav_url"].endswith("/files/master")


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
