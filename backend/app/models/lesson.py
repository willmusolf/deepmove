"""lesson.py — SQLAlchemy Lesson model"""
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, Float, ForeignKey, Index, Integer, Text, func
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("games.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    move_number: Mapped[int] = mapped_column(Integer, nullable=False)
    color: Mapped[str] = mapped_column(Text, nullable=False)
    principle_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    lesson_text: Mapped[str] = mapped_column(Text, nullable=False)
    elo_band: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    game = relationship("Game", back_populates="lessons")
    user = relationship("User", back_populates="lessons")

    __table_args__ = (
        CheckConstraint("color IN ('white', 'black')", name="ck_lessons_color"),
        Index("idx_lessons_game", "game_id"),
        Index("idx_lessons_user", "user_id"),
        Index("idx_lessons_principle", "user_id", "principle_id",
              postgresql_where="principle_id IS NOT NULL"),
    )
