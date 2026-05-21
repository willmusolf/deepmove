"""Schemas for account-wide training plan reports."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

JobStage = Literal[
    "queued",
    "fetching_games",
    "scanning_metadata",
    "analyzing_candidates",
    "deep_reviewing_examples",
    "saving_report",
    "complete",
    "failed",
    "cancelled",
]
JobStatus = Literal["queued", "running", "complete", "failed", "cancelled"]


class TrainingPlanFocus(BaseModel):
    category: str
    title: str
    summary: str
    habit: list[str] = Field(default_factory=list)
    confidence: Literal["trend_signal", "verified_examples"]


class ReviewMoment(BaseModel):
    game_id: int
    platform_game_id: str | None
    platform: str
    opponent: str | None
    result: str | None
    time_control: str | None
    segment: str
    move_number: int
    color: Literal["white", "black"]
    move_played: str
    title: str
    coach_note: str
    pgn: str


class TrainingPlanReport(BaseModel):
    id: int
    created_at: datetime
    source_platforms: list[str]
    scanned_range: dict[str, Any]
    scan_summary: dict[str, Any]
    time_control_breakdown: list[dict[str, Any]]
    top_trends: list[dict[str, Any]]
    current_focus: TrainingPlanFocus
    review_moments: list[ReviewMoment]
    opening_context: list[dict[str, Any]]
    technical_evidence: dict[str, Any]


class AnalysisJobResponse(BaseModel):
    id: int
    status: JobStatus
    stage: JobStage
    progress_pct: int
    account_scope: dict[str, Any]
    filters: dict[str, Any]
    requested_game_ids: list[str]
    completed_game_ids: list[str]
    error: str | None
    report_id: int | None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    model_config = {"from_attributes": True}


class StartAnalysisRequest(BaseModel):
    max_games: int = Field(default=500, ge=25, le=500)
    months: int = Field(default=12, ge=1, le=24)
    min_initial_seconds: int = Field(default=300, ge=60, le=3600)
    platforms: list[Literal["chesscom", "lichess"]] | None = None


class StartAnalysisResponse(BaseModel):
    job: AnalysisJobResponse
    active_existing: bool


class LatestReportResponse(BaseModel):
    report: TrainingPlanReport | None


class JobReportResponse(BaseModel):
    job: AnalysisJobResponse
    report: TrainingPlanReport | None
