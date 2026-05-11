"""Prune old admin audit-log rows.

Usage:
    DATABASE_URL=postgresql://... python scripts/prune_admin_audit_log.py --days 90
    DATABASE_URL=postgresql://... python scripts/prune_admin_audit_log.py --days 90 --dry-run
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import _psycopg3_url
from app.models.audit import AdminAuditLog
from app.services.admin_audit import prune_admin_audit_log


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Delete old admin audit-log rows.")
    parser.add_argument(
        "--days",
        type=int,
        default=90,
        help="Delete rows older than this many days (default: 90).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report how many rows would be deleted without mutating the database.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.days < 1:
        raise SystemExit("--days must be at least 1")
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is required to prune admin audit logs")

    engine = create_engine(_psycopg3_url(settings.database_url))
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with session_factory() as db:
        if args.dry_run:
            cutoff = datetime.now(UTC) - timedelta(days=args.days)
            count = (
                db.query(AdminAuditLog)
                .filter(AdminAuditLog.created_at < cutoff)
                .count()
            )
            print(f"Would delete {count} admin audit-log rows older than {args.days} days.")
            return 0

        deleted = prune_admin_audit_log(db, older_than_days=args.days)
        print(f"Deleted {deleted} admin audit-log rows older than {args.days} days.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
