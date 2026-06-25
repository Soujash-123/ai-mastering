from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth.database import get_db
from auth.dependencies import get_current_user
from auth.models import User
from auth.schemas import LoginRequest, RegisterRequest, TokenResponse, UserResponse, UserRole
from auth.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    email = body.email.lower()
    if is_provisioned_email(email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This email is provisioned by KORD. Sign in with your assigned password.",
        )
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        full_name=body.full_name.strip(),
        email=email,
        password_hash=hash_password(body.password),
        role=UserRole.ROLLOUT.value,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user_id=user.id, email=user.email, role=UserRole(user.role))
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

    token = create_access_token(user_id=user.id, email=user.email, role=UserRole(user.role))
    return TokenResponse(access_token=token)


@router.post("/logout")
def logout() -> dict[str, str]:
    """JWT logout is client-side (discard token). Endpoint provided for API symmetry."""
    return {"status": "logged_out"}


@router.get("/me", response_model=UserResponse)
def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user
