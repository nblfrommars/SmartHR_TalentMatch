"""Kafka consumer: xử lý message (parse, retry, DLQ), commit offset, tự kết nối lại.

Phần cần broker thật nằm ở scripts kiểm thử thủ công; ở đây giả lập Kafka để chạy trong CI.
"""

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from aiokafka import TopicPartition

from app.core.config import Settings
from app.core.container import Container, build_container
from app.core.logging import correlation_id_var
from app.ingestion.consumer import (
    InMemoryDeadLetterSink,
    KafkaEventConsumer,
    MessageProcessor,
    Outcome,
)
from app.main import create_app
from app.vectorstore import Kind
from tests.factories import USER_ID, cv_envelope, job_envelope, make_cv_profile, make_job_res

JOB_TOPIC, CV_TOPIC = "job.events", "cv.profile.events"


def encode(message: dict) -> bytes:
    return json.dumps(message, ensure_ascii=False).encode()


@pytest.fixture
async def container():
    c = await build_container(
        Settings(qdrant_url=":memory:", embedding_provider="hashing", embedding_dimension=256)
    )
    yield c
    await c.close()


@pytest.fixture
def dlq() -> InMemoryDeadLetterSink:
    return InMemoryDeadLetterSink()


@pytest.fixture
def processor(container: Container, dlq) -> MessageProcessor:
    return MessageProcessor(
        container.events, dlq, JOB_TOPIC, CV_TOPIC, max_attempts=3, backoff_seconds=0
    )


# ---------- MessageProcessor ----------


async def test_job_and_cv_messages_are_indexed(processor, container, dlq):
    job = encode(job_envelope("job.created", make_job_res("job-1")))
    cv = encode(cv_envelope("cv_profile.created", make_cv_profile()))

    assert await processor.process(JOB_TOPIC, b"job-1", job) is Outcome.PROCESSED
    assert await processor.process(CV_TOPIC, USER_ID.encode(), cv) is Outcome.PROCESSED
    assert await processor.process(JOB_TOPIC, b"job-1", job) is Outcome.DUPLICATE  # giao lại

    assert await container.store.get(Kind.JOB, "job-1") is not None
    assert await container.store.get(Kind.CV, USER_ID) is not None
    assert dlq.items == []


@pytest.mark.parametrize(
    ("topic", "value", "reason"),
    [
        (JOB_TOPIC, b"{not json", "sai định dạng"),
        (JOB_TOPIC, b"", "rỗng"),
        (JOB_TOPIC, None, "rỗng"),
        (JOB_TOPIC, encode(job_envelope("job.archived", make_job_res())), "sai định dạng"),
        (CV_TOPIC, encode(cv_envelope("cv_profile.deleted", make_cv_profile())), "sai định dạng"),
        (JOB_TOPIC, encode(cv_envelope("cv_profile.created", make_cv_profile())), "sai định dạng"),
        ("other.topic", encode(job_envelope("job.created", make_job_res())), "không được hỗ trợ"),
    ],
)
async def test_bad_messages_go_straight_to_dlq(processor, container, dlq, topic, value, reason):
    assert await processor.process(topic, b"k", value) is Outcome.DEAD_LETTER

    assert len(dlq.items) == 1
    assert dlq.items[0].topic == topic and dlq.items[0].key == b"k"
    assert reason in dlq.items[0].reason
    assert await container.store.count(Kind.JOB) == 0


async def test_transient_error_is_retried(processor, container, dlq):
    calls = 0
    real = container.indexer.index_jobs

    async def flaky(jobs):
        nonlocal calls
        calls += 1
        if calls < 3:
            raise ConnectionError("Qdrant tạm thời không phản hồi")
        await real(jobs)

    container.indexer.index_jobs = flaky
    value = encode(job_envelope("job.created", make_job_res("job-1")))

    assert await processor.process(JOB_TOPIC, b"job-1", value) is Outcome.PROCESSED
    assert calls == 3
    assert dlq.items == []
    assert await container.store.get(Kind.JOB, "job-1") is not None


async def test_persistent_error_goes_to_dlq_after_max_attempts(processor, container, dlq):
    calls = 0

    async def broken(jobs):
        nonlocal calls
        calls += 1
        raise ConnectionError("Qdrant chết")

    container.indexer.index_jobs = broken
    value = encode(job_envelope("job.created", make_job_res("job-1")))

    assert await processor.process(JOB_TOPIC, b"job-1", value) is Outcome.DEAD_LETTER
    assert calls == 3
    assert dlq.items[0].value == value  # giữ nguyên message gốc để xử lý lại sau
    assert "sau 3 lần thử" in dlq.items[0].reason and "Qdrant chết" in dlq.items[0].reason

    # Event chưa được đánh dấu đã xử lý: đẩy lại từ DLQ khi Qdrant sống lại vẫn chạy được
    assert not await container.events.processed.seen(json.loads(value)["eventId"])


async def test_correlation_id_from_envelope_is_used_in_logs(processor, container):
    seen = []
    real = container.indexer.index_jobs

    async def spy(jobs):
        seen.append(correlation_id_var.get())
        await real(jobs)

    container.indexer.index_jobs = spy
    message = {**job_envelope("job.created", make_job_res()), "correlationId": "corr-from-hr"}
    await processor.process(JOB_TOPIC, b"job-1", encode(message))

    assert seen == ["corr-from-hr"]
    assert correlation_id_var.get() == "-"  # trả lại sau khi xử lý xong


# ---------- Vòng lặp consumer: commit offset ----------


class FakeKafkaConsumer:
    """Giả AIOKafkaConsumer: trả các batch cho trước rồi dừng."""

    def __init__(self, batches):
        self.batches = list(batches)
        self.commits: list[dict] = []
        self.seeks: list[tuple] = []

    async def getmany(self, timeout_ms, max_records):
        if not self.batches:
            raise asyncio.CancelledError
        return self.batches.pop(0)

    async def commit(self, offsets):
        self.commits.append(offsets)

    def seek(self, tp, offset):
        self.seeks.append((tp, offset))

    async def topics(self):
        if self.broker_down:
            raise ConnectionError("broker không phản hồi")
        return {JOB_TOPIC, CV_TOPIC}

    broker_down = False


def message(topic, offset, value):
    return SimpleNamespace(topic=topic, offset=offset, key=b"k", value=value, headers=[])


async def test_commits_after_each_message(processor, container):
    tp = TopicPartition(JOB_TOPIC, 0)
    good = encode(job_envelope("job.created", make_job_res("job-1")))
    fake = FakeKafkaConsumer([{tp: [message(JOB_TOPIC, 10, good), message(JOB_TOPIC, 11, b"x")]}])
    consumer = KafkaEventConsumer(Settings(kafka_enabled=True), container.events)

    with pytest.raises(asyncio.CancelledError):
        await consumer._loop(fake, processor)

    # Message lỗi định dạng đã vào DLQ nên cũng được commit, không chặn partition
    assert fake.commits == [{tp: 11}, {tp: 12}]
    assert consumer.stats == {"processed": 1, "duplicate": 0, "dead_letter": 1}


async def test_no_commit_when_dlq_unreachable(container):
    class BrokenSink:
        async def send(self, *args, **kwargs):
            raise ConnectionError("Kafka mất kết nối, không đẩy được DLQ")

    processor = MessageProcessor(container.events, BrokenSink(), JOB_TOPIC, CV_TOPIC)
    tp = TopicPartition(JOB_TOPIC, 2)
    fake = FakeKafkaConsumer([{tp: [message(JOB_TOPIC, 7, b"{bad")]}])
    consumer = KafkaEventConsumer(Settings(kafka_enabled=True), container.events)

    with pytest.raises(ConnectionError):
        await consumer._loop(fake, processor)

    assert fake.commits == []  # không commit: lần kết nối sau đọc lại message này
    assert fake.seeks == [(tp, 7)]


# ---------- Kafka không kết nối được ----------


async def test_unreachable_kafka_does_not_crash_service(monkeypatch):
    monkeypatch.setattr(KafkaEventConsumer, "RECONNECT_SECONDS", 0.05)
    container = await build_container(
        Settings(
            qdrant_url=":memory:",
            embedding_provider="hashing",
            embedding_dimension=64,
            kafka_enabled=True,
            kafka_bootstrap_servers="127.0.0.1:1",  # không có broker
        )
    )
    app = create_app()
    app.state.container = container
    container.consumer.start()
    try:
        for _ in range(100):
            if container.consumer.last_error:
                break
            await asyncio.sleep(0.05)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            body = (await client.get("/health")).json()
            # API vẫn phục vụ bình thường
            assert (await client.get("/ai/recommendations/jobs?cvId=x")).status_code == 404

        assert body["status"] == "ok"
        assert body["kafka"]["enabled"] is True
        assert body["kafka"]["connected"] is False
        assert body["kafka"]["lastError"]
    finally:
        await container.close()  # dừng consumer gọn gàng, không treo


def test_health_reports_kafka_disabled_by_default():
    from fastapi.testclient import TestClient

    with TestClient(create_app()) as client:
        assert client.get("/health").json()["kafka"] == {"enabled": False}


async def test_liveness_check_reports_lost_and_restored_connection(container):
    consumer = KafkaEventConsumer(Settings(kafka_enabled=True), container.events)
    fake = FakeKafkaConsumer([])
    consumer.connected = True

    fake.broker_down = True
    await consumer._check_liveness(fake)
    assert consumer.connected is False
    assert "Mất kết nối Kafka" in consumer.last_error

    fake.broker_down = False
    await consumer._check_liveness(fake)
    assert consumer.connected is True and consumer.last_error is None


async def test_processed_events_are_scoped_per_index():
    """Dựng index mới (collection khác) từ Kafka không bị coi là trùng dù chung Redis."""
    from fakeredis import FakeAsyncRedis

    from app.ingestion.events import RedisProcessedEvents

    redis = FakeAsyncRedis()
    old_index = RedisProcessedEvents(redis, namespace="jobs+candidates")
    new_index = RedisProcessedEvents(redis, namespace="jobs_v2+candidates_v2")

    await old_index.mark("e1")
    assert await old_index.seen("e1") is True
    assert await new_index.seen("e1") is False
