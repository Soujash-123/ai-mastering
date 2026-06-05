from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from utils.config import get_settings


class Base(DeclarativeBase):
    pass


def _sqlite_url() -> str:
    settings = get_settings()
    raw = settings.database_url
    if raw.startswith("sqlite:///"):
        rel = raw.replace("sqlite:///", "", 1)
        path = Path(rel)
        if not path.is_absolute():
            path = Path.cwd() / path
        path.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{path.as_posix()}"
    return raw


engine = create_engine(_sqlite_url(), connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    from auth import models  # noqa: F401

    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
