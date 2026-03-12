"""auth.py — Authentication routes (email/password + OAuth)"""
from fastapi import APIRouter

router = APIRouter()


@router.post("/register")
async def register():
    # TODO (Track D): Email/password registration
    return {"status": "not_implemented"}


@router.post("/login")
async def login():
    # TODO (Track D): Login, return JWT
    return {"status": "not_implemented"}
