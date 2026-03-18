"""game.py — Pydantic schemas for game API"""
from datetime import datetime

from pydantic import BaseModel


class GameCreate(BaseModel):
    platform: str               # "chesscom" | "lichess" | "pgn-paste"
    platform_game_id: str | None = None
    pgn: str
    user_color: str | None = None
    user_elo: int | None = None
    opponent: str | None = None
    opponent_rating: int | None = None
    result: str | None = None   # "W" | "L" | "D"
    time_control: str | None = None
    end_time: int | None = None  # unix ms
    move_evals: list | None = None
    critical_moments: list | None = None
    analyzed_at: str | None = None  # ISO timestamp


class GameResponse(BaseModel):
    id: int
    platform: str
    platform_game_id: str | None
    pgn: str
    user_color: str | None
    user_elo: int | None
    opponent: str | None
    opponent_rating: int | None
    result: str | None
    time_control: str | None
    end_time: int | None
    move_evals: list | None
    critical_moments: list | None
    analyzed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class GameListResponse(BaseModel):
    """Lightweight response for game list (no moveEvals/criticalMoments)."""
    id: int
    platform: str
    platform_game_id: str | None
    user_color: str | None
    user_elo: int | None
    opponent: str | None
    opponent_rating: int | None
    result: str | None
    time_control: str | None
    end_time: int | None
    analyzed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SyncStatusRequest(BaseModel):
    games: list[dict]  # [{ platform_game_id, analyzedAt }]


class SyncStatusResponse(BaseModel):
    to_upload: list[str]         # platform_game_ids the server doesn't have
    to_download: list[GameResponse]  # games the client doesn't have


class BatchCreateResponse(BaseModel):
    created: int
    updated: int
    errors: list[str]
