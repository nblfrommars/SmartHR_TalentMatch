"""Xử lý event job.events / cv.events (ARCHITECTURE.md mục 3.4, 3.9), độc lập với Kafka.

Kafka consumer (khi nhóm chốt xong event envelope) chỉ cần đọc message, map sang JobEvent /
CvEvent rồi gọi EventHandler.handle_*. Handler idempotent: event đã xử lý (theo event_id) bị bỏ
qua, vì Kafka giao "ít nhất một lần" nên một event có thể đến nhiều lần.
"""

import logging
from enum import StrEnum
from typing import Protocol, Self

from pydantic import model_validator
from redis.asyncio import Redis

from app.ingestion.indexer import Indexer
from app.schemas import CvSnapshot, JobSnapshot, JobStatus
from app.schemas.common import CamelModel

logger = logging.getLogger(__name__)


class JobEventType(StrEnum):
    CREATED = "created"
    UPDATED = "updated"
    CLOSED = "closed"
    EXPIRED = "expired"
    DELETED = "deleted"


class CvEventType(StrEnum):
    SAVED = "saved"
    DELETED = "deleted"
    VISIBILITY_CHANGED = "visibility_changed"


class JobEvent(CamelModel):
    event_id: str
    type: JobEventType
    job_id: str
    snapshot: JobSnapshot | None = None

    @model_validator(mode="after")
    def _snapshot_required(self) -> Self:
        if self.type in (JobEventType.CREATED, JobEventType.UPDATED) and self.snapshot is None:
            raise ValueError(f"job.{self.type} phải có snapshot")
        return self


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

        match event.type:
            case JobEventType.CREATED | JobEventType.UPDATED:
                assert event.snapshot is not None
                await self.indexer.index_jobs([event.snapshot])
            case JobEventType.CLOSED | JobEventType.EXPIRED:
                # Giữ point lại (phục vụ đánh giá/thống kê), chỉ đổi trạng thái
                await self.indexer.set_job_status(event.job_id, JobStatus.CLOSED)
            case JobEventType.DELETED:
                await self.indexer.delete_job(event.job_id)

        await self.processed.mark(event.event_id)
        logger.info("Đã xử lý job.%s job_id=%s", event.type, event.job_id)
        return True

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
