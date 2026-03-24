"""users.py — User profile endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return UserResponse.model_validate(user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user profile fields."""
    if body.chesscom_username is not None:
        user.chesscom_username = body.chesscom_username
    if body.lichess_username is not None:
        user.lichess_username = body.lichess_username
    if body.elo_estimate is not None:
        user.elo_estimate = body.elo_estimate
    if body.preferences is not None:
        # Merge preferences (don't overwrite the whole dict)
        current = dict(user.preferences or {})
        current.update(body.preferences)
        user.preferences = current

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/me")
async def delete_me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete user account and all associated data (GDPR)."""
    db.delete(user)
    db.commit()
    return {"deleted": True}


@router.get("/me/export")
async def export_me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export all user data as JSON (GDPR data portability)."""
    from app.models.game import Game
    from app.models.lesson import Lesson
    from app.models.principle import UserPrinciple

    games = db.query(Game).filter(Game.user_id == user.id).all()
    lessons = db.query(Lesson).filter(Lesson.user_id == user.id).all()
    principles = db.query(UserPrinciple).filter(UserPrinciple.user_id == user.id).all()

    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "elo_estimate": user.elo_estimate,
            "chesscom_username": user.chesscom_username,
            "lichess_username": user.lichess_username,
            "preferences": user.preferences,
            "is_premium": user.is_premium,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "games": [
            {
                "id": g.id,
                "platform": g.platform,
                "platform_game_id": g.platform_game_id,
                "pgn": g.pgn,
                "user_color": g.user_color,
                "user_elo": g.user_elo,
                "opponent": g.opponent,
                "opponent_rating": g.opponent_rating,
                "result": g.result,
                "time_control": g.time_control,
                "move_evals": g.move_evals,
                "critical_moments": g.critical_moments,
                "analyzed_at": g.analyzed_at.isoformat() if g.analyzed_at else None,
                "created_at": g.created_at.isoformat() if g.created_at else None,
            }
            for g in games
        ],
        "lessons": [
            {
                "id": lesson.id,
                "game_id": lesson.game_id,
                "move_number": lesson.move_number,
                "color": lesson.color,
                "principle_id": lesson.principle_id,
                "confidence": lesson.confidence,
                "lesson_text": lesson.lesson_text,
                "elo_band": lesson.elo_band,
                "created_at": lesson.created_at.isoformat() if lesson.created_at else None,
            }
            for lesson in lessons
        ],
        "principles": [
            {
                "principle_id": p.principle_id,
                "trigger_count": p.trigger_count,
                "last_seen": p.last_seen.isoformat() if p.last_seen else None,
                "game_ids": p.game_ids,
            }
            for p in principles
        ],
    }
