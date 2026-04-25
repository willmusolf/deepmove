"""Validation coverage for coaching payload limits."""

from app.config import settings


def make_coaching_payload(**overrides) -> dict:
    payload = {
        "user_elo": 1300,
        "opponent_elo": 1350,
        "time_control": "600",
        "time_control_label": "rapid",
        "game_phase": "middlegame",
        "move_number": 18,
        "move_played": "Nf3",
        "eval_before": 0.2,
        "eval_after": -0.8,
        "eval_swing_cp": -100.0,
        "category": "ignored_threat",
        "mistake_type": "blunder",
        "principle_id": "scan-threats",
        "principle_name": "Scan for threats",
        "principle_description": "Check what your opponent is threatening before committing.",
        "principle_takeaway": "Pause and name the threat first.",
        "confidence": 92,
        "verified_facts": [
            "Position: Opponent has pressure on the kingside.",
            "Threat: Black is threatening a discovered attack on the queen.",
        ],
        "engine_move_idea": "The engine wanted a consolidating move that covered the weak square.",
        "elo_band": "1200-1400",
        "position_hash": "abc123",
        "platform_game_id": "game_123",
        "platform": "chesscom",
        "color": "white",
    }
    payload.update(overrides)
    return payload


class TestCoachingValidation:
    def test_valid_coaching_payload_is_accepted(self, client, monkeypatch):
        async def fake_generate_lesson(_request: dict) -> dict:
            return {
                "lesson": "Keep your king safer before expanding.",
                "category": "ignored_threat",
                "principle_id": "scan-threats",
                "confidence": 92,
                "cached": False,
            }

        monkeypatch.setattr("app.routes.coaching.coaching_service.generate_lesson", fake_generate_lesson)
        monkeypatch.setattr(settings, "coaching_enabled", True)

        resp = client.post("/coaching/lesson", json=make_coaching_payload())
        assert resp.status_code == 200
        assert resp.json()["lesson"] == "Keep your king safer before expanding."

    def test_rejects_more_than_ten_verified_facts(self, client, monkeypatch):
        monkeypatch.setattr(settings, "coaching_enabled", True)

        resp = client.post("/coaching/lesson", json=make_coaching_payload(
            verified_facts=[f"Fact {i}" for i in range(11)],
        ))
        assert resp.status_code == 422

    def test_rejects_overlong_verified_fact(self, client, monkeypatch):
        monkeypatch.setattr(settings, "coaching_enabled", True)

        resp = client.post("/coaching/lesson", json=make_coaching_payload(
            verified_facts=["x" * 501],
        ))
        assert resp.status_code == 422

    def test_rejects_overlong_time_control(self, client, monkeypatch):
        monkeypatch.setattr(settings, "coaching_enabled", True)

        resp = client.post("/coaching/lesson", json=make_coaching_payload(
            time_control="x" * 21,
        ))
        assert resp.status_code == 422

    def test_rejects_out_of_range_confidence(self, client, monkeypatch):
        monkeypatch.setattr(settings, "coaching_enabled", True)

        resp = client.post("/coaching/lesson", json=make_coaching_payload(
            confidence=101,
        ))
        assert resp.status_code == 422
