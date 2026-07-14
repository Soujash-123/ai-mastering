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


def test_submit_request_short_reason(client):
    resp = client.post(
        "/api/early-access/requests",
        json={
            "name": "Jane Doe",
            "email": "jane3@example.com",
            "phone": "555-123-4567",
            "reason": "too short",
        },
    )
    assert resp.status_code == 422
