"""Xử lý event job.events / cv.events (ARCHITECTURE.md mục 3.4, 3.9), độc lập với Kafka.

Job event dùng đúng định dạng của job-service: `EventEnvelope` (common-lib) với `data` là `JobRes`.
Kafka consumer chỉ cần parse value của message thành `JobEvent` rồi gọi `EventHandler.handle_job`.

Handler idempotent: event đã xử lý (theo eventId) bị bỏ qua, vì Kafka giao "ít nhất một lần" nên
một event có thể đến nhiều lần. Event cũ đến muộn (data.version nhỏ hơn bản đang index) cũng bị bỏ.

CvEvent vẫn là bản nháp, chờ candidate-service chốt định dạng (dự kiến cũng dùng EventEnvelope).
"""

import logging
from enum import StrEnum
from typing import Protocol, Self

from pydantic import model_validator
from redis.asyncio import Redis

from app.ingestion.indexer import Indexer
from app.schemas import CvSnapshot, EventEnvelope, JobRes, JobStatus
from app.schemas.common import CamelModel

logger = logging.getLogger(__name__)


class JobEventType(StrEnum):
    """Giá trị `type` trong envelope, khớp JobEventType.java của job-service."""

    CREATED = "job.created"
    UPDATED = "job.updated"
    CLOSED = "job.closed"
    EXPIRED = "job.expired"
    DELETED = "job.deleted"


class CvEventType(StrEnum):
    SAVED = "saved"
    DELETED = "deleted"
    VISIBILITY_CHANGED = "visibility_changed"


class JobEvent(EventEnvelope[JobRes]):
    """Message trên topic `job.events`. Mọi loại event (kể cả deleted) đều kèm JobRes đầy đủ."""

    type: JobEventType

    @property
    def job_id(self) -> str:
        return self.data.id


class CvEvent(CamelModel):
    event_id: str
    type: CvEventType
    cv_id: str
    snapshot: CvSnapshot | None = None
    searchable: bool | None = None

    @model_validator(mode="after")
    def _check_fields(self) -> Self:
        if self.type == CvEventType.SAVED and self.snapshot is None:
            raise ValueError("cv.saved phải có snapshot")
        if self.type == CvEventType.VISIBILITY_CHANGED and self.searchable is None:
            raise ValueError("cv.visibility_changed phải có searchable")
        return self


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
    def __init__(self, redis: Redis, ttl_seconds: int = 7 * 24 * 3600) -> None:
        self._redis = redis
        self._ttl = ttl_seconds

    async def seen(self, event_id: str) -> bool:
        return bool(await self._redis.exists(f"evt:{event_id}"))

    async def mark(self, event_id: str) -> None:
        await self._redis.set(f"evt:{event_id}", 1, ex=self._ttl)


class EventHandler:
    def __init__(self, indexer: Indexer, processed: ProcessedEvents) -> None:
        self.indexer = indexer
        self.processed = processed

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

        match event.type:
            case CvEventType.SAVED:
                assert event.snapshot is not None
                await self.indexer.index_cvs([event.snapshot])
            case CvEventType.VISIBILITY_CHANGED:
                assert event.searchable is not None
                await self.indexer.set_cv_searchable(event.cv_id, event.searchable)
            case CvEventType.DELETED:
                # "Right to be forgotten": xóa hẳn khỏi Qdrant
                await self.indexer.delete_cv(event.cv_id)

        await self.processed.mark(event.event_id)
        logger.info("Đã xử lý cv.%s cv_id=%s", event.type, event.cv_id)
        return True
