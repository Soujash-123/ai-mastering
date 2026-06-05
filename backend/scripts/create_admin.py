#!/usr/bin/env python3
"""Create or promote an admin user. Usage: python scripts/create_admin.py email@example.com 'Full Name' 'password'"""

from __future__ import annotations

import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))
import os

# Ensure the script uses the backend/ working directory so Settings reads backend/.env
os.chdir(str(_BACKEND))

from auth.database import SessionLocal, init_db
from auth.models import User
from auth.schemas import UserRole
from auth.security import hash_password


def main() -> None:
    if len(sys.argv) != 4:
        print("Usage: python scripts/create_admin.py <email> <full_name> <password>")
        sys.exit(1)

    email, full_name, password = sys.argv[1].lower(), sys.argv[2], sys.argv[3]
    init_db()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.role = UserRole.ADMIN.value
            user.password_hash = hash_password(password)
            user.is_active = True
            print(f"Promoted existing user to ADMIN: {email}")
        else:
            db.add(
                User(
                    full_name=full_name,
                    email=email,
                    password_hash=hash_password(password),
                    role=UserRole.ADMIN.value,
                    is_active=True,
                )
            )
            print(f"Created ADMIN user: {email}")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
