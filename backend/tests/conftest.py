"""Shared pytest fixtures for API route tests.

Environment must be configured BEFORE importing the app so the SQLAlchemy
engine and Settings point at a throwaway SQLite DB and temp data dir.
"""
from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path

# --- Configure a disposable environment before importing the app ------------
_TMP = Path(tempfile.mkdtemp(prefix="kord_test_"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["AI_MASTERING_DATA_DIR"] = str(_TMP)
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-pytest-0123456789"

import numpy as np  # noqa: E402
import pytest  # noqa: E402
import soundfile as sf  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from api.main import app  # noqa: E402
from api.schemas import JobStatus  # noqa: E402
from auth.database import Base, SessionLocal, engine  # noqa: E402
from auth.models import User  # noqa: E402
from auth.schemas import UserRole  # noqa: E402
from auth.security import create_access_token, hash_password  # noqa: E402
from services.job_store import JobRecord, job_store  # noqa: E402
from utils.config import get_settings  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_db():
    """Create a clean schema for every test and tear it down afterwards."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    job_store._jobs.clear()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


# --- User / auth helpers ----------------------------------------------------
def create_user(
    role: UserRole,
    email: str,
    password: str = "password123",
    *,
    is_active: bool = True,
    is_provisioned: bool = False,
) -> User:
    db = SessionLocal()
    try:
        user = User(
            full_name="Test User",
            email=email.lower(),
            password_hash=hash_password(password),
            role=role.value,
            is_active=is_active,
            is_provisioned=is_provisioned,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(user_id=user.id, email=user.email, role=UserRole(user.role))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def make_user():
    return create_user


@pytest.fixture
def admin_headers():
    user = create_user(UserRole.ADMIN, "admin@example.com")
    return auth_header(user)


@pytest.fixture
def rollout_headers():
    user = create_user(UserRole.ROLLOUT, "rollout@example.com")
    return auth_header(user)


@pytest.fixture
def early_access_headers():
    user = create_user(UserRole.EARLY_ACCESS, "early@example.com")
    return auth_header(user)


# --- Audio / job helpers ----------------------------------------------------
def wav_bytes(seconds: float = 1.0, sr: int = 44100) -> bytes:
    n = int(seconds * sr)
    t = np.arange(n) / sr
    y = (0.1 * np.sin(2 * np.pi * 440 * t)).astype("float32")
    buf = io.BytesIO()
    sf.write(buf, y, sr, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return buf.read()


@pytest.fixture
def sample_wav():
    return wav_bytes


@pytest.fixture
def seed_job():
    """Insert a JobRecord directly into the in-memory store.

    Returns a helper that creates the on-disk job dir and record.
    """
    def _seed(
        *,
        status: JobStatus = JobStatus.completed,
        user_role: str = UserRole.ADMIN.value,
        with_master: bool = True,
        ephemeral: bool = False,
    ) -> JobRecord:
        settings = get_settings()
        rec = JobRecord(job_id=__import__("uuid").uuid4().hex, status=status, user_role=user_role, ephemeral=ephemeral)
        job_dir = settings.data_dir / "jobs" / rec.job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        rec.input_path = job_dir / "input.wav"
        rec.input_path.write_bytes(wav_bytes())
        if with_master:
            rec.master_path = job_dir / "master.wav"
            rec.master_path.write_bytes(wav_bytes())
        rec.report = {"summary": "ok"}
        rec.analysis = {"lufs": -14.0}
        job_store._jobs[rec.job_id] = rec
        return rec

    return _seed
