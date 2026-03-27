"""user.py — Pydantic schemas for user API"""
from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    chesscom_username: str | None = None
    lichess_username: str | None = None
    elo_estimate: int | None = None
    preferences: dict | None = None


class UserResponse(BaseModel):
    is_admin: bool
    id: int
    email: str
    is_premium: bool
    elo_estimate: int | None
    chesscom_username: str | None
    lichess_username: str | None
    preferences: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    access_token: str
    user: UserResponse


class TokenResponse(BaseModel):
    access_token: str
    user: UserResponse


class PasswordChange(BaseModel):
    current_password: str
    new_password: str
