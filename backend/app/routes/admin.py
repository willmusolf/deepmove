"""admin.py — Admin-only endpoints for lightweight production ops."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.logging_utils import client_ip_from_request, log_event
from app.models.game import Game
from app.models.lesson import Lesson
from app.models.principle import UserPrinciple
from app.models.user import User
from app.schemas.admin import AdminActionResult, AdminCounts, AdminOpsStatus, AdminToggleRequest
from app.services import coaching as coaching_service

router = APIRouter()
logger = logging.getLogger(__name__)


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user


@router.get("/ops/status", response_model=AdminOpsStatus)
def get_ops_status(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return AdminOpsStatus(
        coaching_enabled=settings.coaching_enabled,
        lesson_cache_entries=coaching_service.lesson_cache_size(),
        counts=AdminCounts(
            users=db.query(User).count(),
            games=db.query(Game).count(),
            lessons=db.query(Lesson).count(),
            principles=db.query(UserPrinciple).count(),
        ),
    )


@router.post("/ops/coaching", response_model=AdminActionResult)
def set_coaching_enabled(
    request: Request,
    body: AdminToggleRequest,
    admin: User = Depends(require_admin),
):
    settings.coaching_enabled = body.enabled
    state = "enabled" if body.enabled else "disabled"
    log_event(
        logger,
        logging.INFO,
        "admin.coaching_toggle",
        admin_id=admin.id,
        ip=client_ip_from_request(request),
        new_state=body.enabled,
    )
    return AdminActionResult(
        message=f"AI coaching {state} for this running backend instance.",
        coaching_enabled=settings.coaching_enabled,
    )


@router.post("/ops/cache/lessons/clear", response_model=AdminActionResult)
def clear_lesson_cache(
    request: Request,
    admin: User = Depends(require_admin),
):
    removed = coaching_service.clear_lesson_cache()
    log_event(
        logger,
        logging.INFO,
        "admin.cache_clear",
        admin_id=admin.id,
        ip=client_ip_from_request(request),
        entries_removed=removed,
    )
    return AdminActionResult(
        message=f"Cleared {removed} cached lesson{'s' if removed != 1 else ''}.",
        lesson_cache_entries=0,
    )


@router.delete("/game/{game_id}/lessons")
def delete_game_lessons(
    game_id: int,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Clear all cached coaching lessons for a specific game."""
    count = db.query(Lesson).filter(Lesson.game_id == game_id).delete()
    db.commit()
    log_event(
        logger,
        logging.INFO,
        "admin.lessons_delete",
        admin_id=admin.id,
        ip=client_ip_from_request(request),
        game_id=game_id,
        count=count,
    )
    return {"deleted": count, "game_id": game_id}


@router.delete("/games/lessons/all")
def delete_all_lessons(
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Clear ALL cached coaching lessons across all users (dev tool)."""
    count = db.query(Lesson).delete()
    db.commit()
    log_event(
        logger,
        logging.INFO,
        "admin.lessons_delete",
        admin_id=admin.id,
        ip=client_ip_from_request(request),
        game_id="all",
        count=count,
    )
    return {"deleted": count}
