import os

# Test chạy độc lập: không đọc .env của máy dev, không gọi OpenAI/Qdrant/Redis thật.
os.environ.update(
    {
        "AI_ENVIRONMENT": "test",
        "AI_EMBEDDING_PROVIDER": "hashing",
        "AI_EMBEDDING_CACHE": "memory",
        "AI_EMBEDDING_VERSION": "text-embedding-3-small@v1",
        "AI_QDRANT_URL": ":memory:",
    }
)
