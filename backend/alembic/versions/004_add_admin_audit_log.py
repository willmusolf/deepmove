"""Add admin audit log table.

Revision ID: 004
Revises: 003
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_audit_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("admin_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("ip_address", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_admin_audit_log_created_at", "admin_audit_log", ["created_at"])
    op.create_index("idx_admin_audit_log_admin_user_id", "admin_audit_log", ["admin_user_id"])
    op.create_index("idx_admin_audit_log_action", "admin_audit_log", ["action"])
    op.execute("ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index("idx_admin_audit_log_action", table_name="admin_audit_log")
    op.drop_index("idx_admin_audit_log_admin_user_id", table_name="admin_audit_log")
    op.drop_index("idx_admin_audit_log_created_at", table_name="admin_audit_log")
    op.drop_table("admin_audit_log")
