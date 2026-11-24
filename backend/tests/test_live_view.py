"""Processing-page live view: section amounts match the render plan; stage hook fires."""
from __future__ import annotations


from mastering.dsp_params import SafeDSPParams
from mastering.section_automation import build_mastering_plan, section_amounts
from utils.memory import activate_job_memory_tracker, deactivate_job_memory_tracker, memory_step
from workers.processor import _live_view_song

ANALYSIS = {
    "sectional_analysis": [
        {"section": "intro", "start_sec": 0.0, "end_sec": 10.0, "rms": 0.05, "punch_score": 0.2},
        {"section": "chorus", "start_sec": 10.0, "end_sec": 30.0, "rms": 0.2, "punch_score": 0.8},
    ],
    "llm_section_modifiers": [],
}


def test_section_amounts_match_plan_scalars():
    rows = section_amounts(ANALYSIS)
    assert [r["label"] for r in rows] == ["intro", "chorus"]
    chorus = rows[1]
    assert chorus["comp"] > rows[0]["comp"] and chorus["width"] > rows[0]["width"]
    params = SafeDSPParams(
        low_shelf_db=0, mid_peak_db=0, high_shelf_db=0, dynamic_eq_strength=0, low_ratio=1, mid_ratio=1,
        high_ratio=1, saturation_amount=0, stereo_width_factor=1, transient_blend=0.5, target_lufs=-14,
        true_peak_ceiling_db=-1,
    )
    plan = build_mastering_plan(params, ANALYSIS, 30.0, 44100)
    weighted = (rows[0]["width"] * 10 + rows[1]["width"] * 20) / 30
    assert abs(plan.width_mod - weighted) < 1e-3


def test_live_view_song_shape():
    lv = _live_view_song({**ANALYSIS, "duration_sec": 30.0, "temporal_analysis": [{"rms": 0.1 * (i % 5 + 1)} for i in range(30)]})
    assert lv["duration"] == 30.0 and lv["version"] == 1
    assert len(lv["peaks"]) > 0 and max(lv["peaks"]) <= 1.0
    assert [s["label"] for s in lv["sections"]] == ["intro", "chorus"]


def test_memory_step_reports_stage_names():
    tracker, token = activate_job_memory_tracker("job-x")
    seen: list[str] = []
    tracker.on_step = seen.append
    try:
        with memory_step("mastering"):
            with memory_step("mastering.limiter"):
                pass
    finally:
        deactivate_job_memory_tracker(token)
    assert seen == ["mastering", "mastering.limiter"]
