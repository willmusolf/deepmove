"""admin.py — Admin-only endpoints for lightweight production ops."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.logging_utils import client_ip_from_request, log_event
from app.models.audit import AdminAuditLog
from app.models.game import Game
from app.models.lesson import Lesson
from app.models.principle import UserPrinciple
from app.models.user import User
from app.schemas.admin import (
    AdminActionResult,
    AdminAuditLogEntry,
    AdminAuditLogResponse,
    AdminCounts,
    AdminOpsStatus,
    AdminToggleRequest,
)
from app.services import coaching as coaching_service

router = APIRouter()
logger = logging.getLogger(__name__)


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def _record_admin_audit(
    db: Session,
    *,
    admin: User,
    action: str,
    details: dict,
    ip_address: str,
) -> None:
    db.add(
        AdminAuditLog(
            admin_user_id=admin.id,
            action=action,
            details=details,
            ip_address=ip_address,
        )
    )


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


@router.get("/audit-log", response_model=AdminAuditLogResponse)
def get_audit_log(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action: str | None = Query(default=None),
    admin_user_id: int | None = Query(default=None, ge=1),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(AdminAuditLog, User.email).join(User, User.id == AdminAuditLog.admin_user_id)
    if action:
        query = query.filter(AdminAuditLog.action == action)
    if admin_user_id:
        query = query.filter(AdminAuditLog.admin_user_id == admin_user_id)

    total = query.count()
    rows = (
        query.order_by(AdminAuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    entries = [
        AdminAuditLogEntry(
            id=audit.id,
            admin_user_id=audit.admin_user_id,
            admin_email=email,
            action=audit.action,
            details=audit.details,
            ip_address=audit.ip_address,
            created_at=audit.created_at,
        )
        for audit, email in rows
    ]
    return AdminAuditLogResponse(entries=entries, total=total)


@router.post("/ops/coaching", response_model=AdminActionResult)
def set_coaching_enabled(
    request: Request,
    body: AdminToggleRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    settings.coaching_enabled = body.enabled
    state = "enabled" if body.enabled else "disabled"
    ip_address = client_ip_from_request(request)
    _record_admin_audit(
        db,
        admin=admin,
        action="coaching.toggle",
        details={"new_state": body.enabled},
        ip_address=ip_address,
    )
    db.commit()
    log_event(
        logger,
        logging.INFO,
        "admin.coaching_toggle",
        admin_id=admin.id,
        ip=ip_address,
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
    db: Session = Depends(get_db),
):
    removed = coaching_service.clear_lesson_cache()
    ip_address = client_ip_from_request(request)
    _record_admin_audit(
        db,
        admin=admin,
        action="cache.clear",
        details={"entries_removed": removed},
        ip_address=ip_address,
    )
    db.commit()
    log_event(
        logger,
        logging.INFO,
        "admin.cache_clear",
        admin_id=admin.id,
        ip=ip_address,
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
    ip_address = client_ip_from_request(request)
    _record_admin_audit(
        db,
        admin=admin,
        action="lessons.delete_game",
        details={"game_id": game_id, "count": count},
        ip_address=ip_address,
    )
    db.commit()
    log_event(
        logger,
        logging.INFO,
        "admin.lessons_delete",
        admin_id=admin.id,
        ip=ip_address,
        game_id=game_id,
        count=count,
    )
    return {"deleted": count, "game_id": game_id}


@router.delete("/games/lessons/all")
def delete_all_lessons(
    request: Request,
    confirm: bool = Query(default=False),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Clear ALL cached coaching lessons across all users (dev tool)."""
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="This deletes ALL lessons for ALL users. Pass ?confirm=true to proceed.",
        )
    count = db.query(Lesson).delete()
    ip_address = client_ip_from_request(request)
    _record_admin_audit(
        db,
        admin=admin,
        action="lessons.delete_all",
        details={"count": count},
        ip_address=ip_address,
    )
    db.commit()
    log_event(
        logger,
        logging.INFO,
        "admin.lessons_delete",
        admin_id=admin.id,
        ip=ip_address,
        game_id="all",
        count=count,
    )
    return {"deleted": count}
