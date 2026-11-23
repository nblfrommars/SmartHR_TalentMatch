import math
from types import SimpleNamespace

import pytest
from fakeredis import FakeAsyncRedis

from app.core.config import Settings
from app.embedding import (
    Bm25Encoder,
    CachedDenseEmbedder,
    HashingEmbedder,
    InMemoryEmbeddingCache,
    OpenAIEmbedder,
    RedisEmbeddingCache,
)
from app.embedding.factory import build_dense_embedder
from app.embedding.sparse import token_index


def cosine(a, b):
    return sum(x * y for x, y in zip(a, b, strict=True))


class CountingEmbedder:
    name = "counting"
    dimension = 3

    def __init__(self):
        self.calls: list[list[str]] = []

    async def embed(self, texts):
        self.calls.append(list(texts))
        return [[float(len(t)), 0.0, 1.0] for t in texts]


# ---------- BM25 ----------


def test_token_index_is_stable():
    assert token_index("spring_boot") == token_index("spring_boot")
    assert token_index("spring_boot") != token_index("spring")
    assert 0 <= token_index("phát_triển") < 2**32


def test_bm25_document_weights():
    vec = Bm25Encoder().encode_document("java java spring_boot")
    weights = dict(zip(vec.indices, vec.values, strict=True))

    assert vec.indices == sorted(vec.indices)
    assert weights[token_index("java")] > weights[token_index("spring_boot")] > 0
    # Bão hòa TF: lặp lại nhiều lần không tăng tuyến tính
    many = Bm25Encoder().encode_document(" ".join(["java"] * 50))
    assert many.values[0] < 2.2  # cận trên k1 + 1


def test_bm25_query_is_binary_and_lowercase():
    vec = Bm25Encoder().encode_query("Java java KAFKA")

    assert sorted(vec.indices) == sorted([token_index("java"), token_index("kafka")])
    assert vec.values == [1.0, 1.0]


def test_bm25_empty_text():
    vec = Bm25Encoder().encode_document("")
    assert vec.indices == [] and vec.values == []


# ---------- Dense ----------


async def test_hashing_embedder_is_normalized_and_deterministic():
    emb = HashingEmbedder(dimension=64)
    a1, a2, empty = await emb.embed(["java spring boot", "java spring boot", ""])

    assert a1 == a2
    assert math.isclose(math.sqrt(sum(v * v for v in a1)), 1.0, rel_tol=1e-9)
    assert math.isclose(math.sqrt(sum(v * v for v in empty)), 1.0)


async def test_hashing_embedder_shared_words_are_closer():
    emb = HashingEmbedder()
    base, near, far = await emb.embed(
        ["java spring boot kafka", "java spring boot docker", "kế toán thuế doanh nghiệp"]
    )

    assert cosine(base, near) > cosine(base, far)


async def test_openai_embedder_batches_and_keeps_order():
    calls = []

    async def create(model, input):
        calls.append(list(input))
        # Trả ngược thứ tự để kiểm tra embedder sắp lại theo index
        data = [SimpleNamespace(index=i, embedding=[float(len(t))]) for i, t in enumerate(input)]
        return SimpleNamespace(data=list(reversed(data)))

    client = SimpleNamespace(embeddings=SimpleNamespace(create=create))
    emb = OpenAIEmbedder(client, dimension=1, batch_size=2)

    vectors = await emb.embed(["a", "bb", "ccc"])

    assert vectors == [[1.0], [2.0], [3.0]]
    assert calls == [["a", "bb"], ["ccc"]]


# ---------- Cache ----------


async def test_cached_embedder_only_embeds_misses_once():
    inner = CountingEmbedder()
    emb = CachedDenseEmbedder(inner, InMemoryEmbeddingCache())

    first = await emb.embed(["java", "kafka", "java"])
    second = await emb.embed(["kafka", "docker"])

    assert first == [[4.0, 0.0, 1.0], [5.0, 0.0, 1.0], [4.0, 0.0, 1.0]]
    assert second == [[5.0, 0.0, 1.0], [6.0, 0.0, 1.0]]
    assert inner.calls == [["java", "kafka"], ["docker"]]


async def test_in_memory_cache_evicts_oldest():
    cache = InMemoryEmbeddingCache(max_items=2)
    await cache.set_many({"a": [1.0], "b": [2.0]})
    await cache.get_many(["a"])  # a vừa được dùng
    await cache.set_many({"c": [3.0]})

    assert await cache.get_many(["a", "b", "c"]) == [[1.0], None, [3.0]]


async def test_redis_cache_roundtrip():
    cache = RedisEmbeddingCache(FakeAsyncRedis(), ttl_seconds=60)
    await cache.set_many({"k1": [0.5, -1.25, 3.0]})

    assert await cache.get_many(["k1", "missing"]) == [[0.5, -1.25, 3.0], None]
    assert await cache.get_many([]) == []


async def test_cached_embedder_with_redis():
    inner = CountingEmbedder()
    redis = FakeAsyncRedis()
    await CachedDenseEmbedder(inner, RedisEmbeddingCache(redis)).embed(["java"])
    # Một instance khác (như sau khi restart) vẫn dùng lại được cache
    again = await CachedDenseEmbedder(inner, RedisEmbeddingCache(redis)).embed(["java"])

    assert again == [[4.0, 0.0, 1.0]]
    assert len(inner.calls) == 1


# ---------- Factory ----------


def test_factory_hashing_with_memory_cache():
    emb = build_dense_embedder(Settings(embedding_provider="hashing", embedding_cache="memory"))
    assert isinstance(emb, CachedDenseEmbedder)
    assert emb.dimension == 1536


def test_factory_openai_requires_key():
    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        build_dense_embedder(Settings(embedding_provider="openai", openai_api_key=None))


def test_factory_redis_requires_connection():
    with pytest.raises(ValueError, match="Redis"):
        build_dense_embedder(Settings(embedding_provider="hashing", embedding_cache="redis"))


def test_factory_openai_without_cache():
    emb = build_dense_embedder(
        Settings(embedding_provider="openai", openai_api_key="sk-test", embedding_cache="none")
    )
    assert isinstance(emb, OpenAIEmbedder)
