"""user.py — Pydantic schemas for user API"""
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    is_premium: bool
    elo_estimate: int | None
