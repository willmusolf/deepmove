"""Add password_reset_tokens table for email-based password recovery.

Revision ID: 007
Revises: 006
Create Date: 2026-05-08
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    table_names = set(inspector.get_table_names())

    if "password_reset_tokens" not in table_names:
        op.create_table(
            "password_reset_tokens",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column(
                "user_id",
                sa.BigInteger(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            # SHA-256 hex of the raw token; raw token only ever lives in the email
            sa.Column("token_hash", sa.Text(), nullable=False),
            sa.Column(
                "expires_at",
                postgresql.TIMESTAMP(timezone=True),
                nullable=False,
            ),
            sa.Column(
                "used_at",
                postgresql.TIMESTAMP(timezone=True),
                nullable=True,
            ),
            sa.Column(
                "created_at",
                postgresql.TIMESTAMP(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )

    inspector = sa.inspect(op.get_bind())
    existing_indexes = {
        idx["name"]
        for idx in inspector.get_indexes("password_reset_tokens")
    }
    if "idx_prt_token_hash" not in existing_indexes:
        op.create_index(
            "idx_prt_token_hash", "password_reset_tokens", ["token_hash"], unique=True
        )
    if "idx_prt_user_id" not in existing_indexes:
        op.create_index("idx_prt_user_id", "password_reset_tokens", ["user_id"])
    if "idx_prt_expires_at" not in existing_indexes:
        op.create_index("idx_prt_expires_at", "password_reset_tokens", ["expires_at"])


def downgrade() -> None:
    op.drop_index("idx_prt_expires_at", table_name="password_reset_tokens")
    op.drop_index("idx_prt_user_id", table_name="password_reset_tokens")
    op.drop_index("idx_prt_token_hash", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
