#!/usr/bin/env python3
"""Review early-access requests from the command line.

On the server, run it inside the backend container so it uses the live DB:

    docker compose exec backend python scripts/approve_request.py --pending
    docker compose exec backend python scripts/approve_request.py 42
    docker compose exec backend python scripts/approve_request.py --reject 42

Approving <id>:
  * no account for that email  -> creates an EARLY_ACCESS user with a new random password
  * existing ROLLOUT account   -> upgrades it to EARLY_ACCESS and sets a new random password
  * already EARLY_ACCESS/ADMIN, or a provisioned account -> role and password are left alone
  * marks the request APPROVED

New credentials are printed exactly once, with a WhatsApp message ready to paste.
They are not stored anywhere else, so copy them before closing the terminal.

Idempotent: running the same approval again changes nothing and prints no new
password. Rejecting an already rejected request is a no-op; an approved request
cannot be rejected here (change the user's role in the admin panel instead).
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))
# Settings reads backend/.env relative to the working directory.
os.chdir(str(_BACKEND))

from auth.database import SessionLocal, init_db  # noqa: E402
from auth.models import EarlyAccessRequest, User  # noqa: E402
from auth.provisioned_users import is_provisioned_email  # noqa: E402
from auth.schemas import EarlyAccessStatus, UserRole  # noqa: E402
from auth.security import hash_password  # noqa: E402

LOGIN_URL = "https://kordstudio.syntalixconsultancy.com/login"
_HAS_ACCESS = {UserRole.EARLY_ACCESS.value, UserRole.ADMIN.value}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _one_line(text: str, width: int) -> str:
    flat = " ".join((text or "").split())
    return flat if len(flat) <= width else flat[: width - 1] + "…"


def list_pending(db) -> int:
    rows = (
        db.query(EarlyAccessRequest)
        .filter(EarlyAccessRequest.status == EarlyAccessStatus.PENDING.value)
        .order_by(EarlyAccessRequest.created_at.asc())
        .all()
    )
    if not rows:
        print("No pending requests.")
        return 0
    print(f"{len(rows)} pending request(s), oldest first:\n")
    for r in rows:
        when = r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else "?"
        existing = db.query(User).filter(User.email == r.email).first()
        account = f"existing {existing.role}" if existing else "no account"
        print(f"  #{r.id:<5} {when}  {r.name} <{r.email}>  {r.phone}  ({account})")
        if r.reason:
            print(f"          {_one_line(r.reason, 110)}")
    print("\nApprove with:  python scripts/approve_request.py <id>")
    print("Reject with:   python scripts/approve_request.py --reject <id>")
    return 0


def _whatsapp_message(name: str, email: str, password: str) -> str:
    first = (name or "").split()[0] if (name or "").split() else "there"
    return (
        f"Hi {first}! Your Kord early access is ready.\n\n"
        f"Log in here: {LOGIN_URL}\n"
        f"Email: {email}\n"
        f"Password: {password}\n\n"
        "Please keep this password to yourself. Upload a mix, pick the style closest to your song, "
        "and let us know how the master sounds."
    )


def approve(db, request_id: int) -> int:
    req = db.get(EarlyAccessRequest, request_id)
    if req is None:
        print(f"Request #{request_id} not found.", file=sys.stderr)
        return 1

    email = req.email.lower()
    user = db.query(User).filter(User.email == email).first()
    password: str | None = None
    notes: list[str] = []

    if is_provisioned_email(email):
        # Provisioned accounts are managed by scripts/seed_access_users.py.
        notes.append("Provisioned account: role and password are managed by the seed script and were not changed.")
    elif user is None:
        password = secrets.token_urlsafe(12)
        user = User(
            full_name=(req.name or email).strip()[:255],
            email=email,
            password_hash=hash_password(password),
            role=UserRole.EARLY_ACCESS.value,
            is_active=True,
        )
        db.add(user)
        notes.append("Created a new EARLY_ACCESS account.")
    elif user.role in _HAS_ACCESS:
        notes.append(f"Account is already {user.role}; role and password were not changed.")
        if not user.is_active:
            notes.append("WARNING: this account is inactive. Reactivate it in the admin panel if needed.")
    else:
        password = secrets.token_urlsafe(12)
        user.role = UserRole.EARLY_ACCESS.value
        user.password_hash = hash_password(password)
        user.is_active = True
        user.updated_at = _now()
        notes.append("Upgraded the existing ROLLOUT account to EARLY_ACCESS and set a new password.")

    was = req.status
    req.status = EarlyAccessStatus.APPROVED.value
    db.commit()

    print(f"Request #{req.id}: {req.name} <{email}>  {was} -> APPROVED")
    for n in notes:
        print(f"  {n}")

    if password is None:
        if was == EarlyAccessStatus.APPROVED.value:
            print("  Already approved earlier: nothing to do, no new password issued.")
        else:
            print(f"  No new password issued. They log in at {LOGIN_URL} with their existing password.")
        return 0

    print("\n" + "=" * 64)
    print("CREDENTIALS (shown once, not stored anywhere else):")
    print(f"  Email:    {email}")
    print(f"  Password: {password}")
    print("=" * 64)
    print(f"\nWhatsApp message for {req.phone}:\n")
    print(_whatsapp_message(req.name, email, password))
    print()
    return 0


def reject(db, request_id: int) -> int:
    req = db.get(EarlyAccessRequest, request_id)
    if req is None:
        print(f"Request #{request_id} not found.", file=sys.stderr)
        return 1
    if req.status == EarlyAccessStatus.REJECTED.value:
        print(f"Request #{req.id} is already REJECTED. Nothing to do.")
        return 0
    if req.status == EarlyAccessStatus.APPROVED.value:
        print(
            f"Request #{req.id} is already APPROVED; not rejecting it. "
            "To remove access, change the user's role in the admin panel.",
            file=sys.stderr,
        )
        return 1
    req.status = EarlyAccessStatus.REJECTED.value
    db.commit()
    print(f"Request #{req.id}: {req.name} <{req.email}>  PENDING -> REJECTED")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Approve or reject Kord early-access requests.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--pending", action="store_true", help="list pending requests")
    group.add_argument("--reject", type=int, metavar="ID", help="reject request ID")
    group.add_argument("id", nargs="?", type=int, help="approve request ID")
    args = parser.parse_args(argv)

    init_db()
    db = SessionLocal()
    try:
        if args.pending:
            return list_pending(db)
        if args.reject is not None:
            return reject(db, args.reject)
        return approve(db, args.id)
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
