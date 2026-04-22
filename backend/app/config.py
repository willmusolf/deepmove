"""config.py — Application settings loaded from environment variables."""
from datetime import UTC, datetime

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Anthropic
    anthropic_api_key: str = ""

    # Database (Neon PostgreSQL connection string)
    database_url: str = ""

    # App
    environment: str = "development"
    secret_key: str = "change-me-in-production"
    git_commit_sha: str = Field(
        default="unknown",
        validation_alias=AliasChoices("GIT_COMMIT_SHA", "RENDER_GIT_COMMIT", "COMMIT_SHA"),
    )
    build_time: str = Field(
        default_factory=lambda: datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        validation_alias=AliasChoices("BUILD_TIME", "BUILD_TIMESTAMP"),
    )

    # JWT
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    refresh_cookie_name: str = "deepmove_refresh"

    # OAuth — Lichess
    lichess_client_id: str = ""
    lichess_client_secret: str = ""
    lichess_redirect_uri: str = "http://localhost:8000/auth/lichess/callback"

    # OAuth — Google
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"

    # OAuth — Chess.com
    chesscom_client_id: str = ""
    chesscom_client_secret: str = ""
    chesscom_redirect_uri: str = "http://localhost:8000/auth/chesscom/callback"

    # Frontend URL (for OAuth redirects back to the app)
    frontend_url: str = "http://localhost:5173"

    # Feature flags
    coaching_enabled: bool = False
    trusted_proxy_depth: int = Field(default=1, ge=1)
    free_tier_daily_lessons: int = Field(default=50, ge=1)
    premium_daily_lessons: int = Field(default=500, ge=1)
    guest_daily_lessons: int = Field(default=10, ge=1)
    max_daily_llm_calls: int = Field(default=5000, ge=1)
    estimated_llm_cost_usd: float = Field(default=0.01, ge=0)

    # Optional explicit CORS config for staging/preview environments
    allowed_origins_csv: str = Field(
        default="",
        validation_alias=AliasChoices("ALLOWED_ORIGINS_CSV", "ALLOWED_ORIGINS"),
    )
    allowed_origin_regex: str = ""

    # CORS — frontend origins allowed to call this API
    @property
    def allowed_origins(self) -> list[str]:
        if self.allowed_origins_csv:
            return _parse_csv(self.allowed_origins_csv)
        if self.environment == "development":
            return ["http://localhost:5173", "http://localhost:3000"]
        return ["https://deepmove.io", "https://www.deepmove.io"]

    @property
    def cors_origin_regex(self) -> str | None:
        r"""Normalize the most common dashboard escape mistake for regex env vars.

        Render/Vercel dashboard inputs should use single backslashes, e.g.
        `^https://.*-willmusolfs-projects\.vercel\.app$`.
        If a double-escaped value is pasted from source code, collapse `\\.` to `\.`
        so preview-origin CORS still works.
        """
        if not self.allowed_origin_regex:
            return None
        return self.allowed_origin_regex.replace("\\\\.", "\\.")

    # LLM model selection
    lesson_model: str = "claude-haiku-4-5-20251001"      # Full lessons
    classify_model: str = "claude-haiku-4-5-20251001"  # Quick classification checks

    @model_validator(mode="after")
    def _check_production_secrets(self) -> "Settings":
        """Fail fast if production is deployed with default/empty secrets."""
        if self.environment == "production":
            if not self.secret_key or self.secret_key == "change-me-in-production":
                raise ValueError(
                    "SECRET_KEY must be set to a strong random value in production. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
                )
            if not self.anthropic_api_key:
                raise ValueError("ANTHROPIC_API_KEY must be set in production")
            if not self.database_url:
                raise ValueError("DATABASE_URL must be set in production")
        return self


settings = Settings()
