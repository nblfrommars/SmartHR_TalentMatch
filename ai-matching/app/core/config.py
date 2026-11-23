from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Cấu hình đọc từ biến môi trường (tiền tố AI_) hoặc file .env."""

    model_config = SettingsConfigDict(env_prefix="AI_", env_file=".env", extra="ignore")

    app_name: str = "ai-matching"
    environment: str = "dev"
    log_level: str = "INFO"
    # Bật API nội bộ /ai/internal/* (nhận event qua HTTP thay Kafka) — chỉ dùng khi dev/test
    internal_api_enabled: bool = False

    skills_alias_path: Path = APP_DIR / "skills" / "skills_alias.yaml"

    # Ghi vào payload Qdrant; đổi khi đổi model/cách dựng document để biết cần re-index
    embedding_version: str = "text-embedding-3-small@v1"
    # ~1.500 token (ước lượng ~4 ký tự/token), giới hạn phần mô tả job / tóm tắt kinh nghiệm
    document_max_chars: int = 6000

    # Dense embedding: "openai" khi chạy thật; "hashing" cho dev/test (không cần API key)
    embedding_provider: Literal["openai", "hashing"] = "openai"
    openai_api_key: str | None = None
    openai_embedding_model: str = "text-embedding-3-small"
    openai_timeout_seconds: float = 15.0
    embedding_dimension: int = 1536
    # Parse CV: model LLM trích xuất JSON và giới hạn file
    openai_chat_model: str = "gpt-4o-mini"
    cv_max_bytes: int = 5 * 1024 * 1024
    cv_max_pages: int = 10
    cv_max_chars: int = 24_000
    # Cache embedding: "redis" khi chạy thật; "memory" cho dev; "none" để tắt
    embedding_cache: Literal["redis", "memory", "none"] = "memory"

    # Qdrant: URL server, hoặc ":memory:" để chạy trong RAM (dev/test, mất dữ liệu khi tắt)
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str | None = None
    qdrant_jobs_collection: str = "jobs"
    qdrant_candidates_collection: str = "candidates"
    qdrant_timeout_seconds: int = 30
    # Lúc khởi động Qdrant có thể chưa sẵn sàng (docker-compose bật song song): thử lại tối đa
    # chừng này lần, chờ tăng dần (1, 2, 4... tối đa 10 giây) trước khi báo lỗi
    qdrant_startup_attempts: int = 10

    redis_url: str = "redis://localhost:6379/0"
    # CV từ user-cv chưa có cờ "cho phép HR tìm kiếm"; tạm dùng giá trị mặc định này cho mọi CV.
    # Mặc định false (bảo vệ dữ liệu cá nhân): HR chỉ tìm thấy CV khi bật AI_CV_SEARCHABLE_DEFAULT
    cv_searchable_default: bool = False

    # Kafka consumer: nhận job.events (job-service) và cv.profile.events (user-cv).
    # Mặc định tắt để chạy dev/test không cần Kafka; bật bằng AI_KAFKA_ENABLED=true
    kafka_enabled: bool = False
    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_group_id: str = "ai-matching"
    kafka_job_topic: str = "job.events"
    kafka_cv_topic: str = "cv.profile.events"
    # Message lỗi sau kafka_max_attempts lần thử (hoặc sai định dạng) được đẩy sang "<topic>.dlq"
    kafka_dlq_suffix: str = ".dlq"
    kafka_max_attempts: int = 3
    kafka_retry_backoff_seconds: float = 0.5


@lru_cache
def get_settings() -> Settings:
    return Settings()
