"""Kiểm thử toàn bộ quy trình: snapshot -> index Qdrant -> API gợi ý.

Gồm bộ Constraint Compliance (ARCHITECTURE.md mục 3.11.4), bắt buộc đạt 100%:
không gợi ý job quá hạn, job đã đóng, job đã apply, job thiếu skill must_have;
HR không thấy CV không cho phép tìm kiếm.
"""

import httpx
import pytest

from app.core.config import Settings
from app.core.container import build_container
from app.main import create_app
from tests.factories import (
    cv_envelope,
    iso,
    job_envelope,
    make_cv,
    make_cv_profile,
    make_job,
    make_job_res,
)

GOOD = "job-good"


@pytest.fixture
async def setup():
    container = await build_container(
        Settings(qdrant_url=":memory:", embedding_provider="hashing", embedding_dimension=256)
    )
    jobs = [
        make_job(GOOD),
        make_job("job-good-2", title="Java Backend Engineer", companyId="company-2"),
        make_job("job-expired", deadline=iso(-1)),
        make_job("job-closed", status="CLOSED"),
        make_job("job-applied", companyId="company-3"),
        make_job("job-must-have", mustHaveSkills=["golang"], companyId="company-4"),
        make_job(
            "job-low-skill",
            title="Senior Java Developer",
            requiredSkills=["java", "golang", "rust", "scala", "erlang"],
            companyId="company-5",
        ),
        make_job("job-hcm", location="Hồ Chí Minh", companyId="company-6"),
        make_job("job-negotiable", salaryMin=None, salaryMax=None, companyId="company-7"),
        make_job(
            "job-accountant",
            title="Kế toán tổng hợp",
            description="Lập báo cáo tài chính, kê khai thuế.",
            industry="Finance",
            level="JUNIOR",
            requiredSkills=["excel", "misa"],
            niceToHaveSkills=[],
            companyId="company-8",
        ),
        # Cùng một công ty đăng nhiều tin gần giống nhau
        *[make_job(f"job-spam-{i}", companyId="company-spam") for i in range(5)],
    ]
    await container.indexer.index_jobs(jobs)
    await container.indexer.index_cvs(
        [
            make_cv("cv-1"),
            make_cv("cv-hidden", searchable=False),
            make_cv(
                "cv-accountant",
                headline="Kế toán viên",
                level="JUNIOR",
                skills=[{"name": "excel"}, {"name": "misa"}],
            ),
        ]
    )

    app = create_app()
    app.state.container = container  # ASGITransport không chạy lifespan
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
    await container.close()


async def recommend(client, **params) -> list[dict]:
    response = await client.get("/ai/recommendations/jobs", params={"cvId": "cv-1", **params})
    assert response.status_code == 200, response.text
    return response.json()["items"]


async def test_recommendation_response_shape(setup):
    response = await setup.get("/ai/recommendations/jobs", params={"cvId": "cv-1"})
    body = response.json()
    assert body["cvIsThin"] is False
    assert body["notice"] is None
    items = body["items"]
    top = items[0]

    assert set(top) == {"jobId", "score", "isFallback", "breakdown", "explanation", "job"}
    assert not any(i["isFallback"] for i in items)
    assert set(top["breakdown"]) == {"hybrid", "skill", "level", "exp", "salary", "recency"}
    assert top["explanation"]["matchSummary"].startswith("Bạn có 4/4 kỹ năng bắt buộc")
    assert top["job"]["title"]
    assert [i["score"] for i in items] == sorted((i["score"] for i in items), reverse=True)


async def test_constraint_compliance(setup):
    ids = {i["jobId"] for i in await recommend(setup, excludeJobIds=["job-applied"], limit=50)}

    assert GOOD in ids
    assert "job-expired" not in ids
    assert "job-closed" not in ids
    assert "job-applied" not in ids
    assert "job-must-have" not in ids
    assert "job-low-skill" not in ids  # thiếu > 70% skill bắt buộc
    assert "job-accountant" not in ids  # dưới ngưỡng tau


async def test_diversification_max_three_per_company(setup):
    items = await recommend(setup, limit=50)
    spam = [i for i in items if i["job"]["company_id"] == "company-spam"]
    assert len(spam) == 3


async def test_user_filters(setup):
    hcm = {i["jobId"] for i in await recommend(setup, location="Hồ Chí Minh")}
    assert hcm == {"job-hcm"}

    rich = {i["jobId"] for i in await recommend(setup, salaryMin=45_000_000, limit=50)}
    assert "job-negotiable" in rich  # lương thỏa thuận vẫn được giữ
    assert GOOD in rich

    too_rich = {i["jobId"] for i in await recommend(setup, salaryMin=100_000_000, limit=50)}
    assert too_rich == {"job-negotiable"}


async def test_closing_a_job_removes_it_from_recommendations(setup):
    container = setup._transport.app.state.container
    from app.schemas import JobStatus

    await container.indexer.set_job_status(GOOD, JobStatus.CLOSED)
    assert GOOD not in {i["jobId"] for i in await recommend(setup, limit=50)}


async def test_unknown_cv_returns_404(setup):
    response = await setup.get("/ai/recommendations/jobs", params={"cvId": "nope"})
    assert response.status_code == 404


async def test_invalid_params_return_422(setup):
    response = await setup.get("/ai/recommendations/jobs", params={"cvId": "cv-1", "limit": 0})
    assert response.status_code == 422


async def test_reverse_matching_for_hr(setup):
    response = await setup.get("/ai/search/candidates", params={"jobId": GOOD})
    assert response.status_code == 200
    items = response.json()["items"]
    ids = [i["cvId"] for i in items]

    assert ids == ["cv-1"]  # cv-hidden không searchable, cv-accountant không đủ skill
    assert items[0]["explanation"]["matchSummary"].startswith("Ứng viên có 4/4")
    assert "user_id" in items[0]["candidate"]


async def test_reverse_matching_filters(setup):
    response = await setup.get(
        "/ai/search/candidates", params={"jobId": GOOD, "location": "Đà Nẵng"}
    )
    assert response.json()["items"] == []
    response = await setup.get("/ai/search/candidates", params={"jobId": "nope"})
    assert response.status_code == 404


def test_internal_api_is_disabled_by_default():
    from fastapi.testclient import TestClient

    with TestClient(create_app()) as client:
        response = client.post("/ai/internal/events/job", json={})
    assert response.status_code == 404


def test_internal_api_end_to_end(monkeypatch):
    """Chạy qua lifespan thật: event HTTP -> index -> gợi ý -> đóng job -> hết gợi ý."""
    from fastapi.testclient import TestClient

    from app.core.config import get_settings

    monkeypatch.setenv("AI_INTERNAL_API_ENABLED", "true")
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as client:
            job = make_job_res(GOOD)
            created = job_envelope("job.created", job, event_id="e1")

            assert client.post("/ai/internal/events/job", json=created).json()["processed"]
            assert not client.post("/ai/internal/events/job", json=created).json()["processed"]
            cv = cv_envelope("cv_profile.created", make_cv_profile("cv-1"), event_id="e2")
            assert client.post("/ai/internal/events/cv", json=cv).json()["processed"]

            items = client.get("/ai/recommendations/jobs", params={"cvId": "cv-1"}).json()["items"]
            assert [i["jobId"] for i in items] == [GOOD]

            closed = job_envelope(
                "job.closed", {**job, "status": "CLOSED", "version": 1}, event_id="e3"
            )
            client.post("/ai/internal/events/job", json=closed)
            items = client.get("/ai/recommendations/jobs", params={"cvId": "cv-1"}).json()["items"]
            assert items == []

            bad = client.post(
                "/ai/internal/events/job", json={"eventId": "e4", "type": "job.created"}
            )
            assert bad.status_code == 422
    finally:
        get_settings.cache_clear()
