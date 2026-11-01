from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Cấu hình đọc từ biến môi trường (tiền tố AI_) hoặc file .env."""

    model_config = SettingsConfigDict(env_prefix="AI_", env_file=".env", extra="ignore")

    app_name: str = "ai-matching"
    environment: str = "dev"
    log_level: str = "INFO"

    skills_alias_path: Path = APP_DIR / "skills" / "skills_alias.yaml"

    # Dùng từ Phase 4 trở đi (Qdrant, Kafka, Redis, OpenAI)
    qdrant_url: str = "http://localhost:6333"
    kafka_bootstrap_servers: str = "localhost:9092"
    redis_url: str = "redis://localhost:6379/0"
    openai_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
