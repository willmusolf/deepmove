"""coaching.py — Coaching endpoint.

Receives pre-computed analysis facts from the frontend,
generates the LLM lesson, returns structured coaching response.

The LLM NEVER analyzes chess positions directly.
It receives verified facts and writes the lesson text.
"""
import logging
import time
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request

from app.config import settings
from app.database import SessionLocal
from app.dependencies import get_current_user, get_optional_user
from app.logging_utils import client_ip_from_request, log_event
from app.models.game import Game
from app.models.lesson import Lesson
from app.models.user import User
from app.rate_limiting import limiter
from app.schemas.coaching import CoachingRequest, CoachingResponse
from app.services import coaching as coaching_service

logger = logging.getLogger(__name__)

router = APIRouter()


def _reset_user_quota_if_needed(user: User) -> None:
    today = datetime.now(UTC).date()
    if user.daily_lesson_reset < today:
        user.daily_lesson_count = 0
        user.daily_lesson_reset = today


def _quota_exceeded_response(limit: int, used: int) -> HTTPException:
    resets_at = datetime.combine(
        datetime.now(UTC).date() + timedelta(days=1),
        datetime.min.time(),
        tzinfo=UTC,
    )
    return HTTPException(
        status_code=429,
        detail={
            "detail": "Daily coaching limit reached. Resets at midnight UTC.",
            "limit": limit,
            "used": used,
            "resets_at": resets_at.isoformat().replace("+00:00", "Z"),
        },
        headers={"Retry-After": str(coaching_service.seconds_until_midnight_utc())},
    )


@router.post("/lesson", response_model=CoachingResponse)
@limiter.limit("30/minute")
async def generate_lesson(
    request: Request,
    body: CoachingRequest,
    user: User | None = Depends(get_optional_user),
):
    log_event(
        logger,
        logging.INFO,
        "coaching.lesson_requested",
        category=body.category or body.principle_id,
        elo_band=body.elo_band,
        game_phase=body.game_phase,
        is_authenticated=user is not None,
    )
    if not settings.coaching_enabled:
        raise HTTPException(status_code=503, detail="AI coaching is not enabled")

    # Open DB only if the user is authenticated — avoids waking Neon for guest requests
    db = SessionLocal() if (user is not None and SessionLocal is not None) else None
    started = time.perf_counter()
    try:
        result = await _generate_lesson_impl(body, request=request, user=user, db=db)
        log_event(
            logger,
            logging.INFO,
            "coaching.lesson_generated",
            category=body.category or body.principle_id,
            elo_band=body.elo_band,
            model=result.get("model"),
            latency_ms=round((time.perf_counter() - started) * 1000, 2),
            cached=result.get("cached", False),
            fallback_used=result.get("fallback_used", False),
        )
        return result
    except HTTPException as exc:
        if exc.status_code >= 500:
            log_event(
                logger,
                logging.ERROR,
                "coaching.lesson_failed",
                category=body.category or body.principle_id,
                elo_band=body.elo_band,
                error_type=f"http_{exc.status_code}",
                fallback_used=False,
            )
        raise
    except Exception as exc:
        log_event(
            logger,
            logging.ERROR,
            "coaching.lesson_failed",
            category=body.category or body.principle_id,
            elo_band=body.elo_band,
            error_type=type(exc).__name__,
            fallback_used=False,
        )
        raise
    finally:
        if db is not None:
            db.close()


async def _generate_lesson_impl(
    coaching_request: CoachingRequest,
    *,
    request: Request,
    user: User | None,
    db,
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
    if user and coaching_request.backend_game_id:
        game = (
            db.query(Game)
            .filter(Game.id == coaching_request.backend_game_id, Game.user_id == user.id)
            .first()
        )
    elif user and coaching_request.platform_game_id and coaching_request.platform:
        game = (
            db.query(Game)
            .filter(
                Game.user_id == user.id,
                Game.platform == coaching_request.platform,
                Game.platform_game_id == coaching_request.platform_game_id,
            )
            .first()
        )

    request_dict = coaching_request.model_dump()

    # ── 2. Free cache checks (cost-free — do not count against quota) ────────
    cached = coaching_service.get_cached_lesson(request_dict)
    if cached is not None:
        return CoachingResponse(**cached)

    if game and user:
        lesson_key = coaching_request.principle_id or coaching_request.category or None
        existing = (
            db.query(Lesson)
            .filter(
                Lesson.game_id == game.id,
                Lesson.user_id == user.id,
                Lesson.move_number == coaching_request.move_number,
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
                fallback_used=False,
            )

    # ── 3. Quota checks for non-cached lessons ────────────────────────────────
    limit: int
    ip_address: str | None = None
    if user:
        _reset_user_quota_if_needed(user)
        limit = (
            settings.premium_daily_lessons
            if user.is_premium
            else settings.free_tier_daily_lessons
        )
        if user.daily_lesson_count >= limit:
            raise _quota_exceeded_response(limit, user.daily_lesson_count)
    else:
        ip_address = client_ip_from_request(request)
        limit = settings.guest_daily_lessons
        guest_count, _ = coaching_service.get_guest_usage(ip_address)
        if guest_count >= limit:
            raise _quota_exceeded_response(limit, guest_count)

    # ── 4. Global ceiling ─────────────────────────────────────────────────────
    db_dirty = False

    if coaching_service.is_global_ceiling_reached():
        log_event(logger, logging.WARNING, "coaching.global_ceiling_reached")
        result = coaching_service.build_fallback_result(request_dict)
    else:
        # ── 5. Generate lesson (in-memory LRU cache + LLM/fallback) ──────────
        try:
            result = await coaching_service.generate_lesson(request_dict)
        except Exception:
            logger.exception(
                "Lesson generation failed for move %s", coaching_request.move_number
            )
            raise HTTPException(status_code=500, detail="Lesson generation failed. Please try again.")

    # ── 6. Persist result and increment spend counters when a real LLM call ran ─
    if not result.get("cached") and not result.get("fallback_used"):
        coaching_service.increment_global_daily_calls()
        if user:
            user.daily_lesson_count += 1
            db_dirty = True
        elif ip_address is not None:
            coaching_service.increment_guest_usage(ip_address)

    if game and user and not result.get("cached") and not result.get("fallback_used"):
        lesson = Lesson(
            game_id=game.id,
            user_id=user.id,
            move_number=coaching_request.move_number,
            color=coaching_request.color,
            principle_id=coaching_request.principle_id or coaching_request.category,
            confidence=result["confidence"],
            lesson_text=result["lesson"],
            elo_band=coaching_request.elo_band,
        )
        db.add(lesson)
        db_dirty = True

    if db is not None and db_dirty:
        db.commit()

    return CoachingResponse(**result)


@router.post("/socratic")
async def generate_socratic_question():
    # Think First blunder-check checklist is rendered client-side from classification data.
    # This endpoint is reserved for future server-side Socratic question generation.
    return {"status": "not_implemented"}


@router.delete("/cache")
def flush_lesson_cache(request: Request, current_user: User = Depends(get_current_user)):
    """Flush the in-memory LRU lesson cache (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    count = coaching_service.clear_lesson_cache()
    log_event(
        logger,
        logging.INFO,
        "admin.cache_clear",
        admin_id=current_user.id,
        ip=client_ip_from_request(request),
        entries_removed=count,
    )
    return {"cleared": True, "entries_removed": count}
