"""test_users.py — User profile, update, GDPR delete, and data export tests."""

from tests.conftest import make_game_payload


class TestUserProfile:
    def test_get_me(self, auth_client):
        client, token, user = auth_client
        resp = client.get("/users/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "testuser@deepmove.io"
        assert data["is_premium"] is False
        assert data["preferences"] == {}

    def test_update_chesscom_username(self, auth_client):
        client, token, user = auth_client
        resp = client.patch("/users/me", json={
            "chesscom_username": "moosetheman123",
        })
        assert resp.status_code == 200
        assert resp.json()["chesscom_username"] == "moosetheman123"

    def test_update_lichess_username(self, auth_client):
        client, token, user = auth_client
        resp = client.patch("/users/me", json={
            "lichess_username": "lichessplayer",
        })
        assert resp.status_code == 200
        assert resp.json()["lichess_username"] == "lichessplayer"

    def test_update_elo(self, auth_client):
        client, token, user = auth_client
        resp = client.patch("/users/me", json={"elo_estimate": 1330})
        assert resp.status_code == 200
        assert resp.json()["elo_estimate"] == 1330

    def test_update_preferences_sets_values(self, auth_client):
        client, token, user = auth_client
        resp = client.patch("/users/me", json={
            "preferences": {"soundEnabled": True, "theme": "dark"},
        })
        assert resp.status_code == 200
        prefs = resp.json()["preferences"]
        assert prefs["soundEnabled"] is True
        assert prefs["theme"] == "dark"

    def test_update_preferences_merges_with_existing(self, auth_client):
        """Setting new preferences should merge with existing ones."""
        client, token, user = auth_client
        # Set initial preferences
        client.patch("/users/me", json={
            "preferences": {"soundEnabled": True},
        })
        # Add new preference — should merge
        resp = client.patch("/users/me", json={
            "preferences": {"theme": "dark"},
        })
        assert resp.status_code == 200
        prefs = resp.json()["preferences"]
        assert prefs.get("soundEnabled") is True
        assert prefs.get("theme") == "dark"

    def test_update_partial_fields(self, auth_client):
        """Updating one field should not null out others."""
        client, token, user = auth_client
        client.patch("/users/me", json={"chesscom_username": "player1"})
        resp = client.patch("/users/me", json={"elo_estimate": 1500})
        assert resp.json()["chesscom_username"] == "player1"
        assert resp.json()["elo_estimate"] == 1500


class TestGDPRDelete:
    def test_delete_user(self, auth_client):
        client, token, user = auth_client
        resp = client.delete("/users/me")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True

        # Token should no longer work
        resp2 = client.get("/users/me")
        assert resp2.status_code == 401

    def test_delete_cascades_games(self, auth_client):
        """Deleting user should also delete their games."""
        client, token, user = auth_client
        create = client.post("/games/", json=make_game_payload())
        game_id = create.json()["id"]

        # Delete user
        client.delete("/users/me")

        # Re-register to get a valid token, then check the game is gone
        resp = client.post("/auth/register", json={
            "email": "cascade_check@deepmove.io",
            "password": "password123",
        })
        client.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"
        # The game belonged to the deleted user, should be cascade-deleted
        resp2 = client.get(f"/games/{game_id}")
        assert resp2.status_code == 404


class TestDataExport:
    def test_export_user_data(self, auth_client):
        client, token, user = auth_client
        # Create a game so there's data to export
        client.post("/games/", json=make_game_payload())

        resp = client.get("/users/me/export")
        assert resp.status_code == 200
        data = resp.json()
        assert "user" in data
        assert "games" in data
        assert "lessons" in data
        assert "principles" in data
        assert data["user"]["email"] == "testuser@deepmove.io"
        assert len(data["games"]) >= 1


class TestFullAuthFlow:
    """End-to-end: register → update profile → create game → export → delete."""

    def test_complete_lifecycle(self, client):
        # 1. Register
        resp = client.post("/auth/register", json={
            "email": "lifecycle@deepmove.io",
            "password": "password123",
        })
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        client.headers["Authorization"] = f"Bearer {token}"

        # 2. Update profile
        resp = client.patch("/users/me", json={
            "chesscom_username": "moosetheman123",
            "elo_estimate": 1330,
        })
        assert resp.json()["chesscom_username"] == "moosetheman123"

        # 3. Create games
        for i in range(3):
            client.post("/games/", json=make_game_payload(
                platform_game_id=f"life_{i}",
            ))

        # 4. List games
        resp = client.get("/games/")
        assert len(resp.json()) == 3

        # 5. Export
        resp = client.get("/users/me/export")
        assert len(resp.json()["games"]) == 3

        # 6. Logout
        resp = client.post("/auth/logout")
        assert resp.status_code == 200

        # 7. Old token revoked
        resp = client.get("/users/me")
        assert resp.status_code == 401

        # 8. Login again
        resp = client.post("/auth/login", json={
            "email": "lifecycle@deepmove.io",
            "password": "password123",
        })
        assert resp.status_code == 200
        client.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"

        # 9. Delete account (GDPR)
        resp = client.delete("/users/me")
        assert resp.json()["deleted"] is True

        # 10. Cannot access anymore
        resp = client.get("/users/me")
        assert resp.status_code == 401
