"""game.py — Pydantic schemas for game API"""
from pydantic import BaseModel
from datetime import datetime


class GameCreate(BaseModel):
    pgn: str
    platform: str   # "chesscom" | "lichess" | "manual"
    platform_game_id: str | None = None


class GameResponse(BaseModel):
    id: int
    pgn: str
    platform: str
    created_at: datetime
