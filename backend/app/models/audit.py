"""audit.py — SQLAlchemy model for admin audit log entries."""

from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    admin_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False)
    ip_address: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    admin = relationship("User")

    __table_args__ = (
        Index("idx_admin_audit_log_created_at", "created_at"),
        Index("idx_admin_audit_log_admin_user_id", "admin_user_id"),
        Index("idx_admin_audit_log_action", "action"),
    )
