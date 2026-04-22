"""dependencies.py — FastAPI dependency injection (DB session, auth)."""
import logging
from collections.abc import Generator

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.logging_utils import client_ip_from_request, log_event
from app.models.user import User
from app.utils.security import decode_token

bearer_scheme = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


def get_db() -> Generator[Session, None, None]:
    """Yield a database session, closing it after the request."""
    if SessionLocal is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not configured",
        )
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Require a valid access token. Returns the authenticated User or 401."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = int(payload["sub"])
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Check token_version to support token revocation
    if payload.get("tv") != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    return user


def get_optional_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User | None:
    """Like get_current_user but returns None for anonymous/invalid tokens.
    Does NOT open a DB connection — callers that need DB must open it themselves.
    This avoids waking Neon for unauthenticated requests (e.g. guest coaching).
    """
    if credentials is None:
        return None

    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        return None

    # We have a valid-looking token — open DB just to verify the user exists
    from app.database import SessionLocal  # local import to avoid circular
    if SessionLocal is None:
        return None
    user_id = int(payload["sub"])
    ip = client_ip_from_request(request)
    try:
        db = SessionLocal()
    except Exception as exc:
        # DB unavailable (Neon suspended, network issue) — treat as guest
        log_event(
            logger,
            logging.WARNING,
            "system.auth_degradation",
            user_id_from_token=user_id,
            ip=ip,
            error_type=type(exc).__name__,
        )
        return None
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None or payload.get("tv") != user.token_version:
            return None
        return user
    except Exception as exc:
        # Query failed — treat as guest rather than 500
        log_event(
            logger,
            logging.WARNING,
            "system.auth_degradation",
            user_id_from_token=user_id,
            ip=ip,
            error_type=type(exc).__name__,
        )
        return None
    finally:
        db.close()
