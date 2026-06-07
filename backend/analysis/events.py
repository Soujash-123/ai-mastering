from __future__ import annotations

from typing import Any

import numpy as np


def detect_transition_events(frame_times: np.ndarray, frames: dict[str, Any]) -> list[dict[str, Any]]:
    if frame_times.size == 0:
        return []

    events: list[dict[str, Any]] = []

    def add_event(event_type: str, idx: int, strength: float, detail: str) -> None:
        if idx < 0 or idx >= frame_times.size:
            return
        events.append(
            {
                "event": event_type,
                "time_sec": float(frame_times[idx]),
                "strength": float(np.clip(strength, 0.0, 10.0)),
                "detail": detail,
            }
        )

    rms = frames["rms"]
    punch = frames["punch_score"]
    vocal = frames["vocal_presence"]
    width_proxy = np.clip((frames["spectral_contrast"] / (np.mean(frames["spectral_contrast"]) + 1e-12)), 0.0, 3.0)
    transient = frames["transient_density"]

    drms = np.diff(rms, prepend=rms[:1])
    dpunch = np.diff(punch, prepend=punch[:1])
    dvocal = np.diff(vocal, prepend=vocal[:1])
    dwidth = np.diff(width_proxy, prepend=width_proxy[:1])
    dtransient = np.diff(transient, prepend=transient[:1])

    for i in np.where(dpunch > np.percentile(dpunch, 92))[0][:12]:
        add_event("chorus_entry", int(i), float(dpunch[i] * 10.0), "sudden punch lift suggests chorus entry")
    for i in np.where(drms > np.percentile(drms, 90))[0][:12]:
        add_event("energy_lift", int(i), float(drms[i] * 20.0), "broadband energy rises")
    for i in np.where(drms < np.percentile(drms, 8))[0][:12]:
        add_event("drop", int(i), float(abs(drms[i]) * 20.0), "level drops rapidly")
    for i in np.where(dvocal > np.percentile(dvocal, 92))[0][:12]:
        add_event("vocal_entrance", int(i), float(dvocal[i] * 10.0), "vocal band emerges")
    for i in np.where(dwidth > np.percentile(dwidth, 92))[0][:12]:
        add_event("width_expansion", int(i), float(dwidth[i] * 8.0), "apparent side energy increases")
    for i in np.where(dtransient > np.percentile(dtransient, 92))[0][:12]:
        add_event("transient_spike", int(i), float(dtransient[i] * 10.0), "transient density spike detected")

    events.sort(key=lambda e: e["time_sec"])
    return events[:48]

