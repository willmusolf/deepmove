"""user.py — SQLAlchemy User model"""
from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(Text, nullable=True)  # NULL for OAuth-only
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    is_premium: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    elo_estimate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    daily_lesson_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    daily_lesson_reset: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=func.current_date()
    )

    # Linked chess platform accounts
    chesscom_username: Mapped[str | None] = mapped_column(Text, nullable=True)
    lichess_username: Mapped[str | None] = mapped_column(Text, nullable=True)
    lichess_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    google_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    chesscom_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    # User preferences (soundEnabled, thinkFirstMode, etc.)
    preferences: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    games = relationship("Game", back_populates="user", cascade="all, delete-orphan")
    lessons = relationship("Lesson", back_populates="user", cascade="all, delete-orphan")
    principles = relationship("UserPrinciple", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_users_lichess_id", "lichess_id", unique=True, postgresql_where=text("lichess_id IS NOT NULL")),
        Index("idx_users_google_id", "google_id", unique=True, postgresql_where=text("google_id IS NOT NULL")),
        Index("idx_users_chesscom_id", "chesscom_id", unique=True, postgresql_where=text("chesscom_id IS NOT NULL")),
    )
