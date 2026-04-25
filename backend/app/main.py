"""main.py — FastAPI application entry point"""
import asyncio
import logging
import sys
import time
import uuid
from contextlib import asynccontextmanager

import sqlalchemy as sa
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import engine
from app.logging_utils import configure_logging, log_event, reset_request_id, set_request_id
from app.rate_limiting import limiter
from app.routes import admin, auth, coaching, games, users
from app.services import coaching as coaching_service

configure_logging(settings.environment)
logger = logging.getLogger(__name__)


async def _wake_database() -> None:
    """Ping the DB on startup so Neon wakes before the first user request.

    Neon free-tier computes auto-suspend after inactivity. The first connection
    after suspension takes ~5s. We retry here in the background so users never
    hit a cold-start timeout.
    """
    if engine is None:
        return

    for attempt in range(1, 6):
        started = time.perf_counter()
        try:
            with engine.connect() as conn:
                conn.execute(sa.text("SELECT 1"))
            log_event(
                logger,
                logging.INFO,
                "system.db_wake",
                attempt=attempt,
                success=True,
                latency_ms=round((time.perf_counter() - started) * 1000, 2),
            )
            return
        except Exception as exc:
            wait = attempt * 2
            log_event(
                logger,
                logging.WARNING,
                "system.db_wake",
                attempt=attempt,
                success=False,
                latency_ms=round((time.perf_counter() - started) * 1000, 2),
                retry_in_seconds=wait,
                error_type=type(exc).__name__,
            )
            await asyncio.sleep(wait)

    log_event(
        logger,
        logging.ERROR,
        "system.db_wake",
        attempt=5,
        success=False,
        error_type="database_unreachable_after_retries",
    )


def _check_database_sync() -> bool:
    if engine is None:
        return False

    with engine.connect() as conn:
        conn.execute(sa.text("SELECT 1"))

    return True


async def _database_is_reachable() -> bool:
    try:
        return await asyncio.wait_for(asyncio.to_thread(_check_database_sync), timeout=3)
    except Exception:
        return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _wake_database()
    yield


app = FastAPI(
    title="DeepMove API",
    description="Chess coaching backend — LLM lesson generation, auth, game history",
    version="0.1.0",
    lifespan=lifespan,
)

# Rate limiting — attach limiter + 429 handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — explicit methods/headers (no wildcard — defense against CSRF)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    token = set_request_id(request_id)
    request.state.request_id = request_id
    try:
        response = await call_next(request)
    finally:
        reset_request_id(token)
    response.headers["X-Request-ID"] = request_id
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    # Minimal CSP: pure JSON API, no scripts/styles/frames needed
    response.headers.setdefault("Content-Security-Policy", "default-src 'none'")
    # Hide server implementation details
    response.headers["Server"] = "deepmove"
    if settings.environment == "production":
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains; preload",
        )
    return response

# Routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(games.router, prefix="/games", tags=["games"])
app.include_router(coaching.router, prefix="/coaching", tags=["coaching"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])


@app.api_route("/health", methods=["GET", "HEAD"])
def health_check():
    """Simple health check — used by Railway and monitoring."""
    return {"status": "ok", "service": "deepmove-api"}


@app.api_route("/health/deep", methods=["GET", "HEAD"])
@limiter.limit("10/minute")
async def deep_health_check(request: Request):
    """Runtime health check for smoke tests and uptime monitoring."""
    db_ok = await _database_is_reachable()
    payload = {
        "status": "ok" if db_ok else "degraded",
        "service": "deepmove-api",
        "checks": {
            "database": "ok" if db_ok else "unreachable",
            "coaching_enabled": settings.coaching_enabled,
            "lesson_cache_size": coaching_service.lesson_cache_size(),
        },
    }
    if db_ok:
        return payload
    return JSONResponse(status_code=503, content=payload)


@app.get("/version")
@limiter.limit("30/minute")
def version_check(request: Request):
    return {
        "commit_sha": settings.git_commit_sha,
        "build_time": settings.build_time,
        "environment": settings.environment,
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    }
