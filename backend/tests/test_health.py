"""Smoke coverage for shallow/deep health and version endpoints."""

from app.config import settings


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "deepmove-api"}


def test_health_check_accepts_head(client):
    response = client.head("/health")
    assert response.status_code == 200


def test_health_deep_ok(client, monkeypatch):
    async def fake_database_check() -> bool:
        return True

    monkeypatch.setattr("app.main._database_is_reachable", fake_database_check)
    monkeypatch.setattr("app.main.coaching_service.lesson_cache_size", lambda: 7)
    monkeypatch.setattr(settings, "coaching_enabled", True)
    monkeypatch.setattr(settings, "environment", "staging")

    response = client.get("/health/deep")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "deepmove-api",
        "checks": {
            "database": "ok",
            "coaching_enabled": True,
            "lesson_cache_size": 7,
        },
        "environment": "staging",
    }


def test_health_deep_accepts_head(client, monkeypatch):
    async def fake_database_check() -> bool:
        return True

    monkeypatch.setattr("app.main._database_is_reachable", fake_database_check)

    response = client.head("/health/deep")

    assert response.status_code == 200


def test_health_deep_degraded_when_database_unreachable(client, monkeypatch):
    async def fake_database_check() -> bool:
        return False

    monkeypatch.setattr("app.main._database_is_reachable", fake_database_check)
    monkeypatch.setattr("app.main.coaching_service.lesson_cache_size", lambda: 0)
    monkeypatch.setattr(settings, "coaching_enabled", False)
    monkeypatch.setattr(settings, "environment", "production")

    response = client.get("/health/deep")

    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "service": "deepmove-api",
        "checks": {
            "database": "unreachable",
            "coaching_enabled": False,
            "lesson_cache_size": 0,
        },
        "environment": "production",
    }


def test_version_endpoint_returns_build_metadata_only(client, monkeypatch):
    monkeypatch.setattr(settings, "git_commit_sha", "abc123")
    monkeypatch.setattr(settings, "build_time", "2026-04-22T01:23:45Z")

    response = client.get("/version")

    assert response.status_code == 200
    payload = response.json()
    assert payload["commit_sha"] == "abc123"
    assert payload["build_time"] == "2026-04-22T01:23:45Z"
    assert "environment" not in payload
    assert "python_version" not in payload
