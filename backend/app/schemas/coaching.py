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

    # Classification result
    principle_id: str | None
    principle_name: str | None
    confidence: float          # 0-100

    # Pre-verified facts from feature extraction
    verified_facts: list[str]  # Human-readable fact strings
    engine_move_idea: str      # What the engine's move was trying to do

    # Cache metadata
    elo_band: str              # e.g. "1200-1400"
    position_hash: str         # Hash of key position features


class CoachingResponse(BaseModel):
    lesson: str
    principle_id: str | None
    confidence: float
    cached: bool
