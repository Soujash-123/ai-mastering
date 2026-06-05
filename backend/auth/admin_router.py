from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth.database import get_db
from auth.dependencies import require_roles
from auth.models import EarlyAccessRequest, User
from auth.schemas import (
    AdminEarlyAccessUpdate,
    AdminUserUpdate,
    EarlyAccessRequestResponse,
    EarlyAccessStatus,
    UserResponse,
    UserRole,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[UserResponse])
def list_users(
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    db: Annotated[Session, Depends(get_db)],
) -> list[User]:
    return db.query(User).order_by(User.created_at.desc()).all()


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    body: AdminUserUpdate,
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role is not None:
        user.role = body.role.value
    if body.is_active is not None:
        user.is_active = body.is_active
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


@router.get("/early-access-requests", response_model=list[EarlyAccessRequestResponse])
def list_early_access_requests(
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    db: Annotated[Session, Depends(get_db)],
) -> list[EarlyAccessRequest]:
    return db.query(EarlyAccessRequest).order_by(EarlyAccessRequest.created_at.desc()).all()


@router.patch("/early-access-requests/{request_id}", response_model=EarlyAccessRequestResponse)
def review_early_access_request(
    request_id: int,
    body: AdminEarlyAccessUpdate,
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    db: Annotated[Session, Depends(get_db)],
) -> EarlyAccessRequest:
    req = db.get(EarlyAccessRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    req.status = body.status.value
    if body.status == EarlyAccessStatus.APPROVED:
        user = db.query(User).filter(User.email == req.email).first()
        if user:
            user.role = UserRole.EARLY_ACCESS.value
            user.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(req)
    return req
