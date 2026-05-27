"""Lightweight launch analytics event ingestion."""

import logging

from fastapi import APIRouter, Body, Depends, Request, status

from app.dependencies import get_optional_user
from app.logging_utils import client_ip_from_request, log_event
from app.models.user import User
from app.rate_limiting import limiter
from app.schemas.analytics import LaunchEventRequest, LaunchEventResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/events", response_model=LaunchEventResponse, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("120/minute")
async def create_launch_event(
    request: Request,
    payload: LaunchEventRequest = Body(...),
    user: User | None = Depends(get_optional_user),
):
    log_event(
        logger,
        logging.INFO,
        "product.launch_event",
        launch_event=payload.name,
        session_id=payload.session_id,
        page=payload.page,
        user_id=user.id if user else None,
        ip=client_ip_from_request(request),
        properties=payload.properties,
    )
    return LaunchEventResponse(accepted=True)
