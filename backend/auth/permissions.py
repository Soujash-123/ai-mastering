from __future__ import annotations

from typing import Optional

from auth.schemas import UserRole

# Upload limits (seconds)
_ADMIN_MAX_SEC = 300.0
_EARLY_ACCESS_MAX_SEC = 300.0
_ROLLOUT_MAX_SEC = 120.0


def max_upload_duration_sec(role: str) -> Optional[float]:
    if role == UserRole.ADMIN.value:
        return _ADMIN_MAX_SEC
    if role == UserRole.EARLY_ACCESS.value:
        return _EARLY_ACCESS_MAX_SEC
    return _ROLLOUT_MAX_SEC


def can_access_advanced_features(role: str) -> bool:
    return role in {UserRole.ADMIN.value, UserRole.EARLY_ACCESS.value}


def can_access_full_result(role: str) -> bool:
    return role in {UserRole.ADMIN.value, UserRole.EARLY_ACCESS.value}


def can_access_simulations(role: str) -> bool:
    return can_access_full_result(role)


def duration_limit_message(role: str) -> str:
    if role == UserRole.ROLLOUT.value:
        return "Rollout allows tracks up to 2 minutes."
    if role == UserRole.EARLY_ACCESS.value:
        return "Early Access allows tracks up to 5 minutes."
    if role == UserRole.ADMIN.value:
        return "Admin uploads are limited to 5 minutes."
    return "Track exceeds your upload limit."
