"""main.py — FastAPI application entry point"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import admin, auth, coaching, games, users

logger = logging.getLogger(__name__)


async def _wake_database() -> None:
    """Ping the DB on startup so Neon wakes before the first user request.

    Neon free-tier computes auto-suspend after inactivity. The first connection
    after suspension takes ~5s. We retry here in the background so users never
    hit a cold-start timeout.
    """
    import sqlalchemy as sa

    from app.database import engine

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

# CORS — allow requests from the Vite dev server and production frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
