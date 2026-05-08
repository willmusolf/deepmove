"""user.py — Pydantic schemas for user API"""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

MAX_PREFERENCES_KEYS = 50
MAX_PREFERENCE_STRING_BYTES = 1000


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(max_length=256)


class UserUpdate(BaseModel):
    chesscom_username: str | None = Field(default=None, max_length=40)
    lichess_username: str | None = Field(default=None, max_length=40)
    elo_estimate: int | None = Field(default=None, ge=0, le=4000)
    preferences: dict | None = Field(default=None, max_length=MAX_PREFERENCES_KEYS)

    @field_validator("preferences")
    @classmethod
    def validate_preferences(cls, value: dict | None) -> dict | None:
        if value is None:
            return value
        for key, pref_value in value.items():
            if not isinstance(key, str) or len(key) > 100:
                raise ValueError("Preference keys must be strings up to 100 characters")
            if isinstance(pref_value, str) and len(pref_value.encode("utf-8")) > MAX_PREFERENCE_STRING_BYTES:
                raise ValueError("Preference string values must be 1000 bytes or less")
        return value


class UserResponse(BaseModel):
    is_admin: bool
    id: int
    email: str
    is_premium: bool
    subscription_status: str
    elo_estimate: int | None
    chesscom_username: str | None
    lichess_username: str | None
    lichess_oauth_linked: bool
    google_oauth_linked: bool
    preferences: dict
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        # Compute derived boolean fields from provider ID columns
        data = {
            **{c: getattr(obj, c) for c in [
                "is_admin", "id", "email", "is_premium", "subscription_status",
                "elo_estimate", "chesscom_username", "lichess_username",
                "preferences", "created_at"
            ]},
            "lichess_oauth_linked": bool(getattr(obj, "lichess_id", None)),
            "google_oauth_linked": bool(getattr(obj, "google_id", None)),
        }
        return cls(**data)


class AuthResponse(BaseModel):
    access_token: str
    user: UserResponse


class TokenResponse(BaseModel):
    access_token: str
    user: UserResponse


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=1, max_length=256)
