"""Cache kết quả gợi ý trong Redis (ARCHITECTURE.md mục 3.5: rec:cvId, TTL 10 phút).

Vô hiệu hóa bằng "thế hệ" (generation) thay vì tìm và xóa từng key:
- Bất kỳ job nào thay đổi -> tăng thế hệ chung: mọi kết quả cũ không còn được đọc tới.
- Một CV thay đổi -> tăng thế hệ của riêng CV đó.
Key cũ tự hết hạn theo TTL. Redis lỗi thì coi như không có cache (API vẫn tính bình thường).
"""

import hashlib
import json
import logging
from typing import Any

from redis.asyncio import Redis

logger = logging.getLogger(__name__)


class RecommendationCache:
    def __init__(self, redis: Redis, ttl_seconds: int = 600, namespace: str = "") -> None:
        self._redis = redis
        self._ttl = ttl_seconds
        self._prefix = f"rec:{namespace}:" if namespace else "rec:"

    def _gen_all(self) -> str:
        return self._prefix + "gen"

    def _gen_cv(self, cv_id: str) -> str:
        return f"{self._prefix}gen:cv:{cv_id}"

    async def _key(self, cv_id: str, params: dict[str, Any]) -> str:
        gen_all, gen_cv = await self._redis.mget(self._gen_all(), self._gen_cv(cv_id))
        digest = hashlib.sha256(
            json.dumps(params, sort_keys=True, default=str).encode()
        ).hexdigest()[:16]
        return f"{self._prefix}{cv_id}:{_int(gen_all)}:{_int(gen_cv)}:{digest}"

    async def get(self, cv_id: str, params: dict[str, Any]) -> dict[str, Any] | None:
        try:
            raw = await self._redis.get(await self._key(cv_id, params))
            return json.loads(raw) if raw else None
        except Exception as exc:
            logger.warning("Đọc cache gợi ý lỗi, tính lại: %s", exc)
            return None

    async def set(self, cv_id: str, params: dict[str, Any], value: dict[str, Any]) -> None:
        try:
            await self._redis.set(
                await self._key(cv_id, params), json.dumps(value, ensure_ascii=False), ex=self._ttl
            )
        except Exception as exc:
            logger.warning("Ghi cache gợi ý lỗi: %s", exc)

    async def invalidate_all(self) -> None:
        """Gọi khi có job thay đổi (thêm/sửa/đóng/xóa)."""
        try:
            await self._redis.incr(self._gen_all())
        except Exception as exc:
            logger.warning("Không vô hiệu được cache gợi ý: %s", exc)

    async def invalidate_cv(self, cv_id: str) -> None:
        """Gọi khi CV thay đổi."""
        try:
            await self._redis.incr(self._gen_cv(cv_id))
        except Exception as exc:
            logger.warning("Không vô hiệu được cache gợi ý của CV %s: %s", cv_id, exc)


def _int(value: bytes | str | None) -> int:
    return int(value) if value else 0
