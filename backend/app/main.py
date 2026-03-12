"""main.py — FastAPI application entry point"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import coaching, games, auth, users

app = FastAPI(
    title="DeepMove API",
    description="Chess coaching backend — LLM lesson generation, auth, game history",
    version="0.1.0",
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


@app.get("/health")
def health_check():
    """Simple health check — used by Railway and monitoring."""
    return {"status": "ok", "service": "deepmove-api"}
