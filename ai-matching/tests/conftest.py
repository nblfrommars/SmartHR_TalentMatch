import os

# Test chạy độc lập với máy dev: KHÔNG dùng key thật trong ai-matching/.env (không gọi OpenAI,
# không tốn tiền), không cần Qdrant/Redis/Kafka thật. Biến môi trường ưu tiên hơn file .env,
# nên đặt rõ mọi biến có thể khác giữa các máy.
os.environ.update(
    {
        "AI_ENVIRONMENT": "test",
        "AI_OPENAI_API_KEY": "",
        "AI_QDRANT_API_KEY": "",
        "AI_EMBEDDING_PROVIDER": "hashing",
        "AI_EMBEDDING_CACHE": "memory",
        "AI_EMBEDDING_DIMENSION": "1536",
        "AI_EMBEDDING_VERSION": "text-embedding-3-small@v1",
        "AI_QDRANT_URL": ":memory:",
        "AI_QDRANT_JOBS_COLLECTION": "jobs",
        "AI_QDRANT_CANDIDATES_COLLECTION": "candidates",
        "AI_KAFKA_ENABLED": "false",
        "AI_INTERNAL_API_ENABLED": "false",
        "AI_REQUIRE_IDENTITY": "false",
        "AI_CV_SEARCHABLE_DEFAULT": "false",
    }
)
