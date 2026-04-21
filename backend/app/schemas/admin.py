"""admin.py — Schemas for admin-only ops endpoints."""
from pydantic import BaseModel


class AdminCounts(BaseModel):
    users: int
    games: int
    lessons: int
    principles: int


class AdminOpsStatus(BaseModel):
    coaching_enabled: bool
    lesson_cache_entries: int
    counts: AdminCounts


class AdminToggleRequest(BaseModel):
    enabled: bool


class AdminActionResult(BaseModel):
    ok: bool = True
    message: str
    coaching_enabled: bool | None = None
    lesson_cache_entries: int | None = None
