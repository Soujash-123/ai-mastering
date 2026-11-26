"""Tests for scripts/approve_request.py (early-access approval CLI)."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from auth.database import SessionLocal
from auth.models import EarlyAccessRequest, User
from auth.schemas import UserRole
from auth.security import verify_password

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "approve_request.py"


@pytest.fixture(scope="module")
def cli():
    spec = importlib.util.spec_from_file_location("approve_request", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _request(email: str, status: str = "PENDING", name: str = "Asha Rao") -> int:
    db = SessionLocal()
    try:
        req = EarlyAccessRequest(name=name, email=email, phone="+91 98765 43210", reason="EP", status=status)
        db.add(req)
        db.commit()
        return req.id
    finally:
        db.close()


def _get(model, **by):
    db = SessionLocal()
    try:
        return db.query(model).filter_by(**by).first()
    finally:
        db.close()


def _password_from(output: str) -> str:
    line = next(l for l in output.splitlines() if l.strip().startswith("Password:") and "  " in l)
    return line.split("Password:", 1)[1].strip()


def test_pending_lists_only_pending(cli, capsys):
    _request("one@example.com")
    _request("two@example.com", status="REJECTED")
    assert cli.main(["--pending"]) == 0
    out = capsys.readouterr().out
    assert "one@example.com" in out
    assert "two@example.com" not in out


def test_approve_creates_early_access_user(cli, capsys):
    rid = _request("new@example.com")
    assert cli.main([str(rid)]) == 0
    out = capsys.readouterr().out
    user = _get(User, email="new@example.com")
    assert user.role == UserRole.EARLY_ACCESS.value
    assert user.full_name == "Asha Rao"
    password = _password_from(out)
    assert verify_password(password, user.password_hash)
    assert "https://kordstudio.syntalixconsultancy.com/login" in out
    assert "Hi Asha!" in out
    assert _get(EarlyAccessRequest, id=rid).status == "APPROVED"


def test_approve_is_idempotent(cli, capsys, make_user):
    rid = _request("again@example.com")
    assert cli.main([str(rid)]) == 0
    first_hash = _get(User, email="again@example.com").password_hash
    capsys.readouterr()

    assert cli.main([str(rid)]) == 0
    out = capsys.readouterr().out
    assert "Password:" not in out
    assert "no new password" in out
    db = SessionLocal()
    try:
        assert db.query(User).filter_by(email="again@example.com").count() == 1
    finally:
        db.close()
    assert _get(User, email="again@example.com").password_hash == first_hash


def test_approve_upgrades_rollout_user(cli, capsys, make_user):
    make_user(UserRole.ROLLOUT, "roll@example.com", "oldpassword1")
    rid = _request("roll@example.com")
    assert cli.main([str(rid)]) == 0
    user = _get(User, email="roll@example.com")
    assert user.role == UserRole.EARLY_ACCESS.value
    assert not verify_password("oldpassword1", user.password_hash)
    assert verify_password(_password_from(capsys.readouterr().out), user.password_hash)


def test_approve_never_downgrades_admin(cli, capsys, make_user):
    make_user(UserRole.ADMIN, "boss@example.com", "adminpass1")
    rid = _request("boss@example.com")
    assert cli.main([str(rid)]) == 0
    user = _get(User, email="boss@example.com")
    assert user.role == UserRole.ADMIN.value
    assert verify_password("adminpass1", user.password_hash)
    assert "Password:" not in capsys.readouterr().out
    assert _get(EarlyAccessRequest, id=rid).status == "APPROVED"


def test_reject(cli):
    rid = _request("nope@example.com")
    assert cli.main(["--reject", str(rid)]) == 0
    assert _get(EarlyAccessRequest, id=rid).status == "REJECTED"
    assert cli.main(["--reject", str(rid)]) == 0  # idempotent
    assert _get(User, email="nope@example.com") is None


def test_reject_refuses_approved(cli):
    rid = _request("done@example.com")
    assert cli.main([str(rid)]) == 0
    assert cli.main(["--reject", str(rid)]) == 1
    assert _get(EarlyAccessRequest, id=rid).status == "APPROVED"


def test_unknown_id(cli):
    assert cli.main(["9999"]) == 1
    assert cli.main(["--reject", "9999"]) == 1


def test_requires_an_action(cli):
    with pytest.raises(SystemExit):
        cli.main([])
