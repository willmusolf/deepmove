"""Add persisted avatar URL for OAuth users.

Revision ID: 009
Revises: 008
Create Date: 2026-05-19
"""

import sqlalchemy as sa
from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "avatar_url" not in user_columns:
        op.add_column("users", sa.Column("avatar_url", sa.Text(), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "avatar_url" in user_columns:
        op.drop_column("users", "avatar_url")
