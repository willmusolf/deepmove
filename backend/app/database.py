"""database.py — SQLAlchemy engine and session setup"""
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from sqlalchemy.pool import QueuePool

from app.config import settings

Base = declarative_base()
engine: Engine | None
SessionLocal: sessionmaker[Session] | None

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
        # Keep the pool intentionally small for Neon free-tier / pooled connections.
        pool_size=2,
        max_overflow=2,
        pool_timeout=10,
        pool_pre_ping=True,  # Reconnect on stale connections (hosted PgBouncer compat)
        connect_args={"connect_timeout": 10},  # Fail fast if DB is unreachable
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
else:
    engine = None
    SessionLocal = None
