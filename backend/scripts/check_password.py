from __future__ import annotations
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from auth.database import SessionLocal
from auth.security import verify_password

EMAILS = [
    'soujash.banerjee@syntalix.in',
    'prakashvs.tomar@syntalix.in',
    'nitin.yadav@syntalix.in',
    'apple.dj@syntalix.in',
    'ronn.e@syntalix.in',
    'ankur.kaur@syntalix.in',
]
PW = 'Syntalix@12345'

def main():
    db = SessionLocal()
    try:
        for e in EMAILS:
            u = db.query(__import__('auth.models', fromlist=['User']).User).filter(__import__('auth.models', fromlist=['User']).User.email==e).first()
            if not u:
                print(f"{e}: NOT FOUND")
                continue
            ok = verify_password(PW, u.password_hash)
            print(f"{e}: found, verify_password -> {ok}")
    finally:
        db.close()

if __name__ == '__main__':
    main()
