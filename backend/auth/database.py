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
    _ensure_provisioned_column()


def _ensure_provisioned_column() -> None:
    """Best-effort SQLite migration for existing databases."""
    try:
        from sqlalchemy import inspect, text

        insp = inspect(engine)
        if "users" not in insp.get_table_names():
            return
        cols = {c["name"] for c in insp.get_columns("users")}
        # Add missing columns independently (best-effort)
        try:
            if "is_provisioned" not in cols:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_provisioned BOOLEAN NOT NULL DEFAULT 0"))
        except Exception:
            pass
        try:
            if "mastered_count" not in cols:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE users ADD COLUMN mastered_count INTEGER NOT NULL DEFAULT 0"))
        except Exception:
            pass
    except Exception:
        pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
