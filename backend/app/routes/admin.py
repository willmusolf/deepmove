"""admin.py — Admin-only endpoints for dev tooling.

All routes require is_admin=True on the authenticated user.
Used to clear cached lessons during prompt iteration.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.lesson import Lesson
from app.models.user import User

router = APIRouter()


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user


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
