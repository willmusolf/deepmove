"""admin.py — Admin-only endpoints for lightweight production ops."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.models.game import Game
from app.models.lesson import Lesson
from app.models.principle import UserPrinciple
from app.models.user import User
from app.schemas.admin import AdminActionResult, AdminCounts, AdminOpsStatus, AdminToggleRequest
from app.services import coaching as coaching_service

router = APIRouter()


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
    body: AdminToggleRequest,
    admin: User = Depends(require_admin),
):
    settings.coaching_enabled = body.enabled
    state = "enabled" if body.enabled else "disabled"
    return AdminActionResult(
        message=f"AI coaching {state} for this running backend instance.",
        coaching_enabled=settings.coaching_enabled,
    )


@router.post("/ops/cache/lessons/clear", response_model=AdminActionResult)
def clear_lesson_cache(
    admin: User = Depends(require_admin),
):
    removed = coaching_service.clear_lesson_cache()
    return AdminActionResult(
        message=f"Cleared {removed} cached lesson{'s' if removed != 1 else ''}.",
        lesson_cache_entries=0,
    )


@router.delete("/game/{game_id}/lessons")
def delete_game_lessons(
    game_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Clear all cached coaching lessons for a specific game."""
    count = db.query(Lesson).filter(Lesson.game_id == game_id).delete()
    db.commit()
    return {"deleted": count, "game_id": game_id}


@router.delete("/games/lessons/all")
def delete_all_lessons(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Clear ALL cached coaching lessons across all users (dev tool)."""
    count = db.query(Lesson).delete()
    db.commit()
    return {"deleted": count}
