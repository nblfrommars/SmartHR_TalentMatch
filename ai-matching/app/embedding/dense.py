"""Dense embedding.

- OpenAIEmbedder: text-embedding-3-small (1536 chiều), dùng khi chạy thật.
- HashingEmbedder: vector "bag of words" băm vào 1536 chiều, không cần mạng/API key. Chỉ dùng
  cho dev và test; không bắt được ngữ nghĩa ("Backend Engineer" ~ "Java Developer").
"""

import hashlib
import math
import re
from collections import Counter
from collections.abc import Sequence
from typing import Protocol

from openai import AsyncOpenAI

from app.embedding.cache import EmbeddingCache, Vector, cache_key

_WORD = re.compile(r"\w+")


class DenseEmbedder(Protocol):
    name: str
    dimension: int

    async def embed(self, texts: Sequence[str]) -> list[Vector]: ...


class OpenAIEmbedder:
    def __init__(
        self,
        client: AsyncOpenAI,
        model: str = "text-embedding-3-small",
        dimension: int = 1536,
        batch_size: int = 128,
    ) -> None:
        self._client = client
        self.name = model
        self.dimension = dimension
        self._batch_size = batch_size

    async def embed(self, texts: Sequence[str]) -> list[Vector]:
        vectors: list[Vector] = []
        for start in range(0, len(texts), self._batch_size):
            batch = list(texts[start : start + self._batch_size])
            response = await self._client.embeddings.create(model=self.name, input=batch)
            # API trả về kèm index; sắp lại cho chắc đúng thứ tự đầu vào
            vectors.extend(item.embedding for item in sorted(response.data, key=lambda d: d.index))
        return vectors


class HashingEmbedder:
    def __init__(self, dimension: int = 1536) -> None:
        self.name = f"hashing-{dimension}"
        self.dimension = dimension

    async def embed(self, texts: Sequence[str]) -> list[Vector]:
        return [self._embed_one(text) for text in texts]

    def _embed_one(self, text: str) -> Vector:
        vector = [0.0] * self.dimension
        for word, count in Counter(_WORD.findall(text.lower())).items():
            digest = hashlib.blake2b(word.encode("utf-8"), digest_size=8).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimension
            sign = 1.0 if digest[4] & 1 else -1.0
            vector[index] += sign * (1.0 + math.log(count))
        norm = math.sqrt(sum(v * v for v in vector))
        # Văn bản rỗng: trả vector đơn vị cố định để Qdrant (cosine) không lỗi chia cho 0
        return [v / norm for v in vector] if norm else [1.0] + [0.0] * (self.dimension - 1)


class CachedDenseEmbedder:
    """Bọc một embedder: chỉ gọi embedder cho văn bản chưa có trong cache."""

    def __init__(self, inner: DenseEmbedder, cache: EmbeddingCache) -> None:
        self._inner = inner
        self._cache = cache
        self.name = inner.name
        self.dimension = inner.dimension

    async def embed(self, texts: Sequence[str]) -> list[Vector]:
        keys = [cache_key(self.name, text) for text in texts]
        cached = await self._cache.get_many(keys)

        missing = [i for i, vector in enumerate(cached) if vector is None]
        unique_texts = list(dict.fromkeys(texts[i] for i in missing))
        if unique_texts:
            fresh = dict(zip(unique_texts, await self._inner.embed(unique_texts), strict=True))
            await self._cache.set_many({cache_key(self.name, t): v for t, v in fresh.items()})
            for i in missing:
                cached[i] = fresh[texts[i]]
        return cached  # type: ignore[return-value]  # mọi phần tử đã được điền
