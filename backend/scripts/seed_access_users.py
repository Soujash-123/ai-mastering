#!/usr/bin/env python3
"""Seed immutable provisioned KORD access accounts. Run from backend/: python scripts/seed_access_users.py"""

from __future__ import annotations

import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from auth.database import SessionLocal, init_db
from auth.models import User
from auth.provisioned_users import PROVISIONED_USERS
from auth.security import hash_password


def main() -> None:
    init_db()
    db = SessionLocal()
    created = updated = 0
    try:
        for spec in PROVISIONED_USERS:
            email = spec.email.lower()
            row = db.query(User).filter(User.email == email).first()
            if row is None:
                db.add(
                    User(
                        full_name=spec.full_name,
                        email=email,
                        password_hash=hash_password(spec.password),
                        role=spec.role.value,
                        is_active=True,
                        is_provisioned=True,
                    )
                )
                created += 1
                print(f"  + created {email} ({spec.role.value})")
            else:
                row.full_name = spec.full_name
                row.password_hash = hash_password(spec.password)
                row.role = spec.role.value
                row.is_active = True
                row.is_provisioned = True
                updated += 1
                print(f"  ~ updated {email} ({spec.role.value})")
        db.commit()
        print(f"Done. created={created} updated={updated}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
