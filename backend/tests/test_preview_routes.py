"""Tests for DSP preview / finalize flows (api/main.py)."""
from __future__ import annotations

import json
from pathlib import Path

import api.main as main
from api.schemas import JobStatus
from auth.schemas import UserRole
from mastering.dsp_params import SafeDSPParams
from mastering.preview import CONTEXT_FILENAME, PARAM_BOUNDS


def _write_context(job_dir: Path) -> None:
    params = SafeDSPParams(
        low_shelf_db=1.0,
        mid_peak_db=0.5,
        high_shelf_db=0.25,
        dynamic_eq_strength=0.4,
        low_ratio=1.5,
        mid_ratio=1.8,
        high_ratio=1.4,
        saturation_amount=0.15,
        stereo_width_factor=1.05,
        transient_blend=0.6,
        target_lufs=-14.0,
        true_peak_ceiling_db=-1.0,
    )
    ctx = {"params": params.__dict__, "analysis": {"sectional_analysis": []}, "platform": "Spotify"}
    (job_dir / CONTEXT_FILENAME).write_text(json.dumps(ctx), encoding="utf-8")


def test_preview_requires_ea_or_admin(client, rollout_headers, seed_job):
    rec = seed_job()
    resp = client.post(f"/api/jobs/{rec.job_id}/preview", json={"overrides": {}}, headers=rollout_headers)
    assert resp.status_code == 403


def test_preview_requires_auth(client, seed_job):
    rec = seed_job()
    resp = client.post(f"/api/jobs/{rec.job_id}/preview", json={"overrides": {}})
    assert resp.status_code == 401


def test_preview_job_not_found(client, early_access_headers):
    resp = client.post("/api/jobs/nope/preview", json={}, headers=early_access_headers)
    assert resp.status_code == 404


def test_preview_not_completed(client, early_access_headers, seed_job):
    rec = seed_job(status=JobStatus.mastering)
    resp = client.post(f"/api/jobs/{rec.job_id}/preview", json={}, headers=early_access_headers)
    assert resp.status_code == 409


def test_preview_missing_context(client, early_access_headers, seed_job):
    rec = seed_job()
    resp = client.post(f"/api/jobs/{rec.job_id}/preview", json={}, headers=early_access_headers)
    assert resp.status_code == 409
    assert "context" in resp.json()["detail"].lower()


def test_preview_rejects_unknown_param(client, early_access_headers, seed_job):
    rec = seed_job()
    _write_context(rec.input_path.parent)
    resp = client.post(
        f"/api/jobs/{rec.job_id}/preview",
        json={"overrides": {"not_a_param": 1.0}},
        headers=early_access_headers,
    )
    assert resp.status_code == 400


def test_preview_renders_segment(client, early_access_headers, seed_job):
    rec = seed_job()
    _write_context(rec.input_path.parent)
    resp = client.post(
        f"/api/jobs/{rec.job_id}/preview",
        json={"overrides": {"low_shelf_db": 2.0}, "segment_sec": 0.5},
        headers=early_access_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["url"].endswith("/artifacts/preview.flac")
    assert body["download_url"].endswith("/artifacts/preview.wav")
    assert body["duration_sec"] > 0
    assert body["is_full"] is False
    assert body["params"]["low_shelf_db"] == 2.0


def test_preview_renders_full_track(client, early_access_headers, seed_job):
    rec = seed_job()
    _write_context(rec.input_path.parent)
    resp = client.post(
        f"/api/jobs/{rec.job_id}/preview",
        json={"overrides": {}, "segment_sec": 0},
        headers=early_access_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["url"].endswith("/artifacts/preview_full.flac")
    assert body["download_url"].endswith("/artifacts/preview_full.wav")
    assert body["is_full"] is True


def test_preview_clamps_overrides(client, early_access_headers, seed_job):
    rec = seed_job()
    _write_context(rec.input_path.parent)
    resp = client.post(
        f"/api/jobs/{rec.job_id}/preview",
        json={"overrides": {"low_shelf_db": 99.0}},
        headers=early_access_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["params"]["low_shelf_db"] == PARAM_BOUNDS["low_shelf_db"][1]


def test_preview_artifact_available(client, early_access_headers, seed_job):
    rec = seed_job()
    _write_context(rec.input_path.parent)
    resp = client.post(
        f"/api/jobs/{rec.job_id}/preview",
        json={"overrides": {}, "segment_sec": 0.5},
        headers=early_access_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    # Playback serves the compact FLAC; download serves the canonical WAV.
    flac = client.get(body["url"])
    assert flac.status_code == 200
    assert flac.headers["content-type"] == "audio/flac"
    wav = client.get(body["download_url"])
    assert wav.status_code == 200
    assert wav.headers["content-type"] == "audio/wav"


def test_finalize_requires_ea(client, rollout_headers, seed_job):
    rec = seed_job()
    resp = client.post(f"/api/jobs/{rec.job_id}/finalize", json={}, headers=rollout_headers)
    assert resp.status_code == 403


def test_finalize_renders_and_updates_exports(client, early_access_headers, seed_job):
    rec = seed_job(user_role=UserRole.EARLY_ACCESS.value)
    _write_context(rec.input_path.parent)
    resp = client.post(
        f"/api/jobs/{rec.job_id}/finalize",
        json={"overrides": {"target_lufs": -12.0}},
        headers=early_access_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["job_id"] == rec.job_id
    assert body["dsp_params"]["target_lufs"] == -12.0
    # master + platform exports should now exist on disk
    assert (rec.input_path.parent / "master.wav").exists()
    assert len(body["exports"]) > 0
    for e in body["exports"]:
        assert e["download_url"].startswith(f"/api/jobs/{rec.job_id}/artifacts/")


def test_finalize_overwrites_master(client, early_access_headers, seed_job):
    rec = seed_job()
    _write_context(rec.input_path.parent)
    before = (rec.input_path.parent / "master.wav").stat().st_mtime_ns
    resp = client.post(
        f"/api/jobs/{rec.job_id}/finalize",
        json={"overrides": {}},
        headers=early_access_headers,
    )
    assert resp.status_code == 200
    assert (rec.input_path.parent / "master.wav").stat().st_mtime_ns != before