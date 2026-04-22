"""main.py — FastAPI application entry point"""
import asyncio
import logging
import platform
from contextlib import asynccontextmanager

import sqlalchemy as sa
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import engine
from app.rate_limiting import limiter
from app.routes import admin, auth, coaching, games, users
from app.services import coaching as coaching_service

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
        try:
            with engine.connect() as conn:
                conn.execute(sa.text("SELECT 1"))
            logger.info("DB ready (attempt %d)", attempt)
            return
        except Exception as exc:
            wait = attempt * 2
            logger.warning("DB not ready (attempt %d): %s — retrying in %ds", attempt, exc, wait)
            await asyncio.sleep(wait)

    logger.error("DB still unreachable after 5 attempts — requests will 503 until it wakes")


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

# Routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(games.router, prefix="/games", tags=["games"])
app.include_router(coaching.router, prefix="/coaching", tags=["coaching"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])


@app.get("/health")
def health_check():
    """Simple health check — used by Railway and monitoring."""
    return {"status": "ok", "service": "deepmove-api"}


@app.get("/health/deep")
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
        "environment": settings.environment,
    }
    if db_ok:
        return payload
    return JSONResponse(status_code=503, content=payload)


@app.get("/version")
def version_check():
    return {
        "commit_sha": settings.git_commit_sha,
        "build_time": settings.build_time,
        "environment": settings.environment,
        "python_version": platform.python_version(),
    }
