"""auth.py — Authentication routes (email/password + OAuth)."""
import re

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.rate_limiting import limiter
from app.schemas.user import AuthResponse, UserCreate, UserResponse
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter()

_PASSWORD_RE = re.compile(r"(?=.*[A-Za-z])(?=.*[0-9])")


def _validate_password(password: str) -> None:
    """Raise 422 if password doesn't meet minimum complexity."""
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters",
        )
    if not _PASSWORD_RE.search(password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must contain at least one letter and one number",
        )


def _set_refresh_cookie(response: Response, token: str) -> None:
    """Set the refresh token as an HttpOnly cookie."""
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        httponly=True,
        secure=settings.environment == "production",  # HTTPS only in prod
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/auth",  # Only sent to /auth/* endpoints
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Remove the refresh token cookie."""
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path="/auth",
    )


def _user_response(user: User) -> UserResponse:
    return UserResponse.model_validate(user)


@router.post("/register", response_model=AuthResponse)
@limiter.limit("3/minute")
async def register(request: Request, body: UserCreate, response: Response, db: Session = Depends(get_db)):
    """Create a new account with email + password."""
    _validate_password(body.password)

    # Check for existing email (case-insensitive)
    existing = db.query(User).filter(User.email == body.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        email=body.email.lower(),
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access = create_access_token(user.id, user.token_version)
    refresh = create_refresh_token(user.id, user.token_version)
    _set_refresh_cookie(response, refresh)

    return AuthResponse(access_token=access, user=_user_response(user))


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: UserCreate, response: Response, db: Session = Depends(get_db)):
    """Log in with email + password."""
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if user is None or user.hashed_password is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access = create_access_token(user.id, user.token_version)
    refresh = create_refresh_token(user.id, user.token_version)
    _set_refresh_cookie(response, refresh)

    return AuthResponse(access_token=access, user=_user_response(user))


@router.post("/refresh", response_model=AuthResponse)
@limiter.limit("20/minute")
async def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    deepmove_refresh: str | None = Cookie(None),
):
    """Exchange a valid refresh token for a new access token."""
    if deepmove_refresh is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    payload = decode_token(deepmove_refresh)
    if payload is None or payload.get("type") != "refresh":
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = int(payload["sub"])
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if payload.get("tv") != user.token_version:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    access = create_access_token(user.id, user.token_version)
    # Rotate refresh token
    new_refresh = create_refresh_token(user.id, user.token_version)
    _set_refresh_cookie(response, new_refresh)

    return AuthResponse(access_token=access, user=_user_response(user))


@router.post("/logout")
async def logout(
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Log out: clear cookie and invalidate all refresh tokens."""
    user.token_version += 1
    db.commit()
    _clear_refresh_cookie(response)
    return {"status": "logged_out"}


# ── OAuth routes ─────────────────────────────────────────────────────────────
# These are stubs that will be completed when OAuth client IDs are configured.
# The flow: GET /auth/{provider} → redirect to provider → callback → JWT pair.


@router.get("/lichess")
async def lichess_login():
    """Redirect to Lichess OAuth authorization."""
    if not settings.lichess_client_id:
        raise HTTPException(status_code=501, detail="Lichess OAuth not configured")
    # TODO: Generate PKCE code_verifier, store in session, redirect to Lichess
    return {"status": "not_configured", "detail": "Set LICHESS_CLIENT_ID in .env"}


@router.get("/lichess/callback")
async def lichess_callback(code: str, state: str = "", db: Session = Depends(get_db)):
    """Handle Lichess OAuth callback."""
    # TODO: Exchange code for token, fetch user profile, create/link account
    raise HTTPException(status_code=501, detail="Lichess OAuth not configured")


@router.get("/google")
async def google_login():
    """Redirect to Google OAuth authorization."""
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    return {"status": "not_configured", "detail": "Set GOOGLE_CLIENT_ID in .env"}


@router.get("/google/callback")
async def google_callback(code: str, state: str = "", db: Session = Depends(get_db)):
    """Handle Google OAuth callback."""
    raise HTTPException(status_code=501, detail="Google OAuth not configured")


@router.get("/chesscom")
async def chesscom_login():
    """Redirect to Chess.com OAuth authorization."""
    if not settings.chesscom_client_id:
        raise HTTPException(status_code=501, detail="Chess.com OAuth not configured")
    return {"status": "not_configured", "detail": "Set CHESSCOM_CLIENT_ID in .env"}


@router.get("/chesscom/callback")
async def chesscom_callback(code: str, state: str = "", db: Session = Depends(get_db)):
    """Handle Chess.com OAuth callback."""
    raise HTTPException(status_code=501, detail="Chess.com OAuth not configured")
