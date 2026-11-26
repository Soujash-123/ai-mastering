"""Tests for /api/early-access public routes."""
from __future__ import annotations


def test_submit_request_success(client):
    resp = client.post(
        "/api/early-access/requests",
        json={
            "name": "Jane Doe",
            "email": "jane@example.com",
            "phone": "555-123-4567",
            "reason": "I want to try the mastering engine for my new album project.",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "jane@example.com"
    assert body["status"] == "PENDING"


def test_submit_request_invalid_phone(client):
    resp = client.post(
        "/api/early-access/requests",
        json={
            "name": "Jane Doe",
            "email": "jane2@example.com",
            "phone": "123",
            "reason": "I want to try the mastering engine for my new album project.",
        },
    )
    assert resp.status_code == 422


def _payload(email: str, **overrides):
    body = {"name": "Jane Doe", "email": email, "phone": "555-123-4567", "reason": "Indie EP"}
    body.update(overrides)
    return body


def test_submit_request_short_reason_allowed(client):
    resp = client.post("/api/early-access/requests", json=_payload("jane3@example.com", reason="too short"))
    assert resp.status_code == 201
    assert resp.json()["reason"] == "too short"


def test_submit_request_reason_optional(client):
    body = _payload("jane4@example.com")
    del body["reason"]
    resp = client.post("/api/early-access/requests", json=body)
    assert resp.status_code == 201
    assert resp.json()["reason"] == ""


def test_submit_request_empty_reason(client):
    resp = client.post("/api/early-access/requests", json=_payload("jane5@example.com", reason=""))
    assert resp.status_code == 201


def test_submit_request_reason_too_long(client):
    resp = client.post("/api/early-access/requests", json=_payload("jane6@example.com", reason="x" * 2001))
    assert resp.status_code == 422


def test_duplicate_pending_request_conflicts(client):
    assert client.post("/api/early-access/requests", json=_payload("dupe@example.com")).status_code == 201
    # Same address, different case: still the same person.
    resp = client.post("/api/early-access/requests", json=_payload("Dupe@Example.com"))
    assert resp.status_code == 409
    assert resp.json()["detail"] == "You've already requested access — we'll be in touch."


def test_new_request_allowed_after_review(client, admin_headers):
    first = client.post("/api/early-access/requests", json=_payload("again@example.com"))
    assert first.status_code == 201
    review = client.patch(
        f"/api/admin/early-access-requests/{first.json()['id']}",
        json={"status": "REJECTED"},
        headers=admin_headers,
    )
    assert review.status_code == 200
    assert client.post("/api/early-access/requests", json=_payload("again@example.com")).status_code == 201
