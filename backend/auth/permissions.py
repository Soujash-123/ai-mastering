from __future__ import annotations

from typing import Optional

from auth.schemas import UserRole


def max_upload_duration_sec(role: str) -> Optional[float]:
    """Return max seconds allowed for upload, or None for no platform limit (ADMIN)."""
    if role == UserRole.ADMIN.value:
        return None
    if role == UserRole.EARLY_ACCESS.value:
        return 300.0
    return 180.0


def can_access_simulations(role: str) -> bool:
    return role in {UserRole.ADMIN.value, UserRole.EARLY_ACCESS.value}


def duration_limit_message(role: str) -> str:
    if role == UserRole.ROLLOUT.value:
        return "Your Rollout plan allows tracks up to 3 minutes."
    if role == UserRole.EARLY_ACCESS.value:
        return "Early Access allows tracks up to 5 minutes."
    return "Track exceeds your upload limit."
