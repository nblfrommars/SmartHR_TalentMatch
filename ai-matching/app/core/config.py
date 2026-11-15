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

    # Ghi vào payload Qdrant; đổi khi đổi model/cách dựng document để biết cần re-index
    embedding_version: str = "text-embedding-3-small@v1"
    # ~1.500 token (ước lượng ~4 ký tự/token), giới hạn phần mô tả job / tóm tắt kinh nghiệm
    document_max_chars: int = 6000

    # Dùng từ Phase 4 trở đi (Qdrant, Kafka, Redis, OpenAI)
    qdrant_url: str = "http://localhost:6333"
    kafka_bootstrap_servers: str = "localhost:9092"
    redis_url: str = "redis://localhost:6379/0"
    openai_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
