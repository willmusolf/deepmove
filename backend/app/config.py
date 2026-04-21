"""config.py — Application settings loaded from environment variables"""
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Anthropic
    anthropic_api_key: str = ""

    # Database (Neon PostgreSQL connection string)
    database_url: str = ""

    # App
    environment: str = "development"
    secret_key: str = "change-me-in-production"

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

    # CORS — frontend origins allowed to call this API
    @property
    def allowed_origins(self) -> list[str]:
        if self.environment == "development":
            return ["http://localhost:5173", "http://localhost:3000"]
        return ["https://deepmove.io", "https://www.deepmove.io"]

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
