"""coaching.py — Pydantic schemas for coaching API request/response"""
from typing import Annotated, Literal

from pydantic import BaseModel, Field

BoundedFact = Annotated[str, Field(max_length=500)]


class CoachingRequest(BaseModel):
    # Game context
    user_elo: int = Field(ge=0, le=4000)
    opponent_elo: int = Field(ge=0, le=4000)
    time_control: str = Field(max_length=20)          # e.g. "600" (seconds)
    time_control_label: Literal["bullet", "blitz", "rapid", "classical"]
    game_phase: Literal["opening", "middlegame", "endgame"]

    # Move data
    move_number: int = Field(ge=1, le=500)
    move_played: str = Field(max_length=20)           # SAN notation
    eval_before: float = Field(ge=-100000, le=100000)         # centipawns
    eval_after: float = Field(ge=-100000, le=100000)
    eval_swing_cp: float = Field(ge=-100000, le=100000)

    # Analysis-first classification
    category: str | None = Field(default=None, max_length=50)
    mistake_type: str | None = Field(default=None, max_length=50)
    principle_id: str | None = Field(default=None, max_length=50)
    principle_name: str | None = Field(default=None, max_length=100)
    principle_description: str | None = Field(default=None, max_length=500)
    principle_takeaway: str | None = Field(default=None, max_length=500)
    confidence: float = Field(default=100, ge=0, le=100)    # kept for DB/backward compat

    # Pre-verified facts from feature extraction
    verified_facts: list[BoundedFact] = Field(max_length=10)
    engine_move_idea: str = Field(max_length=500)

    # Cache metadata
    elo_band: str = Field(max_length=20)              # e.g. "1200-1400"
    position_hash: str = Field(max_length=128)        # Hash of key position features

    # Persistence identifiers (optional — guests and PGN-paste skip DB save)
    backend_game_id: int | None = Field(default=None, ge=1)    # DB primary key — preferred over platform_game_id lookup
    platform_game_id: str | None = Field(default=None, max_length=100)
    platform: Literal["chesscom", "lichess", "pgn-paste"] | None = None
    color: Literal["white", "black"] = "white"


class CoachingResponse(BaseModel):
    lesson: str
    category: str | None
    principle_id: str | None = None
    confidence: float
    cached: bool
    fallback_used: bool = False
