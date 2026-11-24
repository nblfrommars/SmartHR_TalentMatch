"""Kafka consumer cho job.events (job-service) và cv.profile.events (user-cv).

Tách làm hai phần:
- `MessageProcessor`: xử lý MỘT message (parse -> EventHandler, retry, DLQ). Không phụ thuộc Kafka
  nên test được không cần broker.
- `KafkaEventConsumer`: vòng lặp đọc Kafka, gọi processor, commit offset.

Đảm bảo:
- "Ít nhất một lần": chỉ commit offset SAU khi xử lý xong (hoặc đã đẩy sang DLQ). Service chết giữa
  chừng thì message được đọc lại; EventHandler idempotent theo eventId nên không xử lý trùng.
- Thứ tự theo job/CV: key Kafka là jobId/userId nên mọi event của một job nằm cùng partition, và
  message trong một partition được xử lý tuần tự.
- Message sai định dạng (JSON hỏng, type lạ, dữ liệu sai) không thể sửa bằng cách thử lại: đẩy
  ngay sang DLQ "<topic>.dlq". Lỗi tạm thời (Qdrant/Redis/OpenAI lỗi) được thử lại
  `max_attempts` lần với backoff tăng dần, vẫn lỗi thì đẩy sang DLQ để không chặn cả partition.
- Kafka không kết nối được không làm sập service: API gợi ý vẫn chạy, consumer tự kết nối lại.
"""

import asyncio
import contextlib
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Protocol

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer, TopicPartition
from pydantic import ValidationError

from app.core.config import Settings
from app.core.logging import correlation_id_var
from app.ingestion.events import CvEvent, EventHandler, JobEvent

logger = logging.getLogger(__name__)

Headers = Sequence[tuple[str, bytes]]


class Outcome(StrEnum):
    PROCESSED = "processed"
    DUPLICATE = "duplicate"  # eventId đã xử lý trước đó
    DEAD_LETTER = "dead_letter"  # đã đẩy sang DLQ


class DeadLetterSink(Protocol):
    async def send(
        self, topic: str, key: bytes | None, value: bytes, headers: Headers, reason: str
    ) -> None: ...


@dataclass
class DeadLetter:
    topic: str
    key: bytes | None
    value: bytes
    reason: str


@dataclass
class InMemoryDeadLetterSink:
    """Dùng cho test."""

    items: list[DeadLetter] = field(default_factory=list)

    async def send(
        self, topic: str, key: bytes | None, value: bytes, headers: Headers, reason: str
    ) -> None:
        self.items.append(DeadLetter(topic, key, value, reason))


class KafkaDeadLetterSink:
    """Đẩy message lỗi sang "<topic><suffix>", giữ nguyên key/value, thêm header lý do lỗi."""

    def __init__(self, producer: AIOKafkaProducer, suffix: str) -> None:
        self._producer = producer
        self._suffix = suffix

    async def send(
        self, topic: str, key: bytes | None, value: bytes, headers: Headers, reason: str
    ) -> None:
        extra = [
            ("dlq-reason", reason[:1000].encode()),
            ("dlq-original-topic", topic.encode()),
        ]
        await self._producer.send_and_wait(
            topic + self._suffix, value=value, key=key, headers=[*headers, *extra]
        )


class MessageProcessor:
    def __init__(
        self,
        handler: EventHandler,
        dead_letters: DeadLetterSink,
        job_topic: str,
        cv_topic: str,
        max_attempts: int = 3,
        backoff_seconds: float = 0.5,
    ) -> None:
        self.handler = handler
        self.dead_letters = dead_letters
        self.job_topic = job_topic
        self.cv_topic = cv_topic
        self.max_attempts = max(1, max_attempts)
        self.backoff_seconds = backoff_seconds

    async def process(
        self, topic: str, key: bytes | None, value: bytes | None, headers: Headers = ()
    ) -> Outcome:
        # 1. Parse: sai định dạng thì thử lại cũng vô ích -> DLQ ngay
        try:
            event = self._parse(topic, value)
        except (ValidationError, ValueError) as exc:
            reason = f"Message sai định dạng: {_short(exc)}"
            logger.warning("%s (topic=%s, key=%s) -> DLQ", reason, topic, _key(key))
            await self.dead_letters.send(topic, key, value or b"", headers, reason)
            return Outcome.DEAD_LETTER

        token = correlation_id_var.set(event.correlation_id or event.event_id)
        try:
            return await self._handle_with_retry(topic, key, value or b"", headers, event)
        finally:
            correlation_id_var.reset(token)

    def _parse(self, topic: str, value: bytes | None) -> JobEvent | CvEvent:
        if not value:
            raise ValueError("value rỗng")
        if topic == self.job_topic:
            return JobEvent.model_validate_json(value)
        if topic == self.cv_topic:
            return CvEvent.model_validate_json(value)
        raise ValueError(f"topic không được hỗ trợ: {topic}")

    async def _handle_with_retry(
        self, topic: str, key: bytes | None, value: bytes, headers: Headers, event
    ) -> Outcome:
        for attempt in range(1, self.max_attempts + 1):
            try:
                if isinstance(event, JobEvent):
                    processed = await self.handler.handle_job(event)
                else:
                    processed = await self.handler.handle_cv(event)
                return Outcome.PROCESSED if processed else Outcome.DUPLICATE
            except Exception as exc:  # lỗi tạm thời: Qdrant, Redis, OpenAI...
                if attempt == self.max_attempts:
                    reason = f"Lỗi sau {attempt} lần thử: {_short(exc)}"
                    logger.exception("%s (event %s) -> DLQ", reason, event.event_id)
                    await self.dead_letters.send(topic, key, value, headers, reason)
                    return Outcome.DEAD_LETTER
                delay = self.backoff_seconds * 2 ** (attempt - 1)
                logger.warning(
                    "Lỗi xử lý event %s (lần %d/%d): %s. Thử lại sau %.1fs",
                    event.event_id,
                    attempt,
                    self.max_attempts,
                    _short(exc),
                    delay,
                )
                await asyncio.sleep(delay)
        raise AssertionError("unreachable")


class KafkaEventConsumer:
    """Vòng lặp đọc Kafka chạy nền trong lifespan của FastAPI."""

    RECONNECT_SECONDS = 5.0
    # aiokafka tự thử lại khi mất kết nối và không báo lỗi ra ngoài, nên định kỳ hỏi metadata
    # của cluster để biết thật sự còn kết nối không (hiển thị ở /health)
    LIVENESS_INTERVAL_SECONDS = 10.0
    LIVENESS_TIMEOUT_SECONDS = 5.0

    def __init__(self, settings: Settings, handler: EventHandler) -> None:
        self.settings = settings
        self.handler = handler
        self.topics = [settings.kafka_job_topic, settings.kafka_cv_topic]
        self._task: asyncio.Task[None] | None = None
        self.connected = False
        self.last_error: str | None = None
        self.stats: dict[str, int] = {o.value: 0 for o in Outcome}

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run_forever(), name="kafka-consumer")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    def status(self) -> dict[str, object]:
        return {
            "enabled": True,
            "connected": self.connected,
            "topics": self.topics,
            "lastError": self.last_error,
            "stats": dict(self.stats),
        }

    async def _run_forever(self) -> None:
        while True:
            try:
                await self._run_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.connected = False
                self.last_error = _short(exc)
                logger.warning(
                    "Kafka consumer lỗi: %s. Kết nối lại sau %.0fs",
                    self.last_error,
                    self.RECONNECT_SECONDS,
                )
                await asyncio.sleep(self.RECONNECT_SECONDS)

    async def _run_once(self) -> None:
        s = self.settings
        consumer = AIOKafkaConsumer(
            *self.topics,
            bootstrap_servers=s.kafka_bootstrap_servers,
            group_id=s.kafka_group_id,
            enable_auto_commit=False,  # tự commit sau khi xử lý xong
            auto_offset_reset="earliest",  # group mới: đọc từ đầu để không sót job/CV cũ
        )
        producer = AIOKafkaProducer(bootstrap_servers=s.kafka_bootstrap_servers)
        await producer.start()
        try:
            await consumer.start()
            try:
                processor = MessageProcessor(
                    self.handler,
                    KafkaDeadLetterSink(producer, s.kafka_dlq_suffix),
                    job_topic=s.kafka_job_topic,
                    cv_topic=s.kafka_cv_topic,
                    max_attempts=s.kafka_max_attempts,
                    backoff_seconds=s.kafka_retry_backoff_seconds,
                )
                self.connected = True
                self.last_error = None
                logger.info("Kafka consumer đã kết nối, nghe %s", ", ".join(self.topics))
                await self._loop(consumer, processor)
            finally:
                self.connected = False
                await consumer.stop()
        finally:
            await producer.stop()

    async def _check_liveness(self, consumer: AIOKafkaConsumer) -> None:
        try:
            await asyncio.wait_for(consumer.topics(), self.LIVENESS_TIMEOUT_SECONDS)
        except Exception as exc:
            if self.connected:
                logger.warning("Mất kết nối Kafka: %s. Đang chờ kết nối lại", _short(exc))
            self.connected = False
            self.last_error = f"Mất kết nối Kafka: {_short(exc)}"
        else:
            if not self.connected:
                logger.info("Kafka đã kết nối lại")
            self.connected = True
            self.last_error = None

    async def _loop(self, consumer: AIOKafkaConsumer, processor: MessageProcessor) -> None:
        loop = asyncio.get_running_loop()
        next_check = loop.time() + self.LIVENESS_INTERVAL_SECONDS
        while True:
            if loop.time() >= next_check:
                await self._check_liveness(consumer)
                next_check = loop.time() + self.LIVENESS_INTERVAL_SECONDS
            batches = await consumer.getmany(timeout_ms=1000, max_records=100)
            for tp, messages in batches.items():
                for msg in messages:
                    try:
                        outcome = await processor.process(
                            msg.topic, msg.key, msg.value, list(msg.headers or [])
                        )
                    except Exception:
                        # Không xử lý được và cũng không đẩy được sang DLQ (Kafka lỗi):
                        # đọc lại từ message này ở vòng sau, không commit
                        consumer.seek(TopicPartition(tp.topic, tp.partition), msg.offset)
                        raise
                    self.stats[outcome.value] += 1
                    await consumer.commit({tp: msg.offset + 1})


def _short(exc: BaseException) -> str:
    text = str(exc).replace("\n", " ")
    return f"{type(exc).__name__}: {text[:300]}"


def _key(key: bytes | None) -> str:
    return key.decode(errors="replace") if key else "-"
