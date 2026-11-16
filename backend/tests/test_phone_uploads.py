"""Phone-format uploads and style_family on job creation / remaster."""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

import api.main as main
from api.schemas import JobStatus
from auth.schemas import UserRole
from services.job_store import job_store


def _tone(seconds: float = 1.0, sr: int = 44100) -> np.ndarray:
    t = np.arange(int(seconds * sr)) / sr
    return (0.2 * np.sin(2 * np.pi * 440 * t)).astype("float32")


def _mp3_bytes() -> bytes:
    buf = io.BytesIO()
    sf.write(buf, _tone(), 44100, format="MP3")
    return buf.getvalue()


def _m4a_bytes(tmp_path: Path) -> bytes:
    av = pytest.importorskip("av")
    out = tmp_path / "phone.m4a"
    y = _tone()
    with av.open(str(out), "w", format="mp4") as container:
        stream = container.add_stream("aac", rate=44100)
        stream.layout = "mono"
        frame = av.AudioFrame.from_ndarray(y.reshape(1, -1), format="flt", layout="mono")
        frame.sample_rate = 44100
        for packet in stream.encode(frame):
            container.mux(packet)
        for packet in stream.encode(None):
            container.mux(packet)
    return out.read_bytes()


def _capture_process_job(monkeypatch):
    calls = []
    monkeypatch.setattr(main, "process_job", lambda *a, **k: calls.append(a))
    return calls


def _post(client, headers, name, data, mime, **form):
    return client.post("/api/jobs", headers=headers, files={"file": (name, data, mime)}, data=form)


def test_mp3_upload_is_decoded_and_flagged_lossy(client, rollout_headers, monkeypatch):
    _capture_process_job(monkeypatch)
    resp = _post(client, rollout_headers, "riyaz.mp3", _mp3_bytes(), "audio/mpeg")
    assert resp.status_code == 200, resp.text
    rec = job_store._jobs[resp.json()["job_id"]]
    assert rec.source_format == "mp3" and rec.source_lossy is True
    info = sf.info(str(rec.input_path))
    assert info.channels == 2 and info.subtype == "PCM_24"
    assert info.duration == pytest.approx(1.0, abs=0.1)


def test_m4a_upload_uses_pyav_fallback(client, rollout_headers, monkeypatch, tmp_path):
    _capture_process_job(monkeypatch)
    resp = _post(client, rollout_headers, "voice-memo.m4a", _m4a_bytes(tmp_path), "audio/mp4")
    assert resp.status_code == 200, resp.text
    rec = job_store._jobs[resp.json()["job_id"]]
    assert rec.source_format == "m4a" and rec.source_lossy is True
    assert sf.info(str(rec.input_path)).duration == pytest.approx(1.0, abs=0.1)


def test_wav_upload_is_not_lossy(client, rollout_headers, sample_wav, monkeypatch):
    _capture_process_job(monkeypatch)
    resp = _post(client, rollout_headers, "song.wav", sample_wav(), "audio/wav")
    rec = job_store._jobs[resp.json()["job_id"]]
    assert rec.source_lossy is False and rec.style_family == "auto"


def test_corrupt_phone_file_is_rejected(client, rollout_headers, monkeypatch):
    _capture_process_job(monkeypatch)
    resp = _post(client, rollout_headers, "broken.m4a", b"not audio at all", "audio/mp4")
    assert resp.status_code == 400


def test_style_family_kept_for_rollout_users(client, rollout_headers, sample_wav, monkeypatch):
    _capture_process_job(monkeypatch)
    resp = _post(client, rollout_headers, "alaap.wav", sample_wav(), "audio/wav", style_family="indian_classical")
    assert resp.status_code == 200
    assert job_store._jobs[resp.json()["job_id"]].style_family == "indian_classical"


def test_unknown_style_family_rejected(client, rollout_headers, sample_wav, monkeypatch):
    calls = _capture_process_job(monkeypatch)
    resp = _post(client, rollout_headers, "song.wav", sample_wav(), "audio/wav", style_family="k-pop")
    assert resp.status_code == 400
    assert not calls


def test_remaster_inherits_or_overrides_style(client, seed_job, admin_headers, monkeypatch):
    _capture_process_job(monkeypatch)
    rec = seed_job(status=JobStatus.completed, user_role=UserRole.ADMIN.value)
    rec.style_family = "devotional"
    rec.source_lossy = True

    resp = client.post(f"/api/jobs/{rec.job_id}/remaster", headers=admin_headers, json={"prompt": "warmer"})
    assert resp.status_code == 200, resp.text
    new = job_store._jobs[resp.json()["job_id"]]
    assert new.style_family == "devotional" and new.source_lossy is True

    resp = client.post(
        f"/api/jobs/{rec.job_id}/remaster",
        headers=admin_headers,
        json={"prompt": "warmer", "style_family": "film_melodic"},
    )
    assert job_store._jobs[resp.json()["job_id"]].style_family == "film_melodic"
