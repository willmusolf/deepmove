"""database.py — SQLAlchemy engine and session setup"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import QueuePool

from app.config import settings

Base = declarative_base()

def _psycopg3_url(url: str) -> str:
    """Rewrite postgresql:// to postgresql+psycopg:// to use psycopg3 (not psycopg2)."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url

if settings.database_url:
    engine = create_engine(
        _psycopg3_url(settings.database_url),
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,  # Reconnect on stale connections (hosted PgBouncer compat)
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
else:
    engine = None
    SessionLocal = None  # type: ignore[assignment]
