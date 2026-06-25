"""Immutable provisioned accounts — edit only via scripts/seed_access_users.py."""

from __future__ import annotations

from dataclasses import dataclass

from auth.schemas import UserRole


@dataclass(frozen=True)
class ProvisionedUser:
    email: str
    password: str
    role: UserRole
    full_name: str


# Name / password / role — passwords are the numeric values from access list.
PROVISIONED_USERS: tuple[ProvisionedUser, ...] = (
    ProvisionedUser("soujash.banerjee@syntalix.com", "9831970136", UserRole.ADMIN, "Soujash Banerjee"),
    ProvisionedUser("ahana.mukherjee@syntalix.com", "8296021432", UserRole.ADMIN, "Ahana Mukherjee"),
    ProvisionedUser("prakash.tomar@syntalix.com", "8979790975", UserRole.ADMIN, "Prakash Tomar"),
    ProvisionedUser("anmol.gaurav@syntalix.com", "7991143152", UserRole.ADMIN, "Anmol Gaurav"),
    ProvisionedUser("nitin.yadav@syntalix.com", "9510351193", UserRole.EARLY_ACCESS, "Nitin Yadav"),
    ProvisionedUser("ron.e@syntalix.com", "6291704628", UserRole.EARLY_ACCESS, "Ron E"),
    ProvisionedUser("apple.dj@syntalix.com", "7596913957", UserRole.EARLY_ACCESS, "Apple DJ"),
    ProvisionedUser("ankur.kaur@syntalix.com", "9123623160", UserRole.EARLY_ACCESS, "Ankur Kaur"),
)

_PROVISIONED_EMAILS = frozenset(u.email.lower() for u in PROVISIONED_USERS)


def is_provisioned_email(email: str) -> bool:
    return email.strip().lower() in _PROVISIONED_EMAILS


def find_provisioned(email: str) -> ProvisionedUser | None:
    key = email.strip().lower()
    for user in PROVISIONED_USERS:
        if user.email.lower() == key:
            return user
    return None
