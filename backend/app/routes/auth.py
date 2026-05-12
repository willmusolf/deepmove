"""auth.py — Authentication routes (email/password + OAuth)."""
import base64
import hashlib
import hmac
import logging
import re
import secrets
import time
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
import pydantic
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.logging_utils import client_ip_from_request, log_event
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.rate_limiting import limiter
from app.schemas.user import AuthResponse, UserCreate, UserResponse
from app.services.email import send_password_reset_email
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter()

# Track consumed OAuth state nonces to prevent state token replay attacks.
# Nonces are ~22 chars; at 1000 logins/day this uses ~22 KB/day. Resets on
# restart (acceptable — HMAC still prevents forged tokens post-restart).
_consumed_oauth_nonces: set[str] = set()
logger = logging.getLogger(__name__)

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
        secure=settings.environment == "production",
        httponly=True,
        samesite="lax",
    )


def _user_response(user: User) -> UserResponse:
    return UserResponse.model_validate(user)


# ── OAuth PKCE helpers ────────────────────────────────────────────────────────

def _generate_pkce() -> tuple[str, str]:
    """Return (verifier, S256_challenge) pair for PKCE."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def _make_state_token(verifier: str, user_id: int = 0) -> str:
    """Embed the PKCE verifier (and optional user_id for link flow) in a signed state token.

    Format: {ts}:{nonce}:{verifier}:{user_id}:{hmac32}
    user_id=0 means login flow; user_id>0 means account-link flow.
    """
    ts = str(int(time.time()))
    nonce = secrets.token_urlsafe(16)
    uid = str(user_id)
    payload = f"{ts}:{nonce}:{verifier}:{uid}"
    sig = hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{payload}:{sig}"


def _parse_state_token(state: str, max_age: int = 600) -> tuple[str, int]:
    """Validate the state token and return (verifier, user_id).

    user_id=0 means login flow; user_id>0 means account-link flow.
    Raises ValueError on bad signature, wrong format, or expiry.
    """
    parts = state.split(":", 4)
    if len(parts) == 5:
        ts, nonce, verifier, uid, sig = parts
        payload = f"{ts}:{nonce}:{verifier}:{uid}"
    elif len(parts) == 4:
        # Legacy format (no user_id) — treat as login flow
        ts, nonce, verifier, sig = parts
        uid = "0"
        payload = f"{ts}:{nonce}:{verifier}"
    else:
        raise ValueError("malformed state")
    expected = hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(sig, expected):
        raise ValueError("bad signature")
    if int(time.time()) - int(ts) > max_age:
        raise ValueError("expired")
    if nonce in _consumed_oauth_nonces:
        raise ValueError("state_already_used")
    _consumed_oauth_nonces.add(nonce)
    return verifier, int(uid) if uid.isdigit() else 0


def _find_or_create_oauth_user(
    db: Session,
    *,
    provider: str,
    provider_id: str,
    email: str | None,
    lichess_username: str | None = None,
) -> User:
    """Find an existing user by provider ID or email, or create a new one.

    Matching priority:
      1. Provider-specific ID (e.g. google_id, lichess_id) — exact returning user
      2. Email match — links OAuth to an existing email/password account
      3. Create new account (no password set)
    """
    field_map = {"google": User.google_id, "lichess": User.lichess_id}
    field = field_map[provider]

    user = db.query(User).filter(field == provider_id).first()

    if not user and email:
        user = db.query(User).filter(User.email == email.lower()).first()

    if not user:
        # email column is NOT NULL — use a placeholder for providers that don't return email.
        # Users can add a real email from settings later.
        effective_email = email.lower() if email else f"oauth_{provider}_{provider_id}@noemail.deepmove"
        user = User(
            email=effective_email,
            hashed_password=None,
        )
        db.add(user)

    # If found by provider_id but user has a placeholder email and a real-email account
    # exists, merge into the real-email account (e.g. Google + Lichess same email).
    if email and user.email and user.email.endswith("@noemail.deepmove"):
        real_email_user = db.query(User).filter(User.email == email.lower()).first()
        if real_email_user and real_email_user.id != user.id:
            # Clear provider ID from placeholder user so it is no longer found by this provider
            if provider == "google":
                user.google_id = None
            elif provider == "lichess":
                user.lichess_id = None
            db.flush()
            user = real_email_user
        else:
            user.email = email.lower()

    # Always stamp the provider ID onto the canonical user
    if provider == "google":
        user.google_id = provider_id
    elif provider == "lichess":
        user.lichess_id = provider_id
        if lichess_username:
            user.lichess_username = lichess_username

    db.commit()
    db.refresh(user)
    return user


# ── Email / password routes ───────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse)
@limiter.limit("3/minute")
async def register(request: Request, body: UserCreate, response: Response, db: Session = Depends(get_db)):
    """Create a new account with email + password."""
    _validate_password(body.password)
    email = body.email.lower()

    # Check for existing email (case-insensitive)
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        email=email,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access = create_access_token(user.id, user.token_version)
    refresh = create_refresh_token(user.id, user.token_version)
    _set_refresh_cookie(response, refresh)
    log_event(
        logger,
        logging.INFO,
        "auth.register",
        email=user.email,
        ip=client_ip_from_request(request),
        user_id=user.id,
    )

    return AuthResponse(access_token=access, user=_user_response(user))


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: UserCreate, response: Response, db: Session = Depends(get_db)):
    """Log in with email + password."""
    email = body.email.lower()
    ip = client_ip_from_request(request)
    user = db.query(User).filter(User.email == email).first()
    if user is None or user.hashed_password is None:
        log_event(
            logger,
            logging.WARNING,
            "auth.login_failed",
            email=email,
            ip=ip,
            reason="invalid_credentials",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(body.password, user.hashed_password):
        log_event(
            logger,
            logging.WARNING,
            "auth.login_failed",
            email=email,
            ip=ip,
            reason="invalid_credentials",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access = create_access_token(user.id, user.token_version)
    refresh = create_refresh_token(user.id, user.token_version)
    _set_refresh_cookie(response, refresh)
    log_event(
        logger,
        logging.INFO,
        "auth.login",
        email=user.email,
        ip=ip,
        user_id=user.id,
    )

    return AuthResponse(access_token=access, user=_user_response(user))


@router.post("/refresh", response_model=AuthResponse)
@limiter.limit("20/minute")
async def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Exchange a valid refresh token for a new access token."""
    ip = client_ip_from_request(request)
    # Key must match settings.refresh_cookie_name — do not hard-code
    deepmove_refresh = request.cookies.get(settings.refresh_cookie_name)
    if deepmove_refresh is None:
        log_event(logger, logging.WARNING, "auth.refresh_failed", ip=ip, reason="missing")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    payload = decode_token(deepmove_refresh)
    if payload is None or payload.get("type") != "refresh":
        _clear_refresh_cookie(response)
        log_event(logger, logging.WARNING, "auth.refresh_failed", ip=ip, reason="invalid")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = int(payload["sub"])
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        _clear_refresh_cookie(response)
        log_event(logger, logging.WARNING, "auth.refresh_failed", ip=ip, reason="user_not_found")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if payload.get("tv") != user.token_version:
        _clear_refresh_cookie(response)
        log_event(logger, logging.WARNING, "auth.refresh_failed", ip=ip, reason="revoked")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    access = create_access_token(user.id, user.token_version)
    # Rotate refresh token
    new_refresh = create_refresh_token(user.id, user.token_version)
    _set_refresh_cookie(response, new_refresh)
    log_event(logger, logging.INFO, "auth.refresh", ip=ip, user_id=user.id)

    return AuthResponse(access_token=access, user=_user_response(user))


@router.post("/logout")
@limiter.limit("20/minute")
async def logout(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Log out: clear cookie and invalidate all refresh tokens."""
    user.token_version += 1
    db.commit()
    _clear_refresh_cookie(response)
    ip = client_ip_from_request(request)
    log_event(logger, logging.INFO, "auth.logout", ip=ip, user_id=user.id)
    log_event(logger, logging.INFO, "auth.token_revoked", ip=ip, user_id=user.id)
    return {"status": "logged_out"}


# ── OAuth routes ──────────────────────────────────────────────────────────────
# Flow: GET /auth/{provider} → PKCE+state cookie set → redirect to provider
#       → provider redirects to /auth/{provider}/callback?code=...&state=...
#       → backend validates, exchanges code, finds/creates user, issues refresh cookie
#       → redirect to {FRONTEND_URL}/?oauth_success=1 (refresh cookie set)
#       → frontend detects param, sets dm_has_session, calls /auth/refresh


@router.get("/google")
@limiter.limit("20/minute")
async def google_login(request: Request):
    """Redirect to Google OAuth authorization page."""
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    verifier, challenge = _generate_pkce()
    state = _make_state_token(verifier)
    params = urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "prompt": "select_account",
    })
    redirect = RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}", 302)
    return redirect


@router.get("/google/callback")
@limiter.limit("20/minute")
async def google_callback(
    request: Request,
    code: str,
    state: str,
    db: Session = Depends(get_db),
):
    """Handle Google OAuth callback: exchange code, find/create user, issue tokens."""
    ip = client_ip_from_request(request)
    redirect_err = RedirectResponse(f"{settings.frontend_url}/?oauth_error=1", 302)

    try:
        verifier, linking_user_id = _parse_state_token(state)
    except ValueError as exc:
        log_event(logger, logging.WARNING, "auth.oauth.google_failed", ip=ip, reason=str(exc))
        return redirect_err

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": settings.google_redirect_uri,
                    "code_verifier": verifier,
                },
            )
            if not token_resp.is_success:
                log_event(logger, logging.WARNING, "auth.oauth.google_failed", ip=ip,
                          reason="token_exchange_failed", status=token_resp.status_code,
                          body=token_resp.text[:200])
                return redirect_err
            token_data = token_resp.json()

            userinfo_resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {token_data['access_token']}"},
            )
            if not userinfo_resp.is_success:
                log_event(logger, logging.WARNING, "auth.oauth.google_failed", ip=ip, reason="userinfo_failed")
                return redirect_err
            profile = userinfo_resp.json()

        if linking_user_id:
            # Account-link flow: stamp google_id onto the existing user
            redirect_err_link = RedirectResponse(f"{settings.frontend_url}/?link_error=already_linked", 302)
            existing = db.query(User).filter(User.google_id == profile["sub"]).first()
            if existing and existing.id != linking_user_id:
                log_event(logger, logging.WARNING, "auth.oauth.google_link_conflict", ip=ip,
                          user_id=linking_user_id, conflicting_id=existing.id)
                return redirect_err_link
            link_user = db.query(User).filter(User.id == linking_user_id).first()
            if not link_user:
                return redirect_err_link
            link_user.google_id = profile["sub"]
            db.commit()
            log_event(logger, logging.INFO, "auth.oauth.google_linked", ip=ip, user_id=link_user.id)
            return RedirectResponse(f"{settings.frontend_url}/?link_success=google", 302)

        user = _find_or_create_oauth_user(
            db,
            provider="google",
            provider_id=profile["sub"],
            email=profile.get("email"),
        )
        new_refresh = create_refresh_token(user.id, user.token_version)
        log_event(logger, logging.INFO, "auth.oauth.google_login", ip=ip, user_id=user.id)

        redirect_ok = RedirectResponse(f"{settings.frontend_url}/?oauth_success=1", 302)
        _set_refresh_cookie(redirect_ok, new_refresh)
        return redirect_ok
    except Exception as exc:
        log_event(logger, logging.ERROR, "auth.oauth.google_failed", ip=ip,
                  reason="unexpected_error", error=repr(exc))
        return redirect_err


@router.get("/lichess")
@limiter.limit("20/minute")
async def lichess_login(request: Request):
    """Redirect to Lichess OAuth authorization page."""
    if not settings.lichess_client_id:
        raise HTTPException(status_code=501, detail="Lichess OAuth not configured")
    verifier, challenge = _generate_pkce()
    state = _make_state_token(verifier)
    params = urlencode({
        "response_type": "code",
        "client_id": settings.lichess_client_id,
        "redirect_uri": settings.lichess_redirect_uri,
        "scope": "email:read",
        "state": state,
        "code_challenge_method": "S256",
        "code_challenge": challenge,
    })
    return RedirectResponse(f"https://lichess.org/oauth?{params}", 302)


@router.get("/lichess/callback")
@limiter.limit("20/minute")
async def lichess_callback(
    request: Request,
    code: str,
    state: str,
    db: Session = Depends(get_db),
):
    """Handle Lichess OAuth callback: exchange code, find/create user, issue tokens."""
    ip = client_ip_from_request(request)
    redirect_err = RedirectResponse(f"{settings.frontend_url}/?oauth_error=1", 302)

    try:
        verifier, linking_user_id = _parse_state_token(state)
    except ValueError as exc:
        log_event(logger, logging.WARNING, "auth.oauth.lichess_failed", ip=ip, reason=str(exc))
        return redirect_err

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Lichess public-client PKCE: no client_secret in token exchange
            token_resp = await client.post(
                "https://lichess.org/api/token",
                data={
                    "grant_type": "authorization_code",
                    "client_id": settings.lichess_client_id,
                    "code": code,
                    "code_verifier": verifier,
                    "redirect_uri": settings.lichess_redirect_uri,
                },
            )
            if not token_resp.is_success:
                log_event(logger, logging.WARNING, "auth.oauth.lichess_failed", ip=ip,
                          reason="token_exchange_failed", status=token_resp.status_code,
                          body=token_resp.text[:200])
                return redirect_err
            token_data = token_resp.json()

            profile_resp = await client.get(
                "https://lichess.org/api/account",
                headers={"Authorization": f"Bearer {token_data['access_token']}"},
            )
            if not profile_resp.is_success:
                log_event(logger, logging.WARNING, "auth.oauth.lichess_failed", ip=ip, reason="profile_failed")
                return redirect_err
            profile = profile_resp.json()

            # /api/account does not include email — fetch from dedicated endpoint
            email_resp = await client.get(
                "https://lichess.org/api/account/email",
                headers={"Authorization": f"Bearer {token_data['access_token']}"},
            )
            lichess_email = email_resp.json().get("email") if email_resp.is_success else None

        if linking_user_id:
            # Account-link flow: stamp lichess_id + username onto the existing user
            redirect_err_link = RedirectResponse(f"{settings.frontend_url}/?link_error=already_linked", 302)
            existing = db.query(User).filter(User.lichess_id == profile["id"]).first()
            if existing and existing.id != linking_user_id:
                log_event(logger, logging.WARNING, "auth.oauth.lichess_link_conflict", ip=ip,
                          user_id=linking_user_id, conflicting_id=existing.id)
                return redirect_err_link
            link_user = db.query(User).filter(User.id == linking_user_id).first()
            if not link_user:
                return redirect_err_link
            link_user.lichess_id = profile["id"]
            if profile.get("username"):
                link_user.lichess_username = profile["username"]
            db.commit()
            log_event(logger, logging.INFO, "auth.oauth.lichess_linked", ip=ip, user_id=link_user.id)
            return RedirectResponse(f"{settings.frontend_url}/?link_success=lichess", 302)

        user = _find_or_create_oauth_user(
            db,
            provider="lichess",
            provider_id=profile["id"],
            email=lichess_email,
            lichess_username=profile.get("username"),
        )
        new_refresh = create_refresh_token(user.id, user.token_version)
        log_event(logger, logging.INFO, "auth.oauth.lichess_login", ip=ip, user_id=user.id)

        redirect_ok = RedirectResponse(f"{settings.frontend_url}/?oauth_success=1", 302)
        _set_refresh_cookie(redirect_ok, new_refresh)
        return redirect_ok
    except Exception as exc:
        log_event(logger, logging.ERROR, "auth.oauth.lichess_failed", ip=ip,
                  reason="unexpected_error", error=repr(exc))
        return redirect_err


@router.get("/chesscom")
@limiter.limit("20/minute")
async def chesscom_login(request: Request):
    """Chess.com does not offer a public OAuth system.

    Users can link their Chess.com account from account settings after signing in.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Chess.com does not provide OAuth. Link your username from account settings.",
    )


# ── OAuth account-linking (for already-authenticated users) ─────────────────
# These endpoints let a logged-in user add a second OAuth provider to their
# existing account without creating a duplicate. The user_id is embedded in
# the signed state token so the callback knows whose account to stamp.

@router.post("/google/link/start")
@limiter.limit("10/minute")
async def google_link_start(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Return the Google OAuth URL for linking (not login). Requires auth."""
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    verifier, challenge = _generate_pkce()
    state = _make_state_token(verifier, user_id=current_user.id)
    params = urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    })
    return {"url": f"https://accounts.google.com/o/oauth2/v2/auth?{params}"}


@router.post("/lichess/link/start")
@limiter.limit("10/minute")
async def lichess_link_start(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Return the Lichess OAuth URL for linking (not login). Requires auth."""
    if not settings.lichess_client_id:
        raise HTTPException(status_code=501, detail="Lichess OAuth not configured")
    verifier, challenge = _generate_pkce()
    state = _make_state_token(verifier, user_id=current_user.id)
    params = urlencode({
        "response_type": "code",
        "client_id": settings.lichess_client_id,
        "redirect_uri": settings.lichess_redirect_uri,
        "scope": "email:read",
        "state": state,
        "code_challenge_method": "S256",
        "code_challenge": challenge,
    })
    return {"url": f"https://lichess.org/oauth?{params}"}


# ── Password reset ────────────────────────────────────────────────────────────

class _ForgotPasswordBody(pydantic.BaseModel):
    email: str


class _ResetPasswordBody(pydantic.BaseModel):
    token: str
    new_password: str


@router.options("/forgot-password")
async def forgot_password_preflight():
    return {}


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    body: _ForgotPasswordBody,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Initiate a password reset. Always returns 200 to prevent email enumeration."""
    ip = client_ip_from_request(request)
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    # Always return the same response regardless of whether the user exists
    _ok = {"message": "If an account with that email exists, a reset link has been sent."}

    if user is None or user.hashed_password is None:
        # No email/password account — silently succeed
        log_event(logger, logging.INFO, "auth.forgot_password.no_account", email=email, ip=ip)
        return _ok

    # Invalidate any existing unused tokens for this user
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).delete(synchronize_session=False)

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.password_reset_expire_minutes)

    db.add(PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
    db.commit()

    send_password_reset_email(user.email, raw_token)
    log_event(logger, logging.INFO, "auth.forgot_password.sent", email=email, ip=ip)
    return _ok


@router.options("/reset-password")
async def reset_password_preflight():
    return {}


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
    body: _ResetPasswordBody,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Complete a password reset using the token from the email link."""
    ip = client_ip_from_request(request)
    _validate_password(body.new_password)

    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    token_row = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == token_hash
    ).first()

    if (
        token_row is None
        or token_row.used_at is not None
        or token_row.expires_at.replace(tzinfo=UTC) < datetime.now(UTC)
    ):
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    user = db.query(User).filter(User.id == token_row.user_id).first()
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    user.hashed_password = hash_password(body.new_password)
    user.token_version += 1  # invalidate all existing sessions
    token_row.used_at = datetime.now(UTC)
    db.commit()

    log_event(logger, logging.INFO, "auth.reset_password.success", user_id=user.id, ip=ip)
    return {"message": "Password reset successfully. You can now log in with your new password."}
