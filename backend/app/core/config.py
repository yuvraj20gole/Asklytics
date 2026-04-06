from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Data Analyst API"
    environment: str = "dev"
    api_v1_prefix: str = "/api/v1"

    database_url: str = "sqlite:///./local.db"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    # Default 7 days for local/demo; override via ACCESS_TOKEN_EXPIRE_MINUTES in production.
    access_token_expire_minutes: int = 10080

    query_max_rows: int = 200
    backend_url: str = "http://localhost:8000"
    # Comma-separated browser origins, e.g. https://asklytics.vercel.app,https://yuvraj20gole.github.io
    cors_allow_origins: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
