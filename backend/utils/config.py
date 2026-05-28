from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openai_api_key: Optional[str] = None
    openai_mastering_model: str = "gpt-5"
    ai_mastering_data_dir: Path = Path("./data")
    cors_origins: str = "http://localhost:3000"

    @property
    def data_dir(self) -> Path:
        p = self.ai_mastering_data_dir.resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
