"""test_games.py — Game CRUD, batch upload, sync, and deletion tests."""
import pytest

from tests.conftest import SAMPLE_PGN, make_game_payload


class TestGameCRUD:
    def test_create_game(self, auth_client):
        client, token, user = auth_client
        resp = client.post("/games/", json=make_game_payload())
        assert resp.status_code == 201
        data = resp.json()
        assert data["platform"] == "chesscom"
        assert data["platform_game_id"] == "game_001"
        assert data["user_elo"] == 1330
        assert data["pgn"] == SAMPLE_PGN
        assert "id" in data

    def test_create_game_unauthenticated(self, client):
        resp = client.post("/games/", json=make_game_payload())
        assert resp.status_code == 401

    def test_get_game(self, auth_client):
        client, token, user = auth_client
        create = client.post("/games/", json=make_game_payload())
        game_id = create.json()["id"]

        resp = client.get(f"/games/{game_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == game_id
        assert resp.json()["move_evals"] is not None

    def test_get_game_not_found(self, auth_client):
        client, token, user = auth_client
        resp = client.get("/games/999999")
        assert resp.status_code == 404

    def test_get_other_users_game_404(self, client):
        """A user should not be able to access another user's game."""
        # Register user A and create a game
        resp_a = client.post("/auth/register", json={
            "email": "usera@deepmove.io", "password": "password123",
        })
        token_a = resp_a.json()["access_token"]
        client.headers["Authorization"] = f"Bearer {token_a}"
        create = client.post("/games/", json=make_game_payload(platform_game_id="a_game"))
        game_id = create.json()["id"]

        # Register user B
        resp_b = client.post("/auth/register", json={
            "email": "userb@deepmove.io", "password": "password123",
        })
        token_b = resp_b.json()["access_token"]
        client.headers["Authorization"] = f"Bearer {token_b}"

        # User B should not see user A's game
        resp = client.get(f"/games/{game_id}")
        assert resp.status_code == 404

    def test_list_games(self, auth_client):
        client, token, user = auth_client
        client.post("/games/", json=make_game_payload(platform_game_id="g1"))
        client.post("/games/", json=make_game_payload(platform_game_id="g2"))

        resp = client.get("/games/")
        assert resp.status_code == 200
        games = resp.json()
        assert len(games) >= 2
        # List response should NOT include move_evals (lightweight)
        assert "move_evals" not in games[0]

    def test_list_games_filter_by_platform(self, auth_client):
        client, token, user = auth_client
        client.post("/games/", json=make_game_payload(
            platform="chesscom", platform_game_id="cc1"
        ))
        client.post("/games/", json=make_game_payload(
            platform="lichess", platform_game_id="li1"
        ))

        resp = client.get("/games/?platform=lichess")
        assert resp.status_code == 200
        games = resp.json()
        assert all(g["platform"] == "lichess" for g in games)

    def test_create_duplicate_updates_existing(self, auth_client):
        client, token, user = auth_client
        payload = make_game_payload(platform_game_id="dup_game")
        resp1 = client.post("/games/", json=payload)
        assert resp1.status_code == 201
        game_id = resp1.json()["id"]

        # Post again with updated evals
        payload["move_evals"] = [{"moveNumber": 1, "eval": 0.5}]
        resp2 = client.post("/games/", json=payload)
        assert resp2.status_code == 201
        # Same game ID (updated, not duplicated)
        assert resp2.json()["id"] == game_id
        assert resp2.json()["move_evals"] == [{"moveNumber": 1, "eval": 0.5}]

    def test_delete_game(self, auth_client):
        client, token, user = auth_client
        create = client.post("/games/", json=make_game_payload(platform_game_id="del_me"))
        game_id = create.json()["id"]

        resp = client.delete(f"/games/{game_id}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True

        # Confirm it's gone
        resp2 = client.get(f"/games/{game_id}")
        assert resp2.status_code == 404

    def test_delete_other_users_game_404(self, client):
        # User A creates a game
        resp_a = client.post("/auth/register", json={
            "email": "dela@deepmove.io", "password": "password123",
        })
        client.headers["Authorization"] = f"Bearer {resp_a.json()['access_token']}"
        create = client.post("/games/", json=make_game_payload(platform_game_id="a_owns"))
        game_id = create.json()["id"]

        # User B tries to delete it
        resp_b = client.post("/auth/register", json={
            "email": "delb@deepmove.io", "password": "password123",
        })
        client.headers["Authorization"] = f"Bearer {resp_b.json()['access_token']}"
        resp = client.delete(f"/games/{game_id}")
        assert resp.status_code == 404


class TestBatchUpload:
    def test_batch_create(self, auth_client):
        client, token, user = auth_client
        games = [
            make_game_payload(platform_game_id=f"batch_{i}")
            for i in range(5)
        ]
        resp = client.post("/games/batch", json=games)
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] == 5
        assert data["updated"] == 0
        assert data["errors"] == []

    def test_batch_updates_existing(self, auth_client):
        client, token, user = auth_client
        # Create one first
        client.post("/games/", json=make_game_payload(platform_game_id="batch_upd"))

        # Batch with same ID should update
        games = [make_game_payload(platform_game_id="batch_upd")]
        resp = client.post("/games/batch", json=games)
        data = resp.json()
        assert data["created"] == 0
        assert data["updated"] == 1

    def test_batch_max_50(self, auth_client):
        client, token, user = auth_client
        games = [
            make_game_payload(platform_game_id=f"over_{i}")
            for i in range(51)
        ]
        resp = client.post("/games/batch", json=games)
        assert resp.status_code == 400
        assert "50" in resp.json()["detail"]


class TestSyncStatus:
    def test_sync_status(self, auth_client):
        client, token, user = auth_client
        # Server has games A and B
        client.post("/games/", json=make_game_payload(platform_game_id="sync_a"))
        client.post("/games/", json=make_game_payload(platform_game_id="sync_b"))

        # Client says it has B and C
        resp = client.post("/games/sync-status", json={
            "games": [
                {"platform_game_id": "sync_b"},
                {"platform_game_id": "sync_c"},
            ]
        })
        assert resp.status_code == 200
        data = resp.json()
        # Client should upload C (server doesn't have it)
        assert "sync_c" in data["to_upload"]
        # Server should send A to client
        download_ids = [g["platform_game_id"] for g in data["to_download"]]
        assert "sync_a" in download_ids
