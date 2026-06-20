from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth.database import get_db
from auth.models import EarlyAccessRequest
from auth.schemas import EarlyAccessRequestCreate, EarlyAccessRequestResponse, EarlyAccessStatus

router = APIRouter(prefix="/api/early-access", tags=["early-access"])


@router.post("/requests", response_model=EarlyAccessRequestResponse, status_code=201)
def submit_early_access_request(
    body: EarlyAccessRequestCreate,
    db: Annotated[Session, Depends(get_db)],
) -> EarlyAccessRequest:
    req = EarlyAccessRequest(
        name=body.name.strip(),
        email=body.email.lower(),
        phone=body.phone.strip(),
        reason=body.reason.strip(),
        status=EarlyAccessStatus.PENDING.value,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req
