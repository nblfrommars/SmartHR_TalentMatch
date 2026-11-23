import uuid

import pytest
from fakeredis import FakeAsyncRedis
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.core.container import Container, build_container
from app.embedding import CachedDenseEmbedder, HashingEmbedder, InMemoryEmbeddingCache
from app.ingestion.events import CvEvent, JobEvent, RedisProcessedEvents
from app.vectorstore import Kind, point_id
from tests.factories import make_cv, make_job


class CountingEmbedder(HashingEmbedder):
    def __init__(self, dimension: int):
        super().__init__(dimension)
        self.texts: list[str] = []

    async def embed(self, texts):
        self.texts.extend(texts)
        return await super().embed(texts)


@pytest.fixture
async def container():
    c = await build_container(
        Settings(qdrant_url=":memory:", embedding_provider="hashing", embedding_dimension=64)
    )
    yield c
    await c.close()


def job_event(type_: str, job_id: str = "job-1", **snapshot) -> JobEvent:
    data = {"eventId": str(uuid.uuid4()), "type": type_, "jobId": job_id}
    if type_ in ("created", "updated"):
        data["snapshot"] = make_job(job_id, **snapshot).model_dump(by_alias=True)
    return JobEvent.model_validate(data)


# ---------- Store ----------


def test_point_id_keeps_uuid_and_hashes_others():
    raw = "0b8e3c4e-6a55-4b5e-9a0b-6c1e5d0f3a21"
    assert point_id(raw) == raw
    assert point_id("42") == point_id("42") != point_id("43")
    uuid.UUID(point_id("42"))


async def test_ensure_collections_is_idempotent(container: Container):
    await container.store.ensure_collections()
    assert await container.qdrant.collection_exists("jobs")
    assert await container.qdrant.collection_exists("candidates")


async def test_set_payload_on_missing_point_is_noop(container: Container):
    await container.store.set_payload(Kind.JOB, "not-there", {"status": "CLOSED"})
    assert await container.store.count(Kind.JOB) == 0


# ---------- Job events: toàn bộ vòng đời ----------


async def test_job_lifecycle(container: Container):
    store, events = container.store, container.events

    assert await events.handle_job(job_event("created"))
    point = await store.get(Kind.JOB, "job-1")
    assert point is not None
    assert point.payload["status"] == "OPEN"
    assert point.payload["required_skills"] == ["java", "spring boot", "postgresql", "kafka"]
    assert len(point.dense) == 64
    assert point.sparse.indices

    await events.handle_job(job_event("updated", salaryMax=60_000_000))
    assert (await store.get(Kind.JOB, "job-1")).payload["salary_max"] == 60_000_000

    await events.handle_job(job_event("closed"))
    closed = await store.get(Kind.JOB, "job-1")
    assert closed.payload["status"] == "CLOSED"
    assert closed.payload["job_id"] == "job-1"  # các field khác giữ nguyên

    await events.handle_job(job_event("deleted"))
    assert await store.get(Kind.JOB, "job-1") is None


async def test_expired_marks_closed(container: Container):
    await container.events.handle_job(job_event("created"))
    await container.events.handle_job(job_event("expired"))
    assert (await container.store.get(Kind.JOB, "job-1")).payload["status"] == "CLOSED"


async def test_duplicate_event_is_skipped(container: Container):
    event = job_event("created")
    assert await container.events.handle_job(event) is True
    await container.events.handle_job(job_event("deleted"))

    # Event created cũ bị giao lại: không được làm job sống lại
    assert await container.events.handle_job(event) is False
    assert await container.store.get(Kind.JOB, "job-1") is None


async def test_metadata_only_update_does_not_re_embed(container: Container):
    inner = CountingEmbedder(64)
    container.indexer.dense = CachedDenseEmbedder(inner, InMemoryEmbeddingCache())

    await container.events.handle_job(job_event("created"))
    await container.events.handle_job(job_event("updated", salaryMin=35_000_000))
    assert len(inner.texts) == 1  # lần 2 lấy từ cache

    await container.events.handle_job(job_event("updated", title="Principal Java Engineer"))
    assert len(inner.texts) == 2  # nội dung đổi thì embed lại


def test_job_event_requires_snapshot_for_upserts():
    with pytest.raises(ValidationError, match="snapshot"):
        JobEvent.model_validate({"eventId": "e", "type": "created", "jobId": "j"})
    with pytest.raises(ValidationError):
        JobEvent.model_validate({"eventId": "e", "type": "archived", "jobId": "j"})


# ---------- CV events ----------


async def test_cv_lifecycle(container: Container):
    store, events = container.store, container.events
    snapshot = make_cv("cv-1", searchable=False).model_dump(by_alias=True)

    await events.handle_cv(
        CvEvent.model_validate(
            {"eventId": "e1", "type": "saved", "cvId": "cv-1", "snapshot": snapshot}
        )
    )
    assert (await store.get(Kind.CV, "cv-1")).payload["searchable"] is False

    await events.handle_cv(
        CvEvent.model_validate(
            {"eventId": "e2", "type": "visibility_changed", "cvId": "cv-1", "searchable": True}
        )
    )
    assert (await store.get(Kind.CV, "cv-1")).payload["searchable"] is True

    await events.handle_cv(
        CvEvent.model_validate({"eventId": "e3", "type": "deleted", "cvId": "cv-1"})
    )
    assert await store.get(Kind.CV, "cv-1") is None


def test_cv_event_validation():
    with pytest.raises(ValidationError, match="snapshot"):
        CvEvent.model_validate({"eventId": "e", "type": "saved", "cvId": "c"})
    with pytest.raises(ValidationError, match="searchable"):
        CvEvent.model_validate({"eventId": "e", "type": "visibility_changed", "cvId": "c"})


async def test_redis_processed_events():
    processed = RedisProcessedEvents(FakeAsyncRedis(), ttl_seconds=60)
    assert await processed.seen("e1") is False
    await processed.mark("e1")
    assert await processed.seen("e1") is True


# ---------- App lifecycle ----------


def test_app_startup_creates_collections():
    from app.main import app

    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        container: Container = app.state.container
        assert container.store.collection(Kind.JOB) == "jobs"
