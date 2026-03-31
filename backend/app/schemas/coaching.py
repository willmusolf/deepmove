"""coaching.py — Pydantic schemas for coaching API request/response"""
from pydantic import BaseModel


class CoachingRequest(BaseModel):
    # Game context
    user_elo: int
    opponent_elo: int
    time_control: str          # e.g. "600" (seconds)
    time_control_label: str    # "bullet" | "blitz" | "rapid" | "classical"
    game_phase: str

    # Move data
    move_number: int
    move_played: str           # SAN notation
    eval_before: float         # centipawns
    eval_after: float
    eval_swing_cp: float

    # Analysis-first classification
    category: str | None = None
    mistake_type: str | None = None
    principle_id: str | None = None
    principle_name: str | None = None
    principle_description: str | None = None
    principle_takeaway: str | None = None
    confidence: float = 100    # kept for DB/backward compat

    # Pre-verified facts from feature extraction
    verified_facts: list[str]  # Human-readable fact strings
    engine_move_idea: str      # What the engine's move was trying to do

    # Cache metadata
    elo_band: str              # e.g. "1200-1400"
    position_hash: str         # Hash of key position features

    # Persistence identifiers (optional — guests and PGN-paste skip DB save)
    backend_game_id: int | None = None    # DB primary key — preferred over platform_game_id lookup
    platform_game_id: str | None = None   # platform-specific game ID (e.g. Chess.com game ID)
    platform: str | None = None           # "chesscom" | "lichess" | "pgn-paste"
    color: str = "white"                  # "white" | "black" — whose move this was


class CoachingResponse(BaseModel):
    lesson: str
    category: str | None
    principle_id: str | None = None
    confidence: float
    cached: bool
