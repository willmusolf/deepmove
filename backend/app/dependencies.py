"""dependencies.py — FastAPI dependency injection (DB session, auth, etc.)"""
# TODO: Add database session dependency, current user dependency

from sqlalchemy.orm import Session
from typing import Generator
from app.database import SessionLocal


def get_db() -> Generator[Session, None, None]:
    """Yield a database session, closing it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
