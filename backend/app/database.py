"""database.py — SQLAlchemy engine and session setup"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url) if settings.database_url else None

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
) if engine else None  # type: ignore[assignment]

Base = declarative_base()
