from datetime import UTC, datetime, timedelta

from app.models.audit import AdminAuditLog
from app.models.user import User
from app.services.admin_audit import prune_admin_audit_log


def test_prune_admin_audit_log_removes_old_rows(db_session):
    admin = User(email="audit-admin@deepmove.io", hashed_password="x", is_admin=True)
    db_session.add(admin)
    db_session.flush()

    old_entry = AdminAuditLog(
        admin_user_id=admin.id,
        action="old.audit",
        details={"source": "test"},
        ip_address="127.0.0.1",
        created_at=datetime.now(UTC) - timedelta(days=120),
    )
    fresh_entry = AdminAuditLog(
        admin_user_id=admin.id,
        action="fresh.audit",
        details={"source": "test"},
        ip_address="127.0.0.1",
        created_at=datetime.now(UTC) - timedelta(days=10),
    )
    db_session.add_all([old_entry, fresh_entry])
    db_session.commit()

    deleted = prune_admin_audit_log(db_session, older_than_days=90)

    assert deleted == 1
    actions = {entry.action for entry in db_session.query(AdminAuditLog).all()}
    assert actions == {"fresh.audit"}
