"""Logging and request correlation coverage."""

import logging

from fastapi.security import HTTPAuthorizationCredentials
from starlette.requests import Request

from app.dependencies import get_optional_user
from app.utils.security import create_access_token


def test_request_id_header_is_generated(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.headers["X-Request-ID"]


def test_request_id_header_echoes_incoming_value(client):
    response = client.get("/health", headers={"X-Request-ID": "req-123"})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "req-123"


def test_security_headers_are_set(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response.headers["Permissions-Policy"] == "camera=(), microphone=(), geolocation=()"


def test_version_does_not_disclose_runtime_details(client):
    response = client.get("/version")
    assert response.status_code == 200
    body = response.json()
    assert "commit_sha" in body
    assert "build_time" in body
    assert "python_version" not in body
    assert "environment" not in body


def test_get_optional_user_logs_degradation_when_db_unavailable(monkeypatch, caplog):
    token = create_access_token(123, 0)
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    request = Request(
        {
            "type": "http",
            "headers": [],
            "client": ("203.0.113.10", 1234),
            "method": "GET",
            "path": "/coaching/lesson",
        }
    )

    def broken_session_local():
        raise RuntimeError("db unavailable")

    monkeypatch.setattr("app.database.SessionLocal", broken_session_local)

    with caplog.at_level(logging.WARNING):
        user = get_optional_user(request=request, credentials=credentials)

    assert user is None
    records = [record for record in caplog.records if getattr(record, "event", None) == "system.auth_degradation"]
    assert records
    assert records[0].user_id_from_token == 123
    assert records[0].ip == "203.0.113.10"
