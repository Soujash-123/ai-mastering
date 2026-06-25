from __future__ import annotations

from functools import lru_cache
from ipaddress import ip_address
from pathlib import Path
from typing import Optional
from urllib.error import URLError
from urllib.request import urlopen

from pydantic_settings import BaseSettings, SettingsConfigDict
import tempfile
import shutil
from datetime import date, datetime


_LOCAL_CORS_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://kordstudio.duckdns.org",
    "https://kordstudio.duckdns.org",
)

_PUBLIC_IP_ENDPOINTS = (
    "https://api.ipify.org",
    "https://ifconfig.me/ip",
)

_FRONTEND_PORTS = (3000,)


def _current_public_ip() -> Optional[str]:
    for endpoint in _PUBLIC_IP_ENDPOINTS:
        try:
            with urlopen(endpoint, timeout=2) as response:
                ip = response.read(64).decode("utf-8").strip()
                parsed_ip = ip_address(ip)
        except (OSError, URLError, TimeoutError, ValueError):
            continue

        if parsed_ip.version == 6:
            return f"[{parsed_ip.compressed}]"

        return parsed_ip.compressed

    return None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openai_api_key: Optional[str] = None
    openai_mastering_model: str = "gpt-5"
    ai_mastering_data_dir: Optional[Path] = None

    database_url: str = "sqlite:///./data/kord_auth.db"
    jwt_secret_key: str = "change-me-use-long-random-secret-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    @property
    def data_dir(self) -> Path:
        # Explicit env-configured path wins
        if self.ai_mastering_data_dir and str(self.ai_mastering_data_dir).strip():
            p = self.ai_mastering_data_dir.resolve()
            p.mkdir(parents=True, exist_ok=True)
            return p

        # Default: use system tmp folder under `ai_mastering/<YYYY-MM-DD>-H<00|06|12|18>`
        now = datetime.now()
        slot_hour = (now.hour // 6) * 6
        slot = f"{now.date().isoformat()}-H{slot_hour:02d}"
        parent = Path(tempfile.gettempdir()) / "ai_mastering"
        p = parent / slot
        try:
            p.mkdir(parents=True, exist_ok=True)
        except Exception:
            # fallback to cwd ./data if tmp isn't writable
            fb = Path("./data").resolve()
            fb.mkdir(parents=True, exist_ok=True)
            return fb

        # cleanup other rotated folders in the tmp dir (best-effort)
        try:
            for child in parent.iterdir():
                if child.is_dir() and child.name != slot:
                    try:
                        shutil.rmtree(child)
                    except Exception:
                        # ignore cleanup failures
                        pass
        except Exception:
            pass

        return p

    @property
    def cors_origin_list(self) -> list[str]:
        origins = list(_LOCAL_CORS_ORIGINS)
        public_ip = _current_public_ip()

        if public_ip:
            origins.extend(
                f"{scheme}://{public_ip}:{port}"
                for scheme in ("http", "https")
                for port in _FRONTEND_PORTS
            )

        return list(dict.fromkeys(origins))


@lru_cache
def get_settings() -> Settings:
    return Settings()
