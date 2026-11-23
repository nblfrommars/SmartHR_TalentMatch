"""Xử lý event job.events / cv.events (ARCHITECTURE.md mục 3.4, 3.9), độc lập với Kafka.

Job event dùng đúng định dạng của job-service: `EventEnvelope` (common-lib) với `data` là `JobRes`.
Kafka consumer chỉ cần parse value của message thành `JobEvent` rồi gọi `EventHandler.handle_job`.

Handler idempotent: event đã xử lý (theo eventId) bị bỏ qua, vì Kafka giao "ít nhất một lần" nên
một event có thể đến nhiều lần. Event cũ đến muộn (data.version nhỏ hơn bản đang index) cũng bị bỏ.

CV event dùng đúng định dạng của user-cv: `EventEnvelope` với `data` là `CvProfileData`
(topic `cv.profile.events`, key = userId).
"""

import logging
from enum import StrEnum
from typing import Protocol

from redis.asyncio import Redis

from app.ingestion.indexer import Indexer
from app.schemas import CvProfileData, EventEnvelope, JobRes, JobStatus

logger = logging.getLogger(__name__)


class JobEventType(StrEnum):
    """Giá trị `type` trong envelope, khớp JobEventType.java của job-service."""

    CREATED = "job.created"
    UPDATED = "job.updated"
    CLOSED = "job.closed"
    EXPIRED = "job.expired"
    DELETED = "job.deleted"


class CvEventType(StrEnum):
    """Giá trị `type` trong envelope, khớp CVProfileEventType.java của user-cv."""

    CREATED = "cv_profile.created"
    UPDATED = "cv_profile.updated"


class JobEvent(EventEnvelope[JobRes]):
    """Message trên topic `job.events`. Mọi loại event (kể cả deleted) đều kèm JobRes đầy đủ."""

    type: JobEventType

    @property
    def job_id(self) -> str:
        return self.data.id


class CvEvent(EventEnvelope[CvProfileData]):
    """Message trên topic `cv.profile.events`. created/updated đều kèm CV profile đầy đủ."""

    type: CvEventType

    @property
    def cv_id(self) -> str:
        return self.data.user_id


class ProcessedEvents(Protocol):
    async def seen(self, event_id: str) -> bool: ...

    async def mark(self, event_id: str) -> None: ...


class InMemoryProcessedEvents:
    def __init__(self) -> None:
        self._ids: set[str] = set()

    async def seen(self, event_id: str) -> bool:
        return event_id in self._ids

    async def mark(self, event_id: str) -> None:
        self._ids.add(event_id)


class RedisProcessedEvents:
    """Lưu eventId đã xử lý trong Redis (TTL 7 ngày).

    `namespace` gắn với bộ collection Qdrant đang ghi vào: "đã xử lý" nghĩa là đã áp dụng vào
    ĐÚNG index này. Dựng lại index mới (collection khác, reindex) từ Kafka thì không bị coi là
    trùng, dù dùng chung Redis.
    """

    def __init__(self, redis: Redis, ttl_seconds: int = 7 * 24 * 3600, namespace: str = "") -> None:
        self._redis = redis
        self._ttl = ttl_seconds
        self._prefix = f"evt:{namespace}:" if namespace else "evt:"

    async def seen(self, event_id: str) -> bool:
        return bool(await self._redis.exists(self._prefix + event_id))

    async def mark(self, event_id: str) -> None:
        await self._redis.set(self._prefix + event_id, 1, ex=self._ttl)


class EventHandler:
    def __init__(
        self, indexer: Indexer, processed: ProcessedEvents, cv_searchable_default: bool = False
    ) -> None:
        self.indexer = indexer
        self.processed = processed
        # user-cv chưa có cờ "cho phép HR tìm kiếm" nên dùng giá trị cấu hình cho mọi CV
        self.cv_searchable_default = cv_searchable_default

    async def handle_job(self, event: JobEvent) -> bool:
        """Trả về False nếu event đã xử lý trước đó (bị bỏ qua)."""
        if await self.processed.seen(event.event_id):
            logger.info("Bỏ qua event trùng %s", event.event_id)
            return False

        if event.type == JobEventType.DELETED:
            await self.indexer.delete_job(event.job_id)
        else:
            snapshot = event.data.to_snapshot()
            if event.type == JobEventType.EXPIRED:
                # job-service đã đặt CLOSED khi hết hạn; ép lại cho chắc nếu thứ tự cập nhật lệch
                snapshot = snapshot.model_copy(update={"status": JobStatus.CLOSED})
            if await self._is_stale(snapshot.job_id, snapshot.version):
                logger.info(
                    "Bỏ qua %s job_id=%s: version %s cũ hơn bản đã index",
                    event.type,
                    event.job_id,
                    snapshot.version,
                )
            else:
                # created/updated/closed/expired đều gửi JobRes đầy đủ nên upsert lại cả job.
                # Văn bản không đổi thì embedding lấy từ cache, không gọi lại OpenAI.
                await self.indexer.index_jobs([snapshot])

        await self.processed.mark(event.event_id)
        logger.info("Đã xử lý %s job_id=%s", event.type, event.job_id)
        return True

    async def _is_stale(self, job_id: str, version: int | None) -> bool:
        if version is None:
            return False
        current = await self.indexer.job_version(job_id)
        return current is not None and current > version

    async def handle_cv(self, event: CvEvent) -> bool:
        if await self.processed.seen(event.event_id):
            logger.info("Bỏ qua event trùng %s", event.event_id)
            return False

        # created và updated đều gửi CV đầy đủ nên upsert lại toàn bộ
        snapshot = event.data.to_snapshot(
            updated_at=event.occurred_at, searchable=self.cv_searchable_default
        )
        await self.indexer.index_cvs([snapshot])

        await self.processed.mark(event.event_id)
        logger.info("Đã xử lý %s cv_id=%s", event.type, event.cv_id)
        return True
