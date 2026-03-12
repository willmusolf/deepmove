"""users.py — User profile endpoints"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/me")
async def get_me():
    # TODO (Track D): Return authenticated user's profile + weakness data
    return {"status": "not_implemented"}
