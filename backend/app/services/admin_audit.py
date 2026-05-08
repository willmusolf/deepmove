"""Helpers for admin audit-log lifecycle management."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.audit import AdminAuditLog


def prune_admin_audit_log(db: Session, *, older_than_days: int) -> int:
    """Delete admin audit rows older than the configured retention window."""
    cutoff = datetime.now(UTC) - timedelta(days=older_than_days)
    deleted = (
        db.query(AdminAuditLog)
        .filter(AdminAuditLog.created_at < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted
