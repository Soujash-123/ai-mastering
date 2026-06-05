#!/usr/bin/env python3
"""Seed early-access users. Run from backend/: python scripts/seed_early_access.py"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import os

# Ensure the script uses the backend/ working directory so Settings reads backend/.env
os.chdir(str(Path(__file__).resolve().parents[1]))

from auth.database import SessionLocal, init_db
from auth.models import User
from auth.schemas import UserRole
from auth.security import hash_password

USERS = [
    {"full_name": "Soujash Banerjee", "email": "soujash.banerjee@syntalix.in", "password": "9831970136"},
    {"full_name": "Prakash VS Tomar", "email": "prakashvs.tomar@syntalix.in",  "password": "8979790975"},
    {"full_name": "Nitin Yadav",       "email": "nitin.yadav@syntalix.in",      "password": "9510351193"},
    {"full_name": "Apple DJ",          "email": "apple.dj@syntalix.in",         "password": "7596913957"},
    {"full_name": "Ronn E",            "email": "ronn.e@syntalix.in",           "password": "6291704628"},
    {"full_name": "Ankur Kaur",        "email": "ankur.kaur@syntalix.in",       "password": "9123623160"},
]

# Emails that get EARLY_ACCESS; all others get ROLLOUT.
# Currently all users are EARLY_ACCESS — adjust this set to demote users to ROLLOUT.
EARLY_ACCESS_EMAILS = {u["email"] for u in USERS}


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        for u in USERS:
            role_value = UserRole.EARLY_ACCESS.value if u["email"] in EARLY_ACCESS_EMAILS else UserRole.ROLLOUT.value
            pw_hash = hash_password(u["password"])
            existing = db.query(User).filter(User.email == u["email"]).first()
            if existing:
                existing.role = role_value
                existing.password_hash = pw_hash
                existing.is_active = True
                print(f"Updated: {u['email']} -> {role_value}")
            else:
                db.add(User(
                    full_name=u["full_name"],
                    email=u["email"],
                    password_hash=pw_hash,
                    role=role_value,
                    is_active=True,
                ))
                print(f"Created: {u['email']} -> {role_value}")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
