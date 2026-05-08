"""Add Stripe customer and subscription fields to users.

Revision ID: 006
Revises: 005
Create Date: 2026-05-08
"""

import sqlalchemy as sa
from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing_columns = {column["name"] for column in inspector.get_columns("users")}

    if "stripe_customer_id" not in existing_columns:
        op.add_column(
            "users",
            sa.Column("stripe_customer_id", sa.Text(), nullable=True, unique=True),
        )
    if "subscription_status" not in existing_columns:
        op.add_column(
            "users",
            sa.Column(
                "subscription_status",
                sa.Text(),
                nullable=False,
                server_default="none",
            ),
        )


def downgrade() -> None:
    op.drop_column("users", "subscription_status")
    op.drop_column("users", "stripe_customer_id")
