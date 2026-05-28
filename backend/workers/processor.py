from __future__ import annotations

import asyncio
import logging
import shutil
from pathlib import Path

from analysis.engine import analyze_audio_file
from api.schemas import JobStatus
from exports.pcm_export import export_variants, simulate_streaming_platforms
from llm.intent import generate_mastering_plan
from mastering.chain import master_file
from mastering.safety import intent_to_safe_params
from services.job_store import job_store
from utils.config import get_settings

logger = logging.getLogger(__name__)


async def process_job(job_id: str, target_platform: str, user_intent: str) -> None:
    settings = get_settings()
    rec = await job_store.get(job_id)
    if not rec or not rec.input_path:
        logger.warning("Job %s: record missing or input path absent", job_id)
        return

    async def bump(status: JobStatus, progress: float, message: str) -> None:
        await job_store.update(job_id, status=status, progress=progress, message=message)

    try:
        logger.info("Job %s: started (platform=%s, input=%s)", job_id, target_platform, rec.input_path)
        await bump(JobStatus.analyzing, 0.1, "Analyzing audio…")
        logger.info("Job %s: analysis step started", job_id)
        analysis = await asyncio.to_thread(analyze_audio_file, str(rec.input_path), target_platform, user_intent)
        logger.info(
            "Job %s: analysis completed (duration_sec=%s, integrated_lufs=%s)",
            job_id,
            analysis.get("duration_sec"),
            analysis.get("integrated_lufs"),
        )
        await job_store.update(job_id, analysis=analysis)

        await bump(JobStatus.reasoning, 0.35, "Generating adaptive mastering strategy…")
        logger.info("Job %s: LLM strategy step started", job_id)
        intent, report, raw = await asyncio.to_thread(generate_mastering_plan, analysis)
        logger.info("Job %s: LLM strategy step completed", job_id)
        safe_intent, params = intent_to_safe_params(intent, float(analysis.get("integrated_lufs", -14.0)))
        analysis_dsp = dict(analysis)
        if safe_intent.sectional_processing:
            analysis_dsp["llm_section_modifiers"] = [
                s.model_dump() for s in safe_intent.sectional_processing
            ]
        logger.info(
            "Job %s: DSP safety mapping completed (target_lufs=%s, true_peak_ceiling_db=%s)",
            job_id,
            params.target_lufs,
            params.true_peak_ceiling_db,
        )

        await job_store.update(
            job_id,
            raw_intent=raw.get("raw") if isinstance(raw, dict) else raw,
            safe_intent=safe_intent.model_dump(),
            report=report.model_dump(),
        )

        await bump(JobStatus.mastering, 0.55, "Applying adaptive DSP chain…")
        job_dir = rec.input_path.parent
        master_path = job_dir / "master.wav"
        logger.info("Job %s: master rendering started (%s)", job_id, master_path)
        await asyncio.to_thread(master_file, str(rec.input_path), str(master_path), params, analysis_dsp)
        logger.info("Job %s: master rendering completed", job_id)

        await bump(JobStatus.exporting, 0.8, "Exporting formats & streaming simulations…")
        exports_dir = job_dir / "exports"
        sim_dir = job_dir / "streaming_sim"
        logger.info("Job %s: export step started", job_id)
        exports = await asyncio.to_thread(export_variants, master_path, exports_dir)
        notes = await asyncio.to_thread(simulate_streaming_platforms, master_path, sim_dir)

        exports_public: list[dict[str, str]] = []
        for item in exports:
            p = Path(item["path"]).resolve()
            rel = p.relative_to(job_dir.resolve()).as_posix()
            exports_public.append(
                {
                    **item,
                    "download_url": f"/api/jobs/{job_id}/artifacts/{rel}",
                }
            )

        await job_store.update(
            job_id,
            status=JobStatus.completed,
            progress=1.0,
            message="Done",
            master_path=master_path,
            exports=exports_public,
            streaming_notes=notes,
        )
        logger.info("Job %s: completed (exports=%d, notes=%d)", job_id, len(exports_public), len(notes))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Job %s: failed during processing (%s)", job_id, exc)
        await job_store.update(job_id, status=JobStatus.failed, message="Failed", error=str(exc), progress=1.0)


def persist_upload(job_id: str, src_path: Path) -> Path:
    settings = get_settings()
    job_dir = settings.data_dir / "jobs" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    dst = job_dir / "input.wav"
    shutil.copyfile(src_path, dst)
    return dst
