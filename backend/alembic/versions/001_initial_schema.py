"""Initial schema: users, games, lessons, user_principles.

Revision ID: 001
Revises: None
Create Date: 2026-03-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("email", sa.Text, unique=True, nullable=False),
        sa.Column("hashed_password", sa.Text, nullable=True),
        sa.Column("token_version", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_premium", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("elo_estimate", sa.Integer, nullable=True),
        sa.Column("chesscom_username", sa.Text, nullable=True),
        sa.Column("lichess_username", sa.Text, nullable=True),
        sa.Column("lichess_id", sa.Text, nullable=True),
        sa.Column("google_id", sa.Text, nullable=True),
        sa.Column("chesscom_id", sa.Text, nullable=True),
        sa.Column("preferences", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_users_lichess_id", "users", ["lichess_id"], unique=True, postgresql_where="lichess_id IS NOT NULL")
    op.create_index("idx_users_google_id", "users", ["google_id"], unique=True, postgresql_where="google_id IS NOT NULL")
    op.create_index("idx_users_chesscom_id", "users", ["chesscom_id"], unique=True, postgresql_where="chesscom_id IS NOT NULL")

    # ── games ────────────────────────────────────────────────────────────
    op.create_table(
        "games",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.Text, nullable=False),
        sa.Column("platform_game_id", sa.Text, nullable=True),
        sa.Column("pgn", sa.Text, nullable=False),
        sa.Column("user_color", sa.Text, nullable=True),
        sa.Column("user_elo", sa.Integer, nullable=True),
        sa.Column("opponent", sa.Text, nullable=True),
        sa.Column("opponent_rating", sa.Integer, nullable=True),
        sa.Column("result", sa.Text, nullable=True),
        sa.Column("time_control", sa.Text, nullable=True),
        sa.Column("end_time", sa.BigInteger, nullable=True),
        sa.Column("move_evals", postgresql.JSONB, nullable=True),
        sa.Column("critical_moments", postgresql.JSONB, nullable=True),
        sa.Column("analyzed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("synced_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_check_constraint("ck_games_platform", "games", "platform IN ('chesscom', 'lichess', 'pgn-paste')")
    op.create_check_constraint("ck_games_user_color", "games", "user_color IS NULL OR user_color IN ('white', 'black')")
    op.create_check_constraint("ck_games_result", "games", "result IS NULL OR result IN ('W', 'L', 'D')")
    op.create_index("idx_games_user_platform", "games", ["user_id", "platform_game_id"], unique=True, postgresql_where="platform_game_id IS NOT NULL")
    op.create_index("idx_games_user_id", "games", ["user_id"])

    # ── lessons ──────────────────────────────────────────────────────────
    op.create_table(
        "lessons",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("game_id", sa.BigInteger, sa.ForeignKey("games.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("move_number", sa.Integer, nullable=False),
        sa.Column("color", sa.Text, nullable=False),
        sa.Column("principle_id", sa.Text, nullable=True),
        sa.Column("confidence", sa.Float, nullable=False),
        sa.Column("lesson_text", sa.Text, nullable=False),
        sa.Column("elo_band", sa.Text, nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_check_constraint("ck_lessons_color", "lessons", "color IN ('white', 'black')")
    op.create_index("idx_lessons_game", "lessons", ["game_id"])
    op.create_index("idx_lessons_user", "lessons", ["user_id"])
    op.create_index("idx_lessons_principle", "lessons", ["user_id", "principle_id"], postgresql_where="principle_id IS NOT NULL")

    # ── user_principles ──────────────────────────────────────────────────
    op.create_table(
        "user_principles",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("principle_id", sa.Text, nullable=False),
        sa.Column("trigger_count", sa.Integer, nullable=False, server_default="1"),
        sa.Column("last_seen", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("game_ids", postgresql.ARRAY(sa.BigInteger), nullable=False, server_default="{}"),
    )
    op.create_unique_constraint("uq_user_principles", "user_principles", ["user_id", "principle_id"])
    op.create_index("idx_user_principles_user", "user_principles", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_principles")
    op.drop_table("lessons")
    op.drop_table("games")
    op.drop_table("users")
