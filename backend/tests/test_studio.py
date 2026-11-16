"""Mastering Table (BETA): session schema, copilot ops, renderer and routes."""
from __future__ import annotations

import json

import numpy as np
import pytest
import soundfile as sf
from scipy import signal

import studio.agent as agent_mod
from mastering.oversample import true_peak
from mastering.rbj import high_shelf_sos, low_shelf_sos, peaking_sos
from studio.render import comp_gain_db, highpass_sos, render_session
from studio.session import MAX_REGIONS, apply_ops, default_session, normalize_session

SR = 44100


def _sine(seconds: float, amp: float, freq: float = 440.0) -> np.ndarray:
    t = np.arange(int(seconds * SR)) / SR
    y = amp * np.sin(2 * np.pi * freq * t)
    return np.stack([y, y]).astype(np.float32)


def _rms_db(x: np.ndarray) -> float:
    return float(20 * np.log10(np.sqrt(np.mean(x**2)) + 1e-12))


# --- session -----------------------------------------------------------------

def test_normalize_clamps_and_drops_garbage():
    s = normalize_session(
        {
            "modules": {"eq": {"bass_db": 99, "air_db": "nan?"}, "bogus": {"x": 1}, "comp": {"enabled": True}},
            "regions": [
                {"start_sec": 5, "end_sec": 2, "gain_db": 40},  # reversed + clamped
                {"start_sec": 1, "end_sec": 1.1},  # too short
                {"start_sec": "a", "end_sec": 3},  # invalid
            ],
        },
        duration_sec=4.0,
    )
    assert s["modules"]["eq"]["bass_db"] == 6.0
    assert s["modules"]["eq"]["air_db"] == 0.0
    assert s["modules"]["comp"]["enabled"] is True
    assert "bogus" not in s["modules"]
    assert len(s["regions"]) == 1
    r = s["regions"][0]
    assert (r["start_sec"], r["end_sec"], r["gain_db"]) == (2.0, 4.0, 6.0)


def test_region_limit():
    regions = [{"start_sec": i, "end_sec": i + 0.5} for i in range(MAX_REGIONS + 5)]
    assert len(normalize_session({"regions": regions})["regions"]) == MAX_REGIONS


def test_apply_ops_validates_and_reports():
    ops = [
        {"op": "set_param", "module": "warmth", "param": "drive", "value": 7},
        {"op": "set_param", "module": "eq", "param": "nope", "value": 1},
        {"op": "add_region", "start_sec": 10, "end_sec": 20, "gain_db": 2, "label": "Chorus"},
        {"op": "launch_rockets"},
        {"op": "propose_remaster", "overrides": {"mid_ratio": 1.6}, "reason": "less squash"},
    ]
    s, notes, proposals = apply_ops(default_session(), ops, duration_sec=30)
    assert s["modules"]["warmth"] == {**s["modules"]["warmth"], "enabled": True, "drive": 1.0}
    assert len(s["regions"]) == 1 and s["regions"][0]["label"] == "Chorus"
    assert any("Skipped unknown control" in n for n in notes)
    assert any("Skipped unknown action" in n for n in notes)
    assert any("Added region 0:10–0:20" in n for n in notes)
    assert proposals == [{"overrides": {"mid_ratio": 1.6}, "reason": "less squash"}]

    rid = s["regions"][0]["id"]
    s, notes, _ = apply_ops(s, [{"op": "update_region", "id": rid, "gain_db": -1}], 30)
    assert s["regions"][0]["gain_db"] == -1.0
    s, notes, _ = apply_ops(s, [{"op": "remove_region", "id": rid}], 30)
    assert s["regions"] == []


def test_apply_preset_resets_modules():
    s, _, _ = apply_ops(default_session(), [{"op": "apply_preset", "preset": "warmer"}])
    assert s["preset"] == "warmer"
    assert s["modules"]["warmth"]["enabled"] is True
    assert s["modules"]["eq"]["bass_db"] == 1.5


# --- DSP ---------------------------------------------------------------------

def _gain_at(sos: np.ndarray, freq: float) -> float:
    _, h = signal.sosfreqz(sos, worN=[freq], fs=SR)
    return float(20 * np.log10(abs(h[0])))


def test_rbj_filters_match_cookbook_targets():
    # Same cookbook Web Audio's BiquadFilterNode implements.
    assert _gain_at(peaking_sos(3000, 4.0, SR, 0.9), 3000) == pytest.approx(4.0, abs=0.01)
    assert _gain_at(low_shelf_sos(100, 3.0, SR), 10) == pytest.approx(3.0, abs=0.05)
    assert _gain_at(high_shelf_sos(10000, -2.0, SR), 20000) == pytest.approx(-2.0, abs=0.1)
    assert _gain_at(highpass_sos(120, SR), 120) == pytest.approx(-3.01, abs=0.02)


def test_comp_gain_curve():
    gr = comp_gain_db(np.array([-40.0, -10.0]), threshold_db=-20.0, ratio=4.0, knee_db=6.0)
    assert gr[0] == 0.0
    assert gr[1] == pytest.approx(-7.5)  # 10 dB over at 4:1


def test_neutral_session_is_transparent_below_ceiling():
    x = _sine(1.0, 0.1)
    y = render_session(x, SR, default_session())
    assert np.max(np.abs(y - x)) < 1e-3


def test_region_raises_level_only_inside():
    x = _sine(6.0, 0.05)
    s = normalize_session({"regions": [{"start_sec": 2, "end_sec": 4, "gain_db": 3, "fade_ms": 100}]}, 6.0)
    y = render_session(x, SR, s)
    inside = slice(int(2.5 * SR), int(3.5 * SR))
    before = slice(int(0.5 * SR), int(1.5 * SR))
    after = slice(int(4.5 * SR), int(5.5 * SR))
    assert _rms_db(y[:, inside]) - _rms_db(x[:, inside]) == pytest.approx(3.0, abs=0.05)
    assert _rms_db(y[:, before]) == pytest.approx(_rms_db(x[:, before]), abs=0.02)
    assert _rms_db(y[:, after]) == pytest.approx(_rms_db(x[:, after]), abs=0.02)


def test_region_eq_only_inside():
    x = _sine(4.0, 0.05, freq=60.0)
    s = normalize_session({"regions": [{"start_sec": 1, "end_sec": 3, "bass_db": 4, "fade_ms": 100}]}, 4.0)
    y = render_session(x, SR, s)
    inside = slice(int(1.5 * SR), int(2.5 * SR))
    before = slice(int(0.2 * SR), int(0.8 * SR))
    assert _rms_db(y[:, inside]) - _rms_db(x[:, inside]) > 2.5
    assert _rms_db(y[:, before]) == pytest.approx(_rms_db(x[:, before]), abs=0.05)


def test_output_gain_respects_true_peak_ceiling():
    # Music-like crest factor: a body at 0.3 plus drum-like spikes to 0.95.
    x = _sine(1.0, 0.3)
    for k in range(0, SR - 200, SR // 8):
        x[:, k : k + 200] += 0.65 * np.exp(-np.arange(200) / 40.0)
    s = normalize_session({"modules": {"output": {"gain_db": 6.0, "ceiling_db": -1.0}}})
    y = render_session(x, SR, s)
    assert true_peak(y) <= 10 ** (-1.0 / 20) + 1e-4
    assert _rms_db(y) > _rms_db(x)


def test_all_modules_on_is_finite():
    x = _sine(1.0, 0.5)
    s = normalize_session(
        {
            "modules": {
                "eq": {"bass_db": 3, "mud_db": -2, "presence_db": 2, "air_db": 2},
                "comp": {"enabled": True, "amount": 0.8, "ratio": 4},
                "warmth": {"enabled": True, "drive": 1, "mix": 1},
                "width": {"width": 1.4, "bass_mono_hz": 150},
            }
        }
    )
    y = render_session(x, SR, s)
    assert y.shape == x.shape and np.all(np.isfinite(y))


# --- routes ------------------------------------------------------------------

@pytest.mark.parametrize(
    "method,path,body",
    [
        ("get", "", None),
        ("put", "/session", {"session": {}}),
        ("post", "/agent", {"messages": [{"role": "user", "content": "hi"}], "session": {}}),
        ("post", "/commit", {"session": {}}),
        ("post", "/revert", None),
    ],
)
def test_rollout_is_forbidden(client, seed_job, rollout_headers, method, path, body):
    rec = seed_job()
    kwargs = {"headers": rollout_headers}
    if body is not None:
        kwargs["json"] = body
    resp = getattr(client, method)(f"/api/jobs/{rec.job_id}/studio{path}", **kwargs)
    assert resp.status_code == 403


def test_get_studio_for_early_access(client, seed_job, early_access_headers):
    rec = seed_job()
    resp = client.get(f"/api/jobs/{rec.job_id}/studio", headers=early_access_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["session"]["preset"] == "ai_master"
    assert "eq" in body["spec"]["modules"] and "warmer" in body["spec"]["presets"]
    assert len(body["peaks"]) == 1600
    assert "/files/master?v=" in body["base_url"]
    assert body["duration_sec"] == pytest.approx(1.0, abs=0.01)


def test_studio_requires_completed_job(client, seed_job, early_access_headers):
    from api.schemas import JobStatus

    rec = seed_job(status=JobStatus.mastering)
    assert client.get(f"/api/jobs/{rec.job_id}/studio", headers=early_access_headers).status_code == 409


def test_put_session_clamps_and_persists(client, seed_job, admin_headers):
    rec = seed_job()
    resp = client.put(
        f"/api/jobs/{rec.job_id}/studio/session",
        headers=admin_headers,
        json={"session": {"modules": {"output": {"gain_db": 50}}}},
    )
    assert resp.status_code == 200
    assert resp.json()["session"]["modules"]["output"]["gain_db"] == 6.0
    saved = json.loads((rec.input_path.parent / "studio_session.json").read_text())
    assert saved["modules"]["output"]["gain_db"] == 6.0


def test_agent_applies_ops(client, seed_job, early_access_headers, monkeypatch):
    rec = seed_job()
    seen = {}

    def fake_llm(messages):
        seen["messages"] = messages
        return json.dumps(
            {
                "reply": "Made the ending louder.",
                "ops": [{"op": "add_region", "start_sec": 0.2, "end_sec": 0.9, "gain_db": 2, "label": "Ending"}],
            }
        )

    monkeypatch.setattr(agent_mod, "_call_llm", fake_llm)
    resp = client.post(
        f"/api/jobs/{rec.job_id}/studio/agent",
        headers=early_access_headers,
        json={
            "messages": [{"role": "user", "content": "make the ending louder"}],
            "session": {},
            "playhead_sec": 0.5,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["reply"] == "Made the ending louder."
    assert body["session"]["regions"][0]["gain_db"] == 2.0
    assert body["changes"] and body["proposals"] == []
    assert "SONG CONTEXT" in seen["messages"][1]["content"]
    assert "playhead_sec" in seen["messages"][-1]["content"]


def test_agent_without_llm_key_is_503(client, seed_job, early_access_headers, settings_override):
    settings_override(groq_api_key=None)
    rec = seed_job()
    resp = client.post(
        f"/api/jobs/{rec.job_id}/studio/agent",
        headers=early_access_headers,
        json={"messages": [{"role": "user", "content": "hi"}], "session": {}},
    )
    assert resp.status_code == 503


def test_commit_then_revert(client, seed_job, early_access_headers):
    from services.job_store import job_store

    rec = seed_job()
    job_dir = rec.input_path.parent
    original = sf.read(str(rec.master_path), dtype="float32")[0]

    resp = client.post(
        f"/api/jobs/{rec.job_id}/studio/commit",
        headers=early_access_headers,
        json={"session": {"modules": {"eq": {"bass_db": 3}, "output": {"gain_db": 3}}}},
    )
    assert resp.status_code == 200, resp.text
    assert (job_dir / "master_ai.wav").exists()
    committed = sf.read(str(job_dir / "master.wav"), dtype="float32")[0]
    assert committed.ndim == 2 and _rms_db(committed) > _rms_db(original) + 1.0
    assert job_store._jobs[rec.job_id].finalizing is False
    status = client.get(f"/api/jobs/{rec.job_id}/studio/status", headers=early_access_headers).json()
    assert status["committed"] is True

    # The Table keeps previewing on the untouched AI master after a commit.
    studio = client.get(f"/api/jobs/{rec.job_id}/studio", headers=early_access_headers).json()
    assert "/artifacts/master_ai" in studio["base_url"]

    resp = client.post(f"/api/jobs/{rec.job_id}/studio/revert", headers=early_access_headers)
    assert resp.status_code == 200
    reverted = sf.read(str(job_dir / "master.wav"), dtype="float32")[0]
    snap = sf.read(str(job_dir / "master_ai.wav"), dtype="float32")[0]
    assert np.array_equal(reverted, snap)
    status = client.get(f"/api/jobs/{rec.job_id}/studio/status", headers=early_access_headers).json()
    assert status["committed"] is False


def test_revert_without_commit_is_409(client, seed_job, early_access_headers):
    rec = seed_job()
    assert client.post(f"/api/jobs/{rec.job_id}/studio/revert", headers=early_access_headers).status_code == 409


def test_post_completion_updates_keep_analysis_on_disk(seed_job, run_async):
    """Regression: a second update on a completed persistent job used to null the analysis."""
    from services.job_store import job_store

    rec = seed_job()
    rec.analysis = {"style_family": "devotional", "sectional_analysis": []}
    meta_path = rec.input_path.parent / "metadata.json"
    run_async(job_store.update(rec.job_id, message="first"))  # persists, then frees in memory
    assert rec.analysis is None
    run_async(job_store.update(rec.job_id, message="second"))  # e.g. a Mastering Table commit
    saved = json.loads(meta_path.read_text())
    assert saved["analysis"] == {"style_family": "devotional", "sectional_analysis": []}
    assert saved["report"] == {"summary": "ok"}
    assert saved["message"] == "second"
