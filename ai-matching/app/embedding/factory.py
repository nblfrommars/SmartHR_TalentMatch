from openai import AsyncOpenAI
from redis.asyncio import Redis

from app.core.config import Settings
from app.embedding.cache import InMemoryEmbeddingCache, RedisEmbeddingCache
from app.embedding.dense import CachedDenseEmbedder, DenseEmbedder, HashingEmbedder, OpenAIEmbedder


def build_dense_embedder(settings: Settings, redis: Redis | None = None) -> DenseEmbedder:
    inner: DenseEmbedder
    if settings.embedding_provider == "openai":
        if not settings.openai_api_key:
            raise ValueError("AI_EMBEDDING_PROVIDER=openai cần AI_OPENAI_API_KEY")
        client = AsyncOpenAI(
            api_key=settings.openai_api_key, timeout=settings.openai_timeout_seconds
        )
        inner = OpenAIEmbedder(
            client, model=settings.openai_embedding_model, dimension=settings.embedding_dimension
        )
    else:
        inner = HashingEmbedder(dimension=settings.embedding_dimension)

    if settings.embedding_cache == "none":
        return inner
    if settings.embedding_cache == "redis":
        if redis is None:
            raise ValueError("AI_EMBEDDING_CACHE=redis cần kết nối Redis")
        return CachedDenseEmbedder(inner, RedisEmbeddingCache(redis))
    return CachedDenseEmbedder(inner, InMemoryEmbeddingCache())
