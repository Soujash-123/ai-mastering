from __future__ import annotations

import asyncio
import gc
import logging
import shutil
from pathlib import Path

from analysis.engine import analyze_audio_file
from analysis.slim import slim_analysis_for_dsp
from api.schemas import JobStatus
from exports.pcm_export import export_all_artifacts
from llm.intent import generate_mastering_plan
from mastering.chain import master_file
from mastering.safety import intent_to_safe_params
from services.job_store import job_store
from utils.config import get_settings
from utils.memory import activate_job_memory_tracker, deactivate_job_memory_tracker, memory_step
from auth.database import SessionLocal
from auth.models import User as UserModel

logger = logging.getLogger(__name__)


async def process_job(job_id: str, target_platform: str, user_intent: str) -> None:
    settings = get_settings()
    rec = await job_store.get(job_id)
    if not rec or not rec.input_path:
        logger.warning("Job %s: record missing or input path absent", job_id)
        return

    async def bump(status: JobStatus, progress: float, message: str) -> None:
        await job_store.update(job_id, status=status, progress=progress, message=message)

    tracker, tracker_token = activate_job_memory_tracker(job_id)
    try:
        logger.info("Job %s: started (platform=%s, input=%s)", job_id, target_platform, rec.input_path)
        await bump(JobStatus.analyzing, 0.1, "Analyzing audio…")
        logger.info("Job %s: analysis step started", job_id)
        with memory_step("analysis"):
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
        with memory_step("llm_strategy"):
            intent, report, raw = await asyncio.to_thread(generate_mastering_plan, analysis)
        logger.info("Job %s: LLM strategy step completed", job_id)
        with memory_step("dsp_safety_mapping"):
            safe_intent, params = intent_to_safe_params(intent, float(analysis.get("integrated_lufs", -14.0)))
            llm_modifiers = (
                [s.model_dump() for s in safe_intent.sectional_processing]
                if safe_intent.sectional_processing
                else None
            )
            analysis_dsp = slim_analysis_for_dsp(analysis, llm_modifiers)
            del analysis
            gc.collect()
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
        with memory_step("mastering"):
            await asyncio.to_thread(master_file, str(rec.input_path), str(master_path), params, analysis_dsp)
        logger.info("Job %s: master rendering completed", job_id)

        await bump(JobStatus.exporting, 0.8, "Exporting formats & streaming simulations…")
        exports_dir = job_dir / "exports"
        sim_dir = job_dir / "streaming_sim"
        logger.info("Job %s: export step started", job_id)
        is_rollout = rec.user_role == "ROLLOUT"
        if is_rollout:
            exports = []
            notes = []
            with memory_step("export_all"):
                pass
        else:
            with memory_step("export_all"):
                exports, notes = await asyncio.to_thread(export_all_artifacts, master_path, exports_dir, sim_dir)

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
            memory_profile=tracker.reports_as_dicts(),
        )
        # Increment per-user mastered counter (best-effort)
        try:
            if rec.user_id:
                db = SessionLocal()
                try:
                    usr = db.get(UserModel, rec.user_id)
                    if usr is not None:
                        usr.mastered_count = (usr.mastered_count or 0) + 1
                        db.add(usr)
                        db.commit()
                finally:
                    try:
                        db.close()
                    except Exception:
                        pass
        except Exception:
            logger.exception("Failed to bump mastered_count for user %s", rec.user_id)
        logger.info("Job %s: completed (exports=%d, notes=%d)", job_id, len(exports_public), len(notes))
        tracker.log_summary()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Job %s: failed during processing (%s)", job_id, exc)
        tracker.log_summary()
        await job_store.update(
            job_id,
            status=JobStatus.failed,
            message="Failed",
            error=str(exc),
            progress=1.0,
            memory_profile=tracker.reports_as_dicts(),
        )
    finally:
        deactivate_job_memory_tracker(tracker_token)


def persist_upload(job_id: str, src_path: Path) -> Path:
    settings = get_settings()
    job_dir = settings.data_dir / "jobs" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    dst = job_dir / "input.wav"
    shutil.copyfile(src_path, dst)
    return dst
