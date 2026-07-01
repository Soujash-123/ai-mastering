"""Print per-user mastered counts to the terminal.

Usage:
    python backend/scripts/show_mastery_counts.py

Runs against the same DB configured in `backend/utils/config.py`.
"""
from __future__ import annotations

from auth.database import SessionLocal
from auth.models import User


def _format_row(email: str, name: str, count: int) -> str:
    return f"{email:40.40} | {name:30.30} | {count:6d}"


def main() -> None:
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.mastered_count.desc(), User.email.asc()).all()
        if not users:
            print("No users found in database.")
            return
        print("Email                                      | Full Name                      | Count ")
        print("-" * 85)
        total_users_with_mastery = 0
        total_mastered = 0
        for u in users:
            cnt = int(u.mastered_count or 0)
            if cnt > 0:
                total_users_with_mastery += 1
            total_mastered += cnt
            print(_format_row(u.email or "", u.full_name or "", cnt))
        print("-" * 85)
        print(f"Users with mastery >0: {total_users_with_mastery}, Total mastered songs: {total_mastered}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
