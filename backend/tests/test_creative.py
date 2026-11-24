"""Creative desk: artist nudges stay inside the safety layer and the style envelope."""
from __future__ import annotations

import json

import pytest

import api.main as main
from mastering.creative import CreativeControls, CreativeParseError, apply_creative, parse_creative
from mastering.safety import intent_to_safe_params
from mastering.style_profiles import STYLE_PROFILES, get_style_profile
from models.mastering_intent import MasteringIntent
from services.job_store import job_store


def _neutral_intent() -> MasteringIntent:
    base = {name: f.annotation() for name, f in MasteringIntent.model_fields.items() if name != "sectional_processing"}
    return MasteringIntent(**base)


ALL_MAX = CreativeControls(low=5, mids=5, air=5, punch=5, warmth=5, width=5, loudness=5)
ALL_MIN = CreativeControls(low=-5, mids=-5, air=-5, punch=-5, warmth=-5, width=-5, loudness=-5)


def test_neutral_desk_changes_nothing():
    _, base = intent_to_safe_params(_neutral_intent(), -14.0, style_family="film_melodic")
    _, same = intent_to_safe_params(_neutral_intent(), -14.0, style_family="film_melodic", creative=CreativeControls())
    assert same == base


def test_desk_moves_params_in_the_asked_direction():
    _, base = intent_to_safe_params(_neutral_intent(), -14.0, style_family="auto")
    _, up = intent_to_safe_params(
        _neutral_intent(), -14.0, style_family="auto", creative=CreativeControls(low=3, air=-3, warmth=2)
    )
    assert up.low_shelf_db > base.low_shelf_db
    assert up.high_shelf_db < base.high_shelf_db
    assert up.saturation_amount > base.saturation_amount


@pytest.mark.parametrize("key", [k for k in STYLE_PROFILES if k != "auto"])
@pytest.mark.parametrize("desk", [ALL_MAX, ALL_MIN])
def test_extreme_desk_stays_inside_style_envelope(key, desk):
    profile = STYLE_PROFILES[key]
    _, p = intent_to_safe_params(_neutral_intent(), -14.0, style_family=key, creative=desk)
    lo, hi = profile.lufs_range
    assert lo <= p.target_lufs <= hi
    if profile.max_saturation is not None:
        assert p.saturation_amount <= profile.max_saturation + 1e-9
    if profile.max_width is not None:
        assert p.stereo_width_factor <= profile.max_width + 1e-9
    assert -3.0 <= p.low_shelf_db <= 3.0 and -4.0 <= p.high_shelf_db <= 4.0


@pytest.mark.parametrize("key", [k for k in STYLE_PROFILES if k != "auto"])
def test_loudness_channel_spans_the_style_window(key):
    lo, hi = STYLE_PROFILES[key].lufs_range
    _, quiet = intent_to_safe_params(_neutral_intent(), -14.0, style_family=key, creative=CreativeControls(loudness=-5))
    _, loud = intent_to_safe_params(_neutral_intent(), -14.0, style_family=key, creative=CreativeControls(loudness=5))
    assert quiet.target_lufs == pytest.approx(lo)
    assert loud.target_lufs == pytest.approx(hi)


def test_reported_target_follows_desk_loudness():
    safe, p = intent_to_safe_params(
        _neutral_intent(), -14.0, style_family="bollywood_dance", creative=CreativeControls(loudness=5)
    )
    assert safe.loudness_strategy.target_lufs == pytest.approx(p.target_lufs)


def test_apply_creative_none_is_identity():
    _, base = intent_to_safe_params(_neutral_intent(), -14.0)
    assert apply_creative(base, None, get_style_profile("auto")) is base


@pytest.mark.parametrize(
    "raw",
    ['{"low": 6}', '{"low": 1.5}', '{"bass": 1}', "[1,2]", "not json"],
)
def test_parse_rejects_bad_input(raw):
    with pytest.raises(CreativeParseError):
        parse_creative(raw)


def test_parse_empty_is_none():
    assert parse_creative("") is None and parse_creative(None) is None


# ── API ──────────────────────────────────────────────────────────────────────


@pytest.fixture
def _no_processing(monkeypatch):
    monkeypatch.setattr(main, "process_job", lambda *a, **k: None)


def _post(client, headers, wav, **form):
    return client.post("/api/jobs", headers=headers, files={"file": ("song.wav", wav, "audio/wav")}, data=form)


def test_early_access_desk_is_stored(client, early_access_headers, sample_wav, _no_processing):
    desk = {"low": 2, "mids": 0, "air": -1, "punch": 3, "warmth": 0, "width": 1, "loudness": 4}
    resp = _post(client, early_access_headers, sample_wav(), creative=json.dumps(desk))
    assert resp.status_code == 200, resp.text
    assert job_store._jobs[resp.json()["job_id"]].creative == desk


def test_rollout_desk_is_ignored(client, rollout_headers, sample_wav, _no_processing):
    resp = _post(client, rollout_headers, sample_wav(), creative=json.dumps({"loudness": 5}))
    assert resp.status_code == 200, resp.text
    assert job_store._jobs[resp.json()["job_id"]].creative is None


def test_bad_desk_is_rejected(client, admin_headers, sample_wav, _no_processing):
    resp = _post(client, admin_headers, sample_wav(), creative='{"loudness": 9}')
    assert resp.status_code == 400


# ── Style start + tweaks ─────────────────────────────────────────────────────

from mastering.creative import STYLE_DESK_START, effective_desk  # noqa: E402


def test_effective_desk_is_style_start_plus_tweaks():
    d = effective_desk("bollywood_dance", {"loudness": -1, "air": 2})
    assert d.loudness == 3 and d.low == 2 and d.punch == 2 and d.air == 2


def test_effective_desk_clamps_to_range():
    d = effective_desk("bollywood_dance", {"loudness": 5, "low": -9})
    assert d.loudness == 5 and d.low == -5


def test_auto_without_tweaks_is_neutral():
    assert effective_desk("auto", None).is_neutral()


def test_style_starts_cover_every_style():
    assert set(STYLE_DESK_START) == set(STYLE_PROFILES)
