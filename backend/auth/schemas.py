from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    EARLY_ACCESS = "EARLY_ACCESS"
    ROLLOUT = "ROLLOUT"


class EarlyAccessStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class EarlyAccessRequestCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=32)
    reason: str = Field(min_length=20, max_length=2000)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = "".join(c for c in v if c.isdigit())
        if len(digits) < 7 or len(digits) > 15:
            raise ValueError("Enter a valid phone number (7–15 digits).")
        return v.strip()


class EarlyAccessRequestResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: str
    reason: str
    status: EarlyAccessStatus
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class AdminEarlyAccessUpdate(BaseModel):
    status: EarlyAccessStatus
