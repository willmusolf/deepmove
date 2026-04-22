"""admin.py — Schemas for admin-only ops endpoints."""
from datetime import datetime

from pydantic import BaseModel


class AdminCounts(BaseModel):
    users: int
    games: int
    lessons: int
    principles: int


class AdminSpendSummary(BaseModel):
    daily_llm_calls: int
    daily_llm_ceiling: int
    estimated_daily_cost_usd: float


class AdminOpsStatus(BaseModel):
    coaching_enabled: bool
    lesson_cache_entries: int
    spend: AdminSpendSummary
    counts: AdminCounts


class AdminToggleRequest(BaseModel):
    enabled: bool


class AdminActionResult(BaseModel):
    ok: bool = True
    message: str
    coaching_enabled: bool | None = None
    lesson_cache_entries: int | None = None


class AdminAuditLogEntry(BaseModel):
    id: int
    admin_user_id: int
    admin_email: str
    action: str
    details: dict
    ip_address: str
    created_at: datetime


class AdminAuditLogResponse(BaseModel):
    entries: list[AdminAuditLogEntry]
    total: int
