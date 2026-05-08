"""Add composite indexes for high-traffic game and lesson queries.

Revision ID: 006
Revises: 005
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())

    game_indexes = {index["name"] for index in inspector.get_indexes("games")}
    if "idx_games_user_end_time" not in game_indexes:
        op.create_index(
            "idx_games_user_end_time",
            "games",
            ["user_id", sa.text("end_time DESC")],
        )

    lesson_indexes = {index["name"] for index in inspector.get_indexes("lessons")}
    if "idx_lessons_lookup" not in lesson_indexes:
        op.create_index(
            "idx_lessons_lookup",
            "lessons",
            ["game_id", "user_id", "move_number", "principle_id"],
        )


def downgrade() -> None:
    op.drop_index("idx_lessons_lookup", table_name="lessons")
    op.drop_index("idx_games_user_end_time", table_name="games")
