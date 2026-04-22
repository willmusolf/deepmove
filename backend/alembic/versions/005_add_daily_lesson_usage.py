"""Add daily lesson usage fields to users.

Revision ID: 005
Revises: 004
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("daily_lesson_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column(
            "daily_lesson_reset",
            sa.Date(),
            nullable=False,
            server_default=sa.func.current_date(),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "daily_lesson_reset")
    op.drop_column("users", "daily_lesson_count")
