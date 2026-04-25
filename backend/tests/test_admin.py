"""Admin operations and audit log coverage."""

from app.models.audit import AdminAuditLog
from app.models.user import User


def make_admin_client(client, db_session):
    resp = client.post("/auth/register", json={
        "email": "admin@deepmove.io",
        "password": "password123",
    })
    assert resp.status_code == 200, resp.text
    user_id = resp.json()["user"]["id"]
    admin = db_session.query(User).filter(User.id == user_id).first()
    assert admin is not None
    admin.is_admin = True
    db_session.commit()
    client.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"
    return client, admin


class TestAdminAuditLog:
    def test_toggle_coaching_creates_audit_row(self, client, db_session):
        client, admin = make_admin_client(client, db_session)

        resp = client.post("/admin/ops/coaching", json={"enabled": True})
        assert resp.status_code == 200

        audit = db_session.query(AdminAuditLog).order_by(AdminAuditLog.id.desc()).first()
        assert audit is not None
        assert audit.admin_user_id == admin.id
        assert audit.action == "coaching.toggle"
        assert audit.details == {"new_state": True}

    def test_delete_all_lessons_requires_confirm(self, client, db_session):
        client, admin = make_admin_client(client, db_session)

        resp = client.delete("/admin/games/lessons/all")
        assert resp.status_code == 400
        assert "confirm=true" in resp.json()["detail"]

    def test_delete_all_lessons_with_confirm_creates_audit_row(self, client, db_session):
        client, admin = make_admin_client(client, db_session)

        resp = client.delete("/admin/games/lessons/all?confirm=true")
        assert resp.status_code == 200

        audit = db_session.query(AdminAuditLog).order_by(AdminAuditLog.id.desc()).first()
        assert audit is not None
        assert audit.action == "lessons.delete_all"
        assert audit.details == {"count": 0}

    def test_audit_log_endpoint_returns_entries(self, client, db_session):
        client, admin = make_admin_client(client, db_session)
        client.post("/admin/ops/coaching", json={"enabled": True})
        client.post("/admin/ops/cache/lessons/clear")

        resp = client.get("/admin/audit-log")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2
        assert data["entries"][0]["action"] in {"cache.clear", "coaching.toggle"}
        assert data["entries"][0]["admin_email"] == "admin@deepmove.io"

    def test_audit_log_endpoint_filters_by_action(self, client, db_session):
        client, admin = make_admin_client(client, db_session)
        client.post("/admin/ops/coaching", json={"enabled": True})
        client.post("/admin/ops/cache/lessons/clear")

        resp = client.get("/admin/audit-log?action=coaching.toggle")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert all(entry["action"] == "coaching.toggle" for entry in data["entries"])

    def test_non_admin_cannot_read_audit_log(self, auth_client):
        client, token, user = auth_client
        resp = client.get("/admin/audit-log")
        assert resp.status_code == 403


# ── Access control regression tests ─────────────────────────────────────────

class TestAdminAccessControl:
    def test_unauthenticated_returns_401(self, client):
        """No auth header → must be rejected before reaching admin logic."""
        resp = client.get("/admin/ops/status")
        assert resp.status_code == 401

    def test_non_admin_user_returns_403(self, client):
        """A normal (non-admin) authenticated user must be denied admin routes."""
        reg = client.post("/auth/register", json={
            "email": "normaluser_acl@deepmove.io",
            "password": "password123",
        })
        assert reg.status_code == 200, reg.text
        token = reg.json()["access_token"]
        client.headers["Authorization"] = f"Bearer {token}"

        resp = client.get("/admin/ops/status")
        assert resp.status_code == 403
