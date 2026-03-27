"""Enable Row Level Security on all tables.

Blocks PostgREST (anon/authenticated) access. The app connects as the
postgres role (table owner) which bypasses RLS — no policies needed.

Revision ID: 003
Revises: 002
Create Date: 2026-03-26
"""
from alembic import op

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None

TABLES = ("users", "games", "lessons", "user_principles")


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
