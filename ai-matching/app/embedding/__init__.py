"""Encode văn bản thành vector: dense (OpenAI hoặc hashing) và sparse (BM25), có cache."""

from app.embedding.cache import EmbeddingCache, InMemoryEmbeddingCache, RedisEmbeddingCache
from app.embedding.dense import CachedDenseEmbedder, DenseEmbedder, HashingEmbedder, OpenAIEmbedder
from app.embedding.sparse import Bm25Encoder

__all__ = [
    "Bm25Encoder",
    "CachedDenseEmbedder",
    "DenseEmbedder",
    "EmbeddingCache",
    "HashingEmbedder",
    "InMemoryEmbeddingCache",
    "OpenAIEmbedder",
    "RedisEmbeddingCache",
]
