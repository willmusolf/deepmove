"""users.py — User profile endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.rate_limiting import limiter
from app.routes.auth import _set_refresh_cookie, _validate_password
from app.schemas.user import AuthResponse, PasswordChange, UserResponse, UserUpdate
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)

router = APIRouter()


@router.get("/me", response_model=UserResponse)
@limiter.limit("120/minute")
async def get_me(request: Request, user: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return UserResponse.model_validate(user)


@router.patch("/me", response_model=UserResponse)
@limiter.limit("30/minute")
async def update_me(
    request: Request,
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user profile fields."""
    if "chesscom_username" in body.model_fields_set:
        user.chesscom_username = body.chesscom_username
    if "lichess_username" in body.model_fields_set:
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
@limiter.limit("5/minute")
async def delete_me(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete user account and all associated data (GDPR)."""
    db.delete(user)
    db.commit()
    return {"deleted": True}


@router.get("/me/export")
@limiter.limit("10/minute")
async def export_me(
    request: Request,
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


@router.patch("/me/password")
@limiter.limit("5/minute")
async def change_password(
    request: Request,
    body: PasswordChange,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the authenticated user's password."""
    # OAuth-only users have no password to change
    if not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account uses OAuth login — no password to change",
        )

    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    _validate_password(body.new_password)

    user.hashed_password = hash_password(body.new_password)
    user.token_version += 1  # Invalidate all existing sessions
    db.commit()

    # Issue fresh tokens so current session stays alive
    access = create_access_token(user.id, user.token_version)
    refresh = create_refresh_token(user.id, user.token_version)
    _set_refresh_cookie(response, refresh)

    return AuthResponse(access_token=access, user=UserResponse.model_validate(user))
