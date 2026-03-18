"""games.py — Game storage, retrieval, and sync endpoints."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.game import Game
from app.models.user import User
from app.schemas.game import (
    BatchCreateResponse,
    GameCreate,
    GameListResponse,
    GameResponse,
    SyncStatusRequest,
    SyncStatusResponse,
)

router = APIRouter()


def _game_from_create(body: GameCreate, user_id: int) -> Game:
    """Build a Game model instance from a GameCreate schema."""
    return Game(
        user_id=user_id,
        platform=body.platform,
        platform_game_id=body.platform_game_id,
        pgn=body.pgn,
        user_color=body.user_color,
        user_elo=body.user_elo,
        opponent=body.opponent,
        opponent_rating=body.opponent_rating,
        result=body.result,
        time_control=body.time_control,
        end_time=body.end_time,
        move_evals=body.move_evals,
        critical_moments=body.critical_moments,
        analyzed_at=datetime.fromisoformat(body.analyzed_at) if body.analyzed_at else None,
    )


@router.get("/", response_model=list[GameListResponse])
async def list_games(
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    platform: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the authenticated user's games (metadata only, no moveEvals)."""
    query = db.query(Game).filter(Game.user_id == user.id)
    if platform:
        query = query.filter(Game.platform == platform)
    games = query.order_by(Game.end_time.desc().nullslast()).offset(offset).limit(limit).all()
    return [GameListResponse.model_validate(g) for g in games]


@router.get("/{game_id}", response_model=GameResponse)
async def get_game(
    game_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single game with full analysis data."""
    game = db.query(Game).filter(Game.id == game_id, Game.user_id == user.id).first()
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    return GameResponse.model_validate(game)


@router.post("/", response_model=GameResponse, status_code=status.HTTP_201_CREATED)
async def create_game(
    body: GameCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a single analyzed game."""
    # Check for duplicate by platform_game_id
    if body.platform_game_id:
        existing = (
            db.query(Game)
            .filter(Game.user_id == user.id, Game.platform_game_id == body.platform_game_id)
            .first()
        )
        if existing:
            # Update existing game with new analysis
            existing.move_evals = body.move_evals
            existing.critical_moments = body.critical_moments
            existing.analyzed_at = datetime.fromisoformat(body.analyzed_at) if body.analyzed_at else None
            existing.synced_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(existing)
            return GameResponse.model_validate(existing)

    game = _game_from_create(body, user.id)
    db.add(game)
    db.commit()
    db.refresh(game)
    return GameResponse.model_validate(game)


@router.post("/batch", response_model=BatchCreateResponse)
async def batch_create(
    games: list[GameCreate],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload multiple games at once (for sync). Max 50 per request."""
    if len(games) > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 50 games per batch",
        )

    created = 0
    updated = 0
    errors: list[str] = []

    for body in games:
        try:
            if body.platform_game_id:
                existing = (
                    db.query(Game)
                    .filter(Game.user_id == user.id, Game.platform_game_id == body.platform_game_id)
                    .first()
                )
                if existing:
                    existing.move_evals = body.move_evals
                    existing.critical_moments = body.critical_moments
                    existing.analyzed_at = (
                        datetime.fromisoformat(body.analyzed_at) if body.analyzed_at else None
                    )
                    existing.synced_at = datetime.now(timezone.utc)
                    updated += 1
                    continue

            game = _game_from_create(body, user.id)
            db.add(game)
            created += 1
        except Exception as e:
            errors.append(f"{body.platform_game_id}: {e!s}")

    db.commit()
    return BatchCreateResponse(created=created, updated=updated, errors=errors)


@router.post("/sync-status", response_model=SyncStatusResponse)
async def sync_status(
    body: SyncStatusRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Compare client's game list with server to determine what needs syncing."""
    # Get all platform_game_ids the server has for this user
    server_games = (
        db.query(Game)
        .filter(Game.user_id == user.id, Game.platform_game_id.isnot(None))
        .all()
    )
    server_ids = {g.platform_game_id for g in server_games}

    # Client's game IDs
    client_ids = {g.get("platform_game_id") for g in body.games if g.get("platform_game_id")}

    # Games client has but server doesn't → client should upload
    to_upload = list(client_ids - server_ids)

    # Games server has but client doesn't → send to client
    to_download_games = [g for g in server_games if g.platform_game_id not in client_ids]
    to_download = [GameResponse.model_validate(g) for g in to_download_games]

    return SyncStatusResponse(to_upload=to_upload, to_download=to_download)


@router.delete("/{game_id}")
async def delete_game(
    game_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a game and its lessons."""
    game = db.query(Game).filter(Game.id == game_id, Game.user_id == user.id).first()
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    db.delete(game)
    db.commit()
    return {"deleted": True}
