"""Process RSS memory tracking for pipeline steps."""

from __future__ import annotations

import gc
import logging
import sys
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Iterator

logger = logging.getLogger(__name__)

_tracker_ctx: ContextVar[JobMemoryTracker | None] = ContextVar("_job_memory_tracker", default=None)


def process_rss_mb() -> float:
    """Current process resident set size in MiB."""
    try:
        with open("/proc/self/status", encoding="ascii") as handle:
            for line in handle:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) / 1024.0
    except OSError:
        pass

    try:
        import resource

        usage = resource.getrusage(resource.RUSAGE_SELF)
        if sys.platform == "darwin":
            return usage.ru_maxrss / (1024.0 * 1024.0)
        return usage.ru_maxrss / 1024.0
    except Exception:
        return 0.0


@dataclass(frozen=True)
class StepMemoryReport:
    name: str
    rss_start_mb: float
    rss_end_mb: float
    rss_peak_mb: float

    @property
    def delta_mb(self) -> float:
        return self.rss_end_mb - self.rss_start_mb


class JobMemoryTracker:
    def __init__(self, job_id: str | None = None) -> None:
        self.job_id = job_id
        self.reports: list[StepMemoryReport] = []

    @contextmanager
    def step(self, name: str) -> Iterator[None]:
        gc.collect()
        rss_start = process_rss_mb()
        rss_peak = rss_start
        try:
            yield
        finally:
            gc.collect()
            rss_end = process_rss_mb()
            rss_peak = max(rss_start, rss_end)
            report = StepMemoryReport(
                name=name,
                rss_start_mb=rss_start,
                rss_end_mb=rss_end,
                rss_peak_mb=rss_peak,
            )
            self.reports.append(report)
            prefix = f"Job {self.job_id}: " if self.job_id else ""
            logger.info(
                "%sRAM step=%r start=%.1f MiB end=%.1f MiB delta=%+.1f MiB peak=%.1f MiB",
                prefix,
                name,
                rss_start,
                rss_end,
                report.delta_mb,
                rss_peak,
            )

    def log_summary(self) -> None:
        if not self.reports:
            return

        prefix = f"Job {self.job_id}: " if self.job_id else ""
        ranked = sorted(self.reports, key=lambda item: item.delta_mb, reverse=True)
        lines = [
            f"{item.name}: end={item.rss_end_mb:.1f} MiB delta={item.delta_mb:+.1f} MiB peak={item.rss_peak_mb:.1f} MiB"
            for item in self.reports
        ]
        logger.info("%sRAM summary (execution order):\n  %s", prefix, "\n  ".join(lines))
        logger.info(
            "%sRAM summary (largest delta first): %s",
            prefix,
            "; ".join(f"{item.name} {item.delta_mb:+.1f} MiB" for item in ranked[:5]),
        )

    def reports_as_dicts(self) -> list[dict[str, float | str]]:
        return [
            {
                "name": report.name,
                "rss_start_mb": round(report.rss_start_mb, 1),
                "rss_end_mb": round(report.rss_end_mb, 1),
                "rss_peak_mb": round(report.rss_peak_mb, 1),
                "delta_mb": round(report.delta_mb, 1),
            }
            for report in self.reports
        ]


def activate_job_memory_tracker(job_id: str) -> tuple[JobMemoryTracker, object]:
    tracker = JobMemoryTracker(job_id=job_id)
    token = _tracker_ctx.set(tracker)
    return tracker, token


def deactivate_job_memory_tracker(token: object) -> None:
    _tracker_ctx.reset(token)


@contextmanager
def memory_step(name: str) -> Iterator[None]:
    tracker = _tracker_ctx.get()
    if tracker is None:
        yield
        return
    with tracker.step(name):
        yield
