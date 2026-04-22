"""conftest.py — Test fixtures for DeepMove backend.

Uses a real PostgreSQL database (same Neon instance in dev,
GitHub Actions service container in CI). Creates/drops all tables
per test session for isolation.
"""
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, _psycopg3_url
from app.dependencies import get_db
from app.main import app
from app.models import AdminAuditLog, Game, Lesson, User, UserPrinciple  # noqa: F401
from app.rate_limiting import limiter


def _get_test_db_url() -> str:
    """Return the test database URL. Uses TEST_DATABASE_URL if set, else DATABASE_URL."""
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL", "")
    if not url:
        pytest.skip("No DATABASE_URL set — skipping DB tests")
    return _psycopg3_url(url)


@pytest.fixture(scope="session")
def engine():
    """Create a test engine. Tables are created once per test session."""
    url = _get_test_db_url()
    eng = create_engine(url, poolclass=StaticPool)
    # Drop and recreate all tables for a clean test session
    Base.metadata.drop_all(bind=eng)
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)
    eng.dispose()


@pytest.fixture()
def db_session(engine):
    """Provide a transactional DB session that rolls back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db_session):
    """TestClient with DB session overridden to use the test transaction."""
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def disable_rate_limiting():
    """Keep pytest deterministic by disabling request throttling in tests.

    The suite reuses the same in-process app and client IP, which would otherwise
    cause auth-related tests to trip the production rate limits across test cases.
    """
    previous = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = previous


@pytest.fixture()
def auth_client(client):
    """Register a user and return (client, access_token, user_data)."""
    resp = client.post("/auth/register", json={
        "email": "testuser@deepmove.io",
        "password": "securepassword123",
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    token = data["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client, token, data["user"]


# ── Helpers ──────────────────────────────────────────────────────────────────

SAMPLE_PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O 1-0'

def make_game_payload(**overrides) -> dict:
    """Build a valid GameCreate payload with optional overrides."""
    base = {
        "platform": "chesscom",
        "platform_game_id": "game_001",
        "pgn": SAMPLE_PGN,
        "user_color": "white",
        "user_elo": 1330,
        "opponent": "opponent123",
        "opponent_rating": 1350,
        "result": "W",
        "time_control": "600",
        "end_time": 1710000000000,
        "move_evals": [{"moveNumber": 1, "eval": 0.3}],
        "critical_moments": [],
        "analyzed_at": "2026-03-18T12:00:00Z",
    }
    base.update(overrides)
    return base
