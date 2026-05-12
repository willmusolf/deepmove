"""security.py — Password hashing and JWT token utilities."""
import hashlib
import logging
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

logger = logging.getLogger(__name__)

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=13,
)

# ── Password hashing ────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── Breach check (HaveIBeenPwned k-anonymity API) ───────────────────────────

async def check_password_not_breached(plain: str) -> None:
    """Raise 422 if password appears in the HIBP Pwned Passwords corpus.

    Uses k-anonymity: only the first 5 chars of the SHA-1 hash are sent. HIBP
    returns all hashes with that prefix; we check locally whether ours is in
    the list. Failures (network, timeout) are logged and ignored — we never
    block a registration because HIBP is down.
    """
    sha1 = hashlib.sha1(plain.encode("utf-8")).hexdigest().upper()
    prefix, suffix = sha1[:5], sha1[5:]
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(
                f"https://api.pwnedpasswords.com/range/{prefix}",
                headers={"Add-Padding": "true"},
            )
        if not resp.is_success:
            logger.warning("hibp.unavailable status=%s", resp.status_code)
            return
        for line in resp.text.splitlines():
            hash_suffix, _, count = line.partition(":")
            if hash_suffix.strip().upper() == suffix and count.strip() != "0":
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "This password has appeared in a known data breach. "
                        "Please choose a different password."
                    ),
                )
    except HTTPException:
        raise
    except (httpx.RequestError, httpx.TimeoutException) as exc:
        logger.warning("hibp.request_failed error=%r", exc)


# ── JWT tokens ───────────────────────────────────────────────────────────────

def create_access_token(user_id: int, token_version: int) -> str:
    """Create a short-lived access token (15 min)."""
    payload = {
        "sub": str(user_id),
        "tv": token_version,
        "exp": datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes),
        "type": "access",
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: int, token_version: int) -> str:
    """Create a long-lived refresh token (7 days), stored in HttpOnly cookie."""
    payload = {
        "sub": str(user_id),
        "tv": token_version,
        "exp": datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
        "type": "refresh",
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT. Returns payload dict or None if invalid."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError:
        return None
