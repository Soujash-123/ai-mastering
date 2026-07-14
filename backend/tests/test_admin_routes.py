"""Tests for /api/admin routes (role-guarded)."""
from __future__ import annotations

from auth.schemas import UserRole


def test_list_users_requires_admin(client, rollout_headers):
    assert client.get("/api/admin/users", headers=rollout_headers).status_code == 403


def test_list_users_requires_auth(client):
    assert client.get("/api/admin/users").status_code == 401


def test_list_users_as_admin(client, admin_headers, make_user):
    make_user(UserRole.ROLLOUT, "u1@example.com")
    resp = client.get("/api/admin/users", headers=admin_headers)
    assert resp.status_code == 200
    emails = {u["email"] for u in resp.json()}
    assert "admin@example.com" in emails
    assert "u1@example.com" in emails


def test_update_user_role(client, admin_headers, make_user):
    target = make_user(UserRole.ROLLOUT, "promote@example.com")
    resp = client.patch(
        f"/api/admin/users/{target.id}",
        headers=admin_headers,
        json={"role": "EARLY_ACCESS"},
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "EARLY_ACCESS"


def test_update_user_deactivate(client, admin_headers, make_user):
    target = make_user(UserRole.ROLLOUT, "deact@example.com")
    resp = client.patch(
        f"/api/admin/users/{target.id}",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


def test_update_user_not_found(client, admin_headers):
    resp = client.patch("/api/admin/users/999999", headers=admin_headers, json={"is_active": False})
    assert resp.status_code == 404


def test_update_provisioned_user_forbidden(client, admin_headers, make_user):
    target = make_user(UserRole.ADMIN, "prov@example.com", is_provisioned=True)
    resp = client.patch(f"/api/admin/users/{target.id}", headers=admin_headers, json={"is_active": False})
    assert resp.status_code == 403


def test_list_early_access_requests_as_admin(client, admin_headers):
    resp = client.get("/api/admin/early-access-requests", headers=admin_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_list_early_access_requests_requires_admin(client, rollout_headers):
    assert client.get("/api/admin/early-access-requests", headers=rollout_headers).status_code == 403


def test_review_early_access_request(client, admin_headers):
    # Create a request via the public endpoint first.
    created = client.post(
        "/api/early-access/requests",
        json={
            "name": "Requester",
            "email": "req@example.com",
            "phone": "1234567890",
            "reason": "I would really like early access to test the product.",
        },
    )
    request_id = created.json()["id"]
    resp = client.patch(
        f"/api/admin/early-access-requests/{request_id}",
        headers=admin_headers,
        json={"status": "APPROVED"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "APPROVED"


def test_review_early_access_request_not_found(client, admin_headers):
    resp = client.patch(
        "/api/admin/early-access-requests/999999",
        headers=admin_headers,
        json={"status": "REJECTED"},
    )
    assert resp.status_code == 404
