"""Shared logging setup for the mastering backend."""

from __future__ import annotations

import logging
import os


def configure_logging() -> None:
    level_name = os.getenv("AI_MASTERING_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
        force=True,
    )
