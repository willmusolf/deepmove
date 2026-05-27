"""Add account analysis jobs and report snapshots.

Revision ID: 010
Revises: 009
Create Date: 2026-05-21
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if "account_reports" not in tables:
        op.create_table(
            "account_reports",
            sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column(
                "source_platforms",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'[]'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "scanned_range",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'{}'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "scan_summary",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'{}'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "time_control_breakdown",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'[]'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "top_trends",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'[]'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "current_focus",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'{}'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "review_moments",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'[]'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "opening_context",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'[]'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "technical_evidence",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'{}'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "created_at",
                postgresql.TIMESTAMP(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "idx_account_reports_user_created",
            "account_reports",
            ["user_id", sa.text("created_at DESC")],
            unique=False,
        )

    if "analysis_jobs" not in tables:
        op.create_table(
            "analysis_jobs",
            sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("status", sa.Text(), server_default="queued", nullable=False),
            sa.Column("stage", sa.Text(), server_default="queued", nullable=False),
            sa.Column("progress_pct", sa.Integer(), server_default="0", nullable=False),
            sa.Column(
                "account_scope",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'{}'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "filters",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'{}'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "requested_game_ids",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'[]'::jsonb"),
                nullable=False,
            ),
            sa.Column(
                "completed_game_ids",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'[]'::jsonb"),
                nullable=False,
            ),
            sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("report_id", sa.BigInteger(), nullable=True),
            sa.Column("started_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
            sa.Column("finished_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
            sa.Column(
                "created_at",
                postgresql.TIMESTAMP(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                postgresql.TIMESTAMP(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.CheckConstraint(
                "status IN ('queued', 'running', 'complete', 'failed', 'cancelled')",
                name="ck_analysis_jobs_status",
            ),
            sa.CheckConstraint(
                "stage IN ("
                "'queued', 'fetching_games', 'scanning_metadata', 'analyzing_candidates', "
                "'deep_reviewing_examples', 'saving_report', 'complete', 'failed', 'cancelled'"
                ")",
                name="ck_analysis_jobs_stage",
            ),
            sa.CheckConstraint(
                "progress_pct >= 0 AND progress_pct <= 100",
                name="ck_analysis_jobs_progress",
            ),
            sa.ForeignKeyConstraint(["report_id"], ["account_reports.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "idx_analysis_jobs_user_created",
            "analysis_jobs",
            ["user_id", sa.text("created_at DESC")],
            unique=False,
        )
        op.create_index(
            "idx_analysis_jobs_status_created",
            "analysis_jobs",
            ["status", sa.text("created_at ASC")],
            unique=False,
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    if "analysis_jobs" in tables:
        op.drop_index("idx_analysis_jobs_status_created", table_name="analysis_jobs")
        op.drop_index("idx_analysis_jobs_user_created", table_name="analysis_jobs")
        op.drop_table("analysis_jobs")
    if "account_reports" in tables:
        op.drop_index("idx_account_reports_user_created", table_name="account_reports")
        op.drop_table("account_reports")
