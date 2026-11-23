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
from tests.factories import USER_ID, cv_envelope, job_envelope, make_cv_profile, make_job_res


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


def job_event(type_: str, job_id: str = "job-1", **fields) -> JobEvent:
    """type_ ngắn ("created") -> envelope thật ("job.created") kèm JobRes đầy đủ."""
    return JobEvent.model_validate(job_envelope(f"job.{type_}", make_job_res(job_id, **fields)))


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
    # skill mustHave cũng là skill bắt buộc
    assert set(point.payload["required_skills"]) == {"java", "spring boot", "postgresql", "kafka"}
    assert point.payload["must_have_skills"] == ["java"]
    assert point.payload["nice_skills"] == ["kubernetes"]
    assert len(point.dense) == 64
    assert point.sparse.indices

    await events.handle_job(job_event("updated", salaryMax=60_000_000, version=1))
    assert (await store.get(Kind.JOB, "job-1")).payload["salary_max"] == 60_000_000

    await events.handle_job(job_event("closed", status="CLOSED", version=2))
    closed = await store.get(Kind.JOB, "job-1")
    assert closed.payload["status"] == "CLOSED"
    assert closed.payload["salary_max"] == 50_000_000  # closed gửi JobRes đầy đủ, ghi đè cả job

    await events.handle_job(job_event("deleted", status="CLOSED", version=2))
    assert await store.get(Kind.JOB, "job-1") is None


async def test_expired_marks_closed(container: Container):
    await container.events.handle_job(job_event("created"))
    # Kể cả khi data còn ghi OPEN, job.expired vẫn phải làm job biến khỏi gợi ý
    await container.events.handle_job(job_event("expired", status="OPEN", version=1))
    assert (await container.store.get(Kind.JOB, "job-1")).payload["status"] == "CLOSED"


async def test_stale_event_is_ignored(container: Container):
    """Event cũ đến muộn (version nhỏ hơn) không được ghi đè bản mới hơn."""
    events, store = container.events, container.store
    await events.handle_job(job_event("closed", status="CLOSED", version=3))

    assert await events.handle_job(job_event("updated", status="OPEN", version=2)) is True
    assert (await store.get(Kind.JOB, "job-1")).payload["status"] == "CLOSED"

    await events.handle_job(job_event("updated", status="OPEN", version=4))
    assert (await store.get(Kind.JOB, "job-1")).payload["status"] == "OPEN"


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
    await container.events.handle_job(job_event("updated", salaryMin=35_000_000, version=1))
    assert len(inner.texts) == 1  # lần 2 lấy từ cache

    await container.events.handle_job(
        job_event("updated", title="Principal Java Engineer", version=2)
    )
    assert len(inner.texts) == 2  # nội dung đổi thì embed lại


def test_job_event_validation():
    with pytest.raises(ValidationError, match="data"):
        JobEvent.model_validate({"eventId": "e", "type": "job.created"})
    with pytest.raises(ValidationError):  # type không thuộc JobEventType
        JobEvent.model_validate(job_envelope("job.archived", make_job_res()))
    with pytest.raises(ValidationError):  # type kiểu bản nháp cũ (thiếu tiền tố "job.")
        JobEvent.model_validate(job_envelope("created", make_job_res()))


# ---------- CV events ----------


async def test_cv_lifecycle(container: Container):
    store, events = container.store, container.events

    created = CvEvent.model_validate(cv_envelope("cv_profile.created", make_cv_profile()))
    assert await events.handle_cv(created) is True
    assert await events.handle_cv(created) is False  # giao lại: bỏ qua
    point = await store.get(Kind.CV, USER_ID)
    assert point.payload["cv_id"] == point.payload["user_id"] == USER_ID
    assert point.payload["years_experience"] == 4
    assert point.payload["searchable"] is False  # mặc định bảo vệ dữ liệu cá nhân

    updated = make_cv_profile(skills=[{"skill": "Golang", "yearsOfExperience": 1}])
    await events.handle_cv(CvEvent.model_validate(cv_envelope("cv_profile.updated", updated)))
    point = await store.get(Kind.CV, USER_ID)
    assert point.payload["skills"] == ["golang"]
    assert await store.count(Kind.CV) == 1  # một User một CV: ghi đè, không tạo thêm


async def test_cv_searchable_default_from_config():
    c = await build_container(
        Settings(
            qdrant_url=":memory:",
            embedding_provider="hashing",
            embedding_dimension=64,
            cv_searchable_default=True,
        )
    )
    try:
        event = CvEvent.model_validate(cv_envelope("cv_profile.created", make_cv_profile()))
        await c.events.handle_cv(event)
        assert (await c.store.get(Kind.CV, USER_ID)).payload["searchable"] is True
    finally:
        await c.close()


def test_cv_event_validation():
    with pytest.raises(ValidationError, match="data"):
        CvEvent.model_validate({"eventId": "e", "type": "cv_profile.created"})
    with pytest.raises(ValidationError):  # type kiểu bản nháp cũ
        CvEvent.model_validate(cv_envelope("cv.saved", make_cv_profile()))
    with pytest.raises(ValidationError):  # eduLevel ngoài 0..7
        CvEvent.model_validate(cv_envelope("cv_profile.created", make_cv_profile(eduLevel=9)))


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
