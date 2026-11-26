"""Tests for /api/auth routes."""
from __future__ import annotations


_NEW_USER = {"full_name": "New User", "email": "new@example.com", "password": "password123"}


def test_register_requires_auth(client):
    resp = client.post("/api/auth/register", json=_NEW_USER)
    assert resp.status_code == 401


def test_register_forbidden_for_rollout(client, rollout_headers):
    resp = client.post("/api/auth/register", json=_NEW_USER, headers=rollout_headers)
    assert resp.status_code == 403


def test_register_forbidden_for_early_access(client, early_access_headers):
    resp = client.post("/api/auth/register", json=_NEW_USER, headers=early_access_headers)
    assert resp.status_code == 403


def test_register_success_as_admin(client, admin_headers):
    resp = client.post("/api/auth/register", json=_NEW_USER, headers=admin_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"


def test_register_duplicate_email(client, admin_headers):
    payload = {"full_name": "Dup User", "email": "dup@example.com", "password": "password123"}
    assert client.post("/api/auth/register", json=payload, headers=admin_headers).status_code == 201
    resp = client.post("/api/auth/register", json=payload, headers=admin_headers)
    assert resp.status_code == 409


def test_register_provisioned_email_blocked(client, admin_headers):
    resp = client.post(
        "/api/auth/register",
        json={
            "full_name": "Soujash Banerjee",
            "email": "soujash.banerjee@syntalix.com",
            "password": "password123",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 403


def test_register_invalid_short_password(client, admin_headers):
    resp = client.post(
        "/api/auth/register",
        json={"full_name": "Short", "email": "short@example.com", "password": "123"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_login_success(client, make_user):
    from auth.schemas import UserRole

    make_user(UserRole.ROLLOUT, "login@example.com", "password123")
    resp = client.post("/api/auth/login", json={"email": "login@example.com", "password": "password123"})
    assert resp.status_code == 200
    assert resp.json()["access_token"]


def test_login_wrong_password(client, make_user):
    from auth.schemas import UserRole

    make_user(UserRole.ROLLOUT, "wrong@example.com", "password123")
    resp = client.post("/api/auth/login", json={"email": "wrong@example.com", "password": "nope12345"})
    assert resp.status_code == 401


def test_login_unknown_email(client):
    resp = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "password123"})
    assert resp.status_code == 401


def test_login_inactive_account(client, make_user):
    from auth.schemas import UserRole

    make_user(UserRole.ROLLOUT, "inactive@example.com", "password123", is_active=False)
    resp = client.post("/api/auth/login", json={"email": "inactive@example.com", "password": "password123"})
    assert resp.status_code == 403


def test_logout(client):
    resp = client.post("/api/auth/logout")
    assert resp.status_code == 200
    assert resp.json()["status"] == "logged_out"


def test_me_requires_auth(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_returns_current_user(client, rollout_headers):
    resp = client.get("/api/auth/me", headers=rollout_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "rollout@example.com"


def test_me_invalid_token(client):
    resp = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401
