"""password_reset_token.py — Single-use password reset tokens."""
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # SHA-256 hex digest of the raw token (raw token is only in the email)
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    user = relationship("User", back_populates="password_reset_tokens")

    __table_args__ = (
        Index("idx_prt_token_hash", "token_hash", unique=True),
        Index("idx_prt_user_id", "user_id"),
        Index("idx_prt_expires_at", "expires_at"),
    )
