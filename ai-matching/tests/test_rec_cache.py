"""Cache kết quả gợi ý trong Redis: HIT/MISS, vô hiệu khi job/CV thay đổi, Redis lỗi vẫn chạy."""

import httpx
import pytest
from fakeredis import FakeAsyncRedis

from app.core.config import Settings
from app.core.container import build_container
from app.ingestion.events import CvEvent, JobEvent
from app.main import create_app
from app.retrieval.cache import RecommendationCache
from tests.factories import USER_ID, cv_envelope, job_envelope, make_cv_profile, make_job_res


@pytest.fixture
async def http():
    container = await build_container(
        Settings(qdrant_url=":memory:", embedding_provider="hashing", embedding_dimension=256)
    )
    cache = RecommendationCache(FakeAsyncRedis(), ttl_seconds=600, namespace="t")
    container.rec_cache = cache
    container.events.rec_cache = cache
    await job(container, "job-1")
    await container.events.handle_cv(
        CvEvent.model_validate(cv_envelope("cv_profile.created", make_cv_profile()))
    )
    app = create_app()
    app.state.container = container
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, container
    await container.close()


async def job(container, job_id, type_="job.created", **fields):
    await container.events.handle_job(
        JobEvent.model_validate(job_envelope(type_, make_job_res(job_id, **fields)))
    )


async def recs(client, **params):
    r = await client.get("/ai/recommendations/jobs", params={"cvId": USER_ID, **params})
    assert r.status_code == 200
    return r.headers.get("X-Cache"), [i["jobId"] for i in r.json()["items"]], r.json()


async def test_second_call_is_served_from_cache(http):
    client, _ = http
    first = await recs(client)
    second = await recs(client)

    assert (first[0], second[0]) == ("MISS", "HIT")
    assert first[2] == second[2]  # nội dung giống hệt


async def test_different_filters_are_cached_separately(http):
    client, _ = http
    await recs(client)
    assert (await recs(client, limit=3))[0] == "MISS"
    assert (await recs(client, excludeJobIds=["job-1"]))[1] == []


async def test_new_or_closed_job_invalidates_cache(http):
    client, container = http
    await recs(client)
    await job(container, "job-2", companyId="company-2")

    status, ids, _ = await recs(client)
    assert status == "MISS" and "job-2" in ids

    await job(container, "job-2", "job.closed", companyId="company-2", status="CLOSED", version=1)
    status, ids, _ = await recs(client)
    assert status == "MISS" and "job-2" not in ids


async def test_cv_update_invalidates_only_that_cv(http):
    client, container = http
    await recs(client)
    updated = make_cv_profile(skills=[{"skill": "Excel", "yearsOfExperience": 3}])
    await container.events.handle_cv(
        CvEvent.model_validate(cv_envelope("cv_profile.updated", updated))
    )
    status, ids, _ = await recs(client)
    assert status == "MISS" and ids == []  # CV kế toán không còn hợp job Java


async def test_permission_checked_before_cache(http):
    """Cache không được trở thành đường vòng qua kiểm tra quyền."""
    client, _ = http
    await recs(client)  # đã có trong cache
    r = await client.get(
        "/ai/recommendations/jobs",
        params={"cvId": USER_ID},
        headers={"X-User-Id": "someone-else", "X-User-Role": "USER"},
    )
    assert r.status_code == 403


async def test_broken_redis_falls_back_to_computing(http):
    client, container = http

    class BrokenRedis:
        async def mget(self, *a):
            raise ConnectionError("Redis chết")

        async def incr(self, *a):
            raise ConnectionError("Redis chết")

    broken = RecommendationCache(BrokenRedis(), namespace="t")  # type: ignore[arg-type]
    container.rec_cache = broken
    container.events.rec_cache = broken

    status, ids, _ = await recs(client)
    assert ids == ["job-1"]  # vẫn trả kết quả
    await job(container, "job-3", companyId="c3")  # vô hiệu cache lỗi cũng không làm hỏng event
    assert "job-3" in (await recs(client))[1]


async def test_no_cache_without_redis():
    container = await build_container(
        Settings(qdrant_url=":memory:", embedding_provider="hashing", embedding_cache="memory")
    )
    try:
        assert container.rec_cache is None
    finally:
        await container.close()
