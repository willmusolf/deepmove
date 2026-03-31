"""coaching.py — Coaching endpoint
Receives pre-computed analysis facts from the frontend,
generates the LLM lesson, returns structured coaching response.

The LLM NEVER analyzes chess positions directly.
It receives verified facts and writes the lesson text.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, get_optional_user
from app.models.game import Game
from app.models.lesson import Lesson
from app.models.user import User
from app.schemas.coaching import CoachingRequest, CoachingResponse
from app.services import coaching as coaching_service

router = APIRouter()


@router.post("/lesson", response_model=CoachingResponse)
async def generate_lesson(
    request: CoachingRequest,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Generate a coaching lesson for a critical moment.

    Frontend sends pre-verified facts + mistake category.
    Returns the LLM-generated coaching lesson.

    For logged-in users whose game is in the DB:
    - Checks DB for an existing lesson before calling Claude (survives server restarts)
    - Saves the generated lesson to DB after generation
    """
    # ── 1. Look up game row ──────────────────────────────────────────────────
    game: Game | None = None
    if user and request.backend_game_id:
        # Direct PK lookup — fast path, used when game was synced this session
        game = (
            db.query(Game)
            .filter(Game.id == request.backend_game_id, Game.user_id == user.id)
            .first()
        )
    elif user and request.platform_game_id and request.platform:
        game = (
            db.query(Game)
            .filter(
                Game.user_id == user.id,
                Game.platform == request.platform,
                Game.platform_game_id == request.platform_game_id,
            )
            .first()
        )

    # ── 2. DB cache check (persistent — survives server restart) ─────────────
    if game and user:
        lesson_key = request.category or request.principle_id or None
        existing = (
            db.query(Lesson)
            .filter(
                Lesson.game_id == game.id,
                Lesson.user_id == user.id,
                Lesson.move_number == request.move_number,
                Lesson.principle_id == lesson_key,
            )
            .first()
        )
        if existing:
            return CoachingResponse(
                lesson=existing.lesson_text,
                category=existing.principle_id,
                principle_id=existing.principle_id,
                confidence=existing.confidence,
                cached=True,
            )

    # ── 3. Generate lesson (in-memory LRU cache + LLM) ───────────────────────
    try:
        result = await coaching_service.generate_lesson(request.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    # ── 4. Persist to DB for logged-in users (skip if already LRU-cached) ────
    if game and user and not result.get("cached"):
        lesson = Lesson(
            game_id=game.id,
            user_id=user.id,
            move_number=request.move_number,
            color=request.color,
            principle_id=request.category or request.principle_id,
            confidence=result["confidence"],
            lesson_text=result["lesson"],
            elo_band=request.elo_band,
        )
        db.add(lesson)
        db.commit()

    return result


@router.post("/socratic")
async def generate_socratic_question():
    # Think First blunder-check checklist is rendered client-side from classification data.
    # This endpoint is reserved for future server-side Socratic question generation.
    return {"status": "not_implemented"}


@router.delete("/cache")
def flush_lesson_cache(current_user: User = Depends(get_current_user)):
    """Flush the in-memory LRU lesson cache (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    count = coaching_service.clear_lesson_cache()
    return {"cleared": True, "entries_removed": count}
