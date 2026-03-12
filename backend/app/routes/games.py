"""games.py — Game storage and retrieval endpoints"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_games():
    # TODO (Track D): Return authenticated user's game history
    return []


@router.post("/")
async def save_game():
    # TODO: Save a reviewed game with its lessons
    return {"status": "not_implemented"}
