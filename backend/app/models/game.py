"""game.py — SQLAlchemy Game model"""
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Game(Base):
    __tablename__ = "games"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    platform: Mapped[str] = mapped_column(Text, nullable=False)
    platform_game_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    pgn: Mapped[str] = mapped_column(Text, nullable=False)

    user_color: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_elo: Mapped[int | None] = mapped_column(Integer, nullable=True)
    opponent: Mapped[str | None] = mapped_column(Text, nullable=True)
    opponent_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    time_control: Mapped[str | None] = mapped_column(Text, nullable=True)
    end_time: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # unix ms

    # Analysis data (~15KB moveEvals + ~3KB criticalMoments as JSONB)
    move_evals: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    critical_moments: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    analyzed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    user = relationship("User", back_populates="games")
    lessons = relationship("Lesson", back_populates="game", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("platform IN ('chesscom', 'lichess', 'pgn-paste')", name="ck_games_platform"),
        CheckConstraint("user_color IS NULL OR user_color IN ('white', 'black')", name="ck_games_user_color"),
        CheckConstraint("result IS NULL OR result IN ('W', 'L', 'D')", name="ck_games_result"),
        Index(
            "idx_games_user_platform",
            "user_id", "platform_game_id",
            unique=True,
            postgresql_where=text("platform_game_id IS NOT NULL"),
        ),
        Index("idx_games_user_id", "user_id"),
    )
