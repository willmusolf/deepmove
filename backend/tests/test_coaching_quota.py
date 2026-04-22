"""Quota and spend-control coverage for coaching."""

from datetime import UTC, datetime, timedelta

import pytest

from app.config import settings
from app.models.game import Game
from app.models.lesson import Lesson
from app.models.user import User
from app.services import coaching as coaching_service
from tests.test_admin import make_admin_client
from tests.test_coaching_validation import make_coaching_payload


@pytest.fixture(autouse=True)
def reset_usage_state(monkeypatch):
    coaching_service.reset_usage_state()
    monkeypatch.setattr(settings, "coaching_enabled", True)
    monkeypatch.setattr(settings, "free_tier_daily_lessons", 50)
    monkeypatch.setattr(settings, "premium_daily_lessons", 500)
    monkeypatch.setattr(settings, "guest_daily_lessons", 10)
    monkeypatch.setattr(settings, "max_daily_llm_calls", 5000)
    monkeypatch.setattr(settings, "estimated_llm_cost_usd", 0.01)
    yield
    coaching_service.reset_usage_state()


def _today():
    return datetime.now(UTC).date()


def _stub_lesson(**overrides):
    result = {
        "lesson": "Find the threat before continuing your plan.",
        "category": "ignored_threat",
        "principle_id": "scan-threats",
        "confidence": 92,
        "cached": False,
        "fallback_used": False,
        "model": "test-model",
    }
    result.update(overrides)
    return result


class TestCoachingQuota:
    def test_free_user_limit_returns_429(self, auth_client, db_session, monkeypatch):
        client, _token, user_data = auth_client
        user = db_session.query(User).filter(User.id == user_data["id"]).first()
        assert user is not None
        user.daily_lesson_count = settings.free_tier_daily_lessons
        user.daily_lesson_reset = _today()
        db_session.commit()

        async def should_not_run(_request: dict) -> dict:
            raise AssertionError("LLM should not run when user quota is exhausted")

        monkeypatch.setattr("app.routes.coaching.coaching_service.generate_lesson", should_not_run)

        resp = client.post("/coaching/lesson", json=make_coaching_payload())
        assert resp.status_code == 429
        assert resp.headers["Retry-After"]
        detail = resp.json()["detail"]
        assert detail["limit"] == settings.free_tier_daily_lessons
        assert detail["used"] == settings.free_tier_daily_lessons

    def test_premium_user_limit_returns_429(self, auth_client, db_session, monkeypatch):
        client, _token, user_data = auth_client
        user = db_session.query(User).filter(User.id == user_data["id"]).first()
        assert user is not None
        user.is_premium = True
        user.daily_lesson_count = settings.premium_daily_lessons
        user.daily_lesson_reset = _today()
        db_session.commit()

        async def should_not_run(_request: dict) -> dict:
            raise AssertionError("LLM should not run when premium quota is exhausted")

        monkeypatch.setattr("app.routes.coaching.coaching_service.generate_lesson", should_not_run)

        resp = client.post(
            "/coaching/lesson",
            json=make_coaching_payload(position_hash="premium-limit"),
        )
        assert resp.status_code == 429
        detail = resp.json()["detail"]
        assert detail["limit"] == settings.premium_daily_lessons
        assert detail["used"] == settings.premium_daily_lessons

    def test_guest_limit_returns_429(self, client, monkeypatch):
        for _ in range(settings.guest_daily_lessons):
            coaching_service.increment_guest_usage("1.2.3.4")

        async def should_not_run(_request: dict) -> dict:
            raise AssertionError("LLM should not run when guest quota is exhausted")

        monkeypatch.setattr("app.routes.coaching.coaching_service.generate_lesson", should_not_run)

        resp = client.post(
            "/coaching/lesson",
            json=make_coaching_payload(position_hash="guest-limit"),
            headers={"X-Forwarded-For": "1.2.3.4"},
        )
        assert resp.status_code == 429
        detail = resp.json()["detail"]
        assert detail["limit"] == settings.guest_daily_lessons
        assert detail["used"] == settings.guest_daily_lessons

    def test_cached_db_lesson_is_served_even_at_quota(self, auth_client, db_session):
        client, _token, user_data = auth_client
        user = db_session.query(User).filter(User.id == user_data["id"]).first()
        assert user is not None

        game = Game(
            user_id=user.id,
            platform="chesscom",
            platform_game_id="game_123",
            pgn="1. e4 e5 2. Nf3 Nc6 1-0",
            user_color="white",
        )
        db_session.add(game)
        db_session.flush()
        db_session.add(
            Lesson(
                game_id=game.id,
                user_id=user.id,
                move_number=18,
                color="white",
                principle_id="scan-threats",
                confidence=92,
                lesson_text="Cached lesson",
                elo_band="1200-1400",
            )
        )
        user.daily_lesson_count = settings.free_tier_daily_lessons
        user.daily_lesson_reset = _today()
        db_session.commit()

        resp = client.post(
            "/coaching/lesson",
            json=make_coaching_payload(backend_game_id=game.id),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["cached"] is True
        assert data["lesson"] == "Cached lesson"

    def test_global_ceiling_serves_fallback_without_incrementing_user(self, auth_client, db_session, monkeypatch):
        client, _token, user_data = auth_client
        user = db_session.query(User).filter(User.id == user_data["id"]).first()
        assert user is not None
        monkeypatch.setattr(settings, "max_daily_llm_calls", 1)

        async def fake_generate_lesson(_request: dict) -> dict:
            return _stub_lesson()

        monkeypatch.setattr("app.routes.coaching.coaching_service.generate_lesson", fake_generate_lesson)

        first = client.post(
            "/coaching/lesson",
            json=make_coaching_payload(position_hash="global-1"),
        )
        assert first.status_code == 200
        assert first.json()["fallback_used"] is False

        second = client.post(
            "/coaching/lesson",
            json=make_coaching_payload(position_hash="global-2"),
        )
        assert second.status_code == 200
        assert second.json()["fallback_used"] is True

        db_session.refresh(user)
        assert user.daily_lesson_count == 1

    def test_admin_ops_status_includes_spend_summary(self, client, db_session):
        client, _admin = make_admin_client(client, db_session)
        coaching_service.increment_global_daily_calls()

        resp = client.get("/admin/ops/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["spend"]["daily_llm_calls"] == 1
        assert data["spend"]["daily_llm_ceiling"] == settings.max_daily_llm_calls
        assert data["spend"]["estimated_daily_cost_usd"] == 0.01

    def test_user_quota_resets_on_new_day(self, auth_client, db_session, monkeypatch):
        client, _token, user_data = auth_client
        user = db_session.query(User).filter(User.id == user_data["id"]).first()
        assert user is not None
        user.daily_lesson_count = settings.free_tier_daily_lessons
        user.daily_lesson_reset = _today() - timedelta(days=1)
        db_session.commit()

        async def fake_generate_lesson(_request: dict) -> dict:
            return _stub_lesson()

        monkeypatch.setattr("app.routes.coaching.coaching_service.generate_lesson", fake_generate_lesson)

        resp = client.post(
            "/coaching/lesson",
            json=make_coaching_payload(position_hash="new-day"),
        )
        assert resp.status_code == 200

        db_session.refresh(user)
        assert user.daily_lesson_count == 1
        assert user.daily_lesson_reset == _today()
