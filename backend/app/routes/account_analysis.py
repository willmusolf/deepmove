"""Account-wide Training Plan analysis endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.account_analysis import AccountReport, AnalysisJob
from app.models.user import User
from app.rate_limiting import limiter
from app.schemas.account_analysis import (
    AnalysisJobResponse,
    JobReportResponse,
    LatestReportResponse,
    StartAnalysisRequest,
    StartAnalysisResponse,
    TrainingPlanReport,
)
from app.services.account_analysis import (
    cancel_job,
    latest_job,
    latest_report,
    retry_job,
    start_analysis_job,
)

router = APIRouter()


def _job_response(job: AnalysisJob) -> AnalysisJobResponse:
    return AnalysisJobResponse.model_validate(job)


def _report_response(report: AccountReport | None) -> TrainingPlanReport | None:
    if report is None:
        return None
    return TrainingPlanReport.model_validate({
        "id": report.id,
        "created_at": report.created_at,
        "source_platforms": report.source_platforms,
        "scanned_range": report.scanned_range,
        "scan_summary": report.scan_summary,
        "time_control_breakdown": report.time_control_breakdown,
        "top_trends": report.top_trends,
        "current_focus": report.current_focus,
        "review_moments": report.review_moments,
        "opening_context": report.opening_context,
        "technical_evidence": report.technical_evidence,
    })


@router.post("/jobs", response_model=StartAnalysisResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_analysis_job(
    request: Request,
    body: StartAnalysisRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start the first-run broad Training Plan scan, or return the active one."""
    job, active_existing = start_analysis_job(db, user, body)
    return StartAnalysisResponse(job=_job_response(job), active_existing=active_existing)


@router.get("/jobs/latest", response_model=AnalysisJobResponse | None)
@limiter.limit("60/minute")
async def get_latest_job(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = latest_job(db, user.id)
    return _job_response(job) if job else None


@router.get("/jobs/{job_id}", response_model=JobReportResponse)
@limiter.limit("60/minute")
async def get_analysis_job(
    request: Request,
    job_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id, AnalysisJob.user_id == user.id).first()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis job not found")
    report = db.query(AccountReport).filter(AccountReport.id == job.report_id, AccountReport.user_id == user.id).first() if job.report_id else None
    return JobReportResponse(job=_job_response(job), report=_report_response(report))


@router.post("/jobs/{job_id}/cancel", response_model=AnalysisJobResponse)
@limiter.limit("20/minute")
async def cancel_analysis_job(
    request: Request,
    job_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = cancel_job(db, user.id, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis job not found")
    return _job_response(job)


@router.post("/jobs/{job_id}/retry", response_model=AnalysisJobResponse)
@limiter.limit("20/minute")
async def retry_analysis_job(
    request: Request,
    job_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = retry_job(db, user.id, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis job not found")
    return _job_response(job)


@router.get("/reports/latest", response_model=LatestReportResponse)
@limiter.limit("60/minute")
async def get_latest_report(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return LatestReportResponse(report=_report_response(latest_report(db, user.id)))
