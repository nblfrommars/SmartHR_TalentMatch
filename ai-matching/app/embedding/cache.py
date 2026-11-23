"""Cache dense embedding theo hash(text): CV/job không đổi thì không gọi OpenAI lại."""

import hashlib
from array import array
from collections import OrderedDict
from collections.abc import Sequence
from typing import Protocol

from redis.asyncio import Redis

Vector = list[float]


def cache_key(namespace: str, text: str) -> str:
    return f"emb:{namespace}:{hashlib.sha256(text.encode('utf-8')).hexdigest()}"


class EmbeddingCache(Protocol):
    async def get_many(self, keys: Sequence[str]) -> list[Vector | None]: ...

    async def set_many(self, items: dict[str, Vector]) -> None: ...


class InMemoryEmbeddingCache:
    """LRU trong RAM, dùng cho dev/test hoặc khi chưa có Redis."""

    def __init__(self, max_items: int = 10_000) -> None:
        self._data: OrderedDict[str, Vector] = OrderedDict()
        self._max_items = max_items

    async def get_many(self, keys: Sequence[str]) -> list[Vector | None]:
        result = []
        for key in keys:
            vector = self._data.get(key)
            if vector is not None:
                self._data.move_to_end(key)
            result.append(vector)
        return result

    async def set_many(self, items: dict[str, Vector]) -> None:
        for key, vector in items.items():
            self._data[key] = vector
            self._data.move_to_end(key)
        while len(self._data) > self._max_items:
            self._data.popitem(last=False)


class RedisEmbeddingCache:
    """Lưu vector dạng float32 nhị phân (1536 chiều ~ 6KB/vector), có TTL."""

    def __init__(self, redis: Redis, ttl_seconds: int = 30 * 24 * 3600) -> None:
        self._redis = redis
        self._ttl = ttl_seconds

    async def get_many(self, keys: Sequence[str]) -> list[Vector | None]:
        if not keys:
            return []
        raw = await self._redis.mget(keys)
        return [_decode(value) if value is not None else None for value in raw]

    async def set_many(self, items: dict[str, Vector]) -> None:
        if not items:
            return
        async with self._redis.pipeline(transaction=False) as pipe:
            for key, vector in items.items():
                pipe.set(key, array("f", vector).tobytes(), ex=self._ttl)
            await pipe.execute()


def _decode(raw: bytes) -> Vector:
    values = array("f")
    values.frombytes(raw)
    return values.tolist()
