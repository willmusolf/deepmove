"""Schemas for lightweight launch analytics events."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

LaunchEventName = Literal[
    "open_app",
    "signup_complete",
    "account_linked",
    "first_game_imported",
    "first_analysis_completed",
    "review_session_started",
    "second_session_within_7d",
    "training_plan_beta_opened",
]


class LaunchEventRequest(BaseModel):
    name: LaunchEventName
    session_id: str = Field(min_length=8, max_length=128)
    page: str | None = Field(default=None, max_length=200)
    properties: dict[str, Any] = Field(default_factory=dict)


class LaunchEventResponse(BaseModel):
    accepted: bool
