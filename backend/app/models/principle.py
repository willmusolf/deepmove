"""principle.py — SQLAlchemy UserPrinciple tracking model.

Tracks which principles a user keeps triggering across games.
Powers the weakness profile dashboard and recurring mistake detection.
"""
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserPrinciple(Base):
    __tablename__ = "user_principles"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    principle_id: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_seen: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
    game_ids: Mapped[list[int]] = mapped_column(
        ARRAY(BigInteger), nullable=False, server_default="{}"
    )

    # Relationships
    user = relationship("User", back_populates="principles")

    __table_args__ = (
        UniqueConstraint("user_id", "principle_id", name="uq_user_principles"),
        Index("idx_user_principles_user", "user_id"),
    )
