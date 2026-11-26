from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth.database import get_db
from auth.models import EarlyAccessRequest
from auth.schemas import EarlyAccessRequestCreate, EarlyAccessRequestResponse, EarlyAccessStatus

router = APIRouter(prefix="/api/early-access", tags=["early-access"])

DUPLICATE_PENDING_DETAIL = "You've already requested access — we'll be in touch."


@router.post("/requests", response_model=EarlyAccessRequestResponse, status_code=201)
def submit_early_access_request(
    body: EarlyAccessRequestCreate,
    db: Annotated[Session, Depends(get_db)],
) -> EarlyAccessRequest:
    email = body.email.lower()
    pending = (
        db.query(EarlyAccessRequest.id)
        .filter(EarlyAccessRequest.email == email, EarlyAccessRequest.status == EarlyAccessStatus.PENDING.value)
        .first()
    )
    if pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_PENDING_DETAIL)

    req = EarlyAccessRequest(
        name=body.name.strip(),
        email=email,
        phone=body.phone.strip(),
        reason=body.reason.strip(),
        status=EarlyAccessStatus.PENDING.value,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req
