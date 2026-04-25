"""test_auth.py — Comprehensive auth flow tests.

Tests: register, login, refresh, logout, duplicate email, wrong password,
invalid/expired tokens, token version revocation.
"""
import time

from jose import jwt

from app.config import settings

# ── Registration ─────────────────────────────────────────────────────────────

class TestRegister:
    def test_register_success(self, client):
        resp = client.post("/auth/register", json={
            "email": "new@deepmove.io",
            "password": "password123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == "new@deepmove.io"
        assert data["user"]["is_premium"] is False
        assert data["user"]["elo_estimate"] is None

    def test_register_sets_refresh_cookie(self, client):
        resp = client.post("/auth/register", json={
            "email": "cookie@deepmove.io",
            "password": "password123",
        })
        assert resp.status_code == 200
        assert settings.refresh_cookie_name in resp.cookies

    def test_register_duplicate_email_409(self, client):
        payload = {"email": "dup@deepmove.io", "password": "password123"}
        resp1 = client.post("/auth/register", json=payload)
        assert resp1.status_code == 200

        resp2 = client.post("/auth/register", json=payload)
        assert resp2.status_code == 409
        assert "already exists" in resp2.json()["detail"]

    def test_register_case_insensitive_email(self, client):
        client.post("/auth/register", json={
            "email": "CaseTest@DeepMove.io",
            "password": "password123",
        })
        resp = client.post("/auth/register", json={
            "email": "casetest@deepmove.io",
            "password": "password123",
        })
        assert resp.status_code == 409

    def test_register_invalid_email_422(self, client):
        resp = client.post("/auth/register", json={
            "email": "not-an-email",
            "password": "password123",
        })
        assert resp.status_code == 422

    def test_register_missing_password_422(self, client):
        resp = client.post("/auth/register", json={
            "email": "test@deepmove.io",
        })
        assert resp.status_code == 422

    def test_register_empty_password(self, client):
        resp = client.post("/auth/register", json={
            "email": "empty@deepmove.io",
            "password": "",
        })
        assert resp.status_code == 422
        assert "at least 8 characters" in resp.json()["detail"]


# ── Login ────────────────────────────────────────────────────────────────────

class TestLogin:
    def test_login_success(self, client):
        client.post("/auth/register", json={
            "email": "login@deepmove.io",
            "password": "password123",
        })
        resp = client.post("/auth/login", json={
            "email": "login@deepmove.io",
            "password": "password123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == "login@deepmove.io"

    def test_login_wrong_password_401(self, client):
        client.post("/auth/register", json={
            "email": "wrongpw@deepmove.io",
            "password": "correct",
        })
        resp = client.post("/auth/login", json={
            "email": "wrongpw@deepmove.io",
            "password": "incorrect",
        })
        assert resp.status_code == 401
        assert "Invalid credentials" in resp.json()["detail"]

    def test_login_nonexistent_user_401(self, client):
        resp = client.post("/auth/login", json={
            "email": "ghost@deepmove.io",
            "password": "password123",
        })
        assert resp.status_code == 401

    def test_login_sets_refresh_cookie(self, client):
        client.post("/auth/register", json={
            "email": "logincookie@deepmove.io",
            "password": "password123",
        })
        resp = client.post("/auth/login", json={
            "email": "logincookie@deepmove.io",
            "password": "password123",
        })
        assert settings.refresh_cookie_name in resp.cookies

    def test_login_case_insensitive(self, client):
        client.post("/auth/register", json={
            "email": "CaseLogin@deepmove.io",
            "password": "password123",
        })
        resp = client.post("/auth/login", json={
            "email": "caselogin@deepmove.io",
            "password": "password123",
        })
        assert resp.status_code == 200


# ── Token Refresh ────────────────────────────────────────────────────────────

class TestRefresh:
    def test_refresh_success(self, client):
        resp = client.post("/auth/register", json={
            "email": "refresh@deepmove.io",
            "password": "password123",
        })
        assert resp.status_code == 200
        resp2 = client.post("/auth/refresh")
        assert resp2.status_code == 200
        data = resp2.json()
        assert "access_token" in data
        assert data["user"]["email"] == "refresh@deepmove.io"

    def test_refresh_returns_valid_access_token(self, client):
        """Refresh should return a new access token that works."""
        client.post("/auth/register", json={
            "email": "refreshvalid@deepmove.io",
            "password": "password123",
        })
        resp = client.post("/auth/refresh")
        token = resp.json()["access_token"]

        # Use the new token to access a protected route
        client.headers["Authorization"] = f"Bearer {token}"
        resp2 = client.get("/users/me")
        assert resp2.status_code == 200

    def test_refresh_no_cookie_401(self, client):
        resp = client.post("/auth/refresh")
        assert resp.status_code == 401
        assert "No refresh token" in resp.json()["detail"]

    def test_refresh_invalid_token_401(self, client):
        client.cookies.set(settings.refresh_cookie_name, "garbage-token", path="/auth")
        resp = client.post("/auth/refresh")
        assert resp.status_code == 401

    def test_refresh_uses_configured_cookie_name(self, client, monkeypatch):
        monkeypatch.setattr(settings, "refresh_cookie_name", "custom_refresh")
        resp = client.post("/auth/register", json={
            "email": "customcookie@deepmove.io",
            "password": "password123",
        })
        assert resp.status_code == 200
        assert "custom_refresh" in resp.cookies

        resp2 = client.post("/auth/refresh")
        assert resp2.status_code == 200
        assert resp2.json()["user"]["email"] == "customcookie@deepmove.io"


# ── Logout ───────────────────────────────────────────────────────────────────

class TestLogout:
    def test_logout_success(self, auth_client):
        client, token, user = auth_client
        resp = client.post("/auth/logout")
        assert resp.status_code == 200
        assert resp.json()["status"] == "logged_out"

    def test_logout_revokes_old_tokens(self, auth_client):
        client, token, user = auth_client
        client.post("/auth/logout")

        # Old access token should now be invalid
        resp = client.get("/users/me")
        assert resp.status_code == 401

    def test_logout_without_token_401(self, client):
        resp = client.post("/auth/logout")
        # HTTPBearer(auto_error=False) → None → get_current_user raises 401
        assert resp.status_code == 401


# ── Token Validation ─────────────────────────────────────────────────────────

class TestTokenValidation:
    def test_access_protected_route_with_token(self, auth_client):
        client, token, user = auth_client
        resp = client.get("/users/me")
        assert resp.status_code == 200
        assert resp.json()["email"] == "testuser@deepmove.io"

    def test_no_token_returns_401(self, client):
        resp = client.get("/users/me")
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, client):
        client.headers["Authorization"] = "Bearer totally.invalid.token"
        resp = client.get("/users/me")
        assert resp.status_code == 401

    def test_expired_token_returns_401(self, client, db_session):
        """Forge an expired JWT and verify it's rejected."""
        from app.models.user import User
        from app.utils.security import hash_password

        user = User(email="expired@deepmove.io", hashed_password=hash_password("pw"))
        db_session.add(user)
        db_session.flush()

        payload = {
            "sub": str(user.id),
            "tv": 0,
            "exp": int(time.time()) - 10,  # Already expired
            "type": "access",
        }
        expired_token = jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)
        client.headers["Authorization"] = f"Bearer {expired_token}"
        resp = client.get("/users/me")
        assert resp.status_code == 401

    def test_refresh_token_rejected_as_access(self, client, db_session):
        """A refresh token should not grant access to protected routes."""
        from app.models.user import User
        from app.utils.security import create_refresh_token, hash_password

        user = User(email="refreshonly@deepmove.io", hashed_password=hash_password("pw"))
        db_session.add(user)
        db_session.flush()

        refresh = create_refresh_token(user.id, user.token_version)
        client.headers["Authorization"] = f"Bearer {refresh}"
        resp = client.get("/users/me")
        assert resp.status_code == 401


# ── Rate limiting ─────────────────────────────────────────────────────────────

class TestRateLimiting:
    def test_register_rate_limit_returns_429(self, client):
        """Exceed the register rate limit (3/min) and get a 429.

        The conftest autouse fixture disables rate limiting globally so other tests
        are deterministic.  Re-enable it for this specific test only.
        """
        from app.rate_limiting import limiter

        limiter.enabled = True
        try:
            # Exhaust the 3/minute window
            for i in range(3):
                client.post(
                    "/auth/register",
                    json={"email": f"rl{i}@deepmove.io", "password": "password123"},
                )

            # 4th request in the same minute must be rejected
            resp = client.post(
                "/auth/register",
                json={"email": "rl_overflow@deepmove.io", "password": "password123"},
            )
            assert resp.status_code == 429
        finally:
            limiter.enabled = False
