"""config.py — Application settings loaded from environment variables"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Anthropic
    anthropic_api_key: str = ""

    # Database (Supabase PostgreSQL connection string)
    database_url: str = ""

    # App
    environment: str = "development"
    secret_key: str = "change-me-in-production"

    # CORS — frontend origins allowed to call this API
    @property
    def allowed_origins(self) -> list[str]:
        if self.environment == "development":
            return ["http://localhost:5173", "http://localhost:3000"]
        # TODO: Add production Vercel URL before launch
        return ["https://deepmove.io", "https://www.deepmove.io"]

    # LLM model selection
    lesson_model: str = "claude-sonnet-4-6"      # Full lessons
    classify_model: str = "claude-haiku-4-5-20251001"  # Quick classification checks


settings = Settings()
