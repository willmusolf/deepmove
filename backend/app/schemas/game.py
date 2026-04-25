"""game.py — Pydantic schemas for game API"""
import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

MAX_PGN_BYTES = 50 * 1024
MAX_JSON_ITEMS = 500


class GameCreate(BaseModel):
    platform: Literal["chesscom", "lichess", "pgn-paste"]
    platform_game_id: str | None = Field(default=None, max_length=100)
    pgn: str
    user_color: Literal["white", "black"] | None = None
    user_elo: int | None = Field(default=None, ge=0, le=4000)
    opponent: str | None = Field(default=None, max_length=100)
    opponent_rating: int | None = Field(default=None, ge=0, le=4000)
    result: Literal["W", "L", "D"] | None = None
    time_control: str | None = Field(default=None, max_length=20)
    end_time: int | None = Field(default=None, ge=0)  # unix ms
    move_evals: list[dict] | None = Field(default=None, max_length=MAX_JSON_ITEMS)
    critical_moments: list[dict] | None = Field(default=None, max_length=20)
    analyzed_at: datetime | None = None

    @field_validator("pgn")
    @classmethod
    def validate_pgn_size(cls, value: str) -> str:
        if len(value.encode("utf-8")) > MAX_PGN_BYTES:
            raise ValueError("PGN exceeds 50KB limit")
        return value

    @field_validator("move_evals", "critical_moments")
    @classmethod
    def validate_json_payload_size(cls, value: list[dict] | None) -> list[dict] | None:
        if value is None:
            return value
        for item in value:
            if not isinstance(item, dict) or len(item) > 50:
                raise ValueError("Analysis entries must be objects with at most 50 keys")
            # Guard against huge string values inside each entry
            if len(json.dumps(item).encode()) > 10_000:
                raise ValueError("Analysis entry exceeds 10 KB size limit")
        return value


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
    games: list[dict] = Field(max_length=200)  # [{ platform_game_id, analyzedAt }]

    @field_validator("games")
    @classmethod
    def validate_games(cls, value: list[dict]) -> list[dict]:
        for item in value:
            platform_game_id = item.get("platform_game_id")
            if platform_game_id is not None and (
                not isinstance(platform_game_id, str) or len(platform_game_id) > 100
            ):
                raise ValueError("platform_game_id must be a string up to 100 characters")
        return value


class SyncStatusResponse(BaseModel):
    to_upload: list[str]         # platform_game_ids the server doesn't have
    to_download: list[GameResponse]  # games the client doesn't have


class GameSyncResult(BaseModel):
    platform_game_id: str
    db_id: int


class BatchCreateResponse(BaseModel):
    created: int
    updated: int
    errors: list[str]
    results: list[GameSyncResult]
