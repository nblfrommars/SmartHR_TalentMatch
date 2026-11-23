"""API match-score: điểm của một cặp CV - job (application-service lưu khi User apply)."""

import httpx
import pytest

from app.core.config import Settings
from app.core.container import build_container
from app.ingestion.events import CvEvent, JobEvent
from app.main import create_app
from tests.factories import USER_ID, cv_envelope, job_envelope, make_cv_profile, make_job_res


@pytest.fixture
async def http():
    container = await build_container(
        Settings(qdrant_url=":memory:", embedding_provider="hashing", embedding_dimension=256)
    )
    jobs = [
        make_job_res("job-java"),
        make_job_res(
            "job-acct",
            title="Kế toán",
            description="Lập báo cáo thuế",
            skills=[{"skill": "Excel", "mustHave": True, "required": True}],
        ),
    ]
    for j in jobs:
        await container.events.handle_job(JobEvent.model_validate(job_envelope("job.created", j)))
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


async def score(client, job_id, headers=None, cv_id=USER_ID):
    return await client.get(
        "/ai/match-score", params={"cvId": cv_id, "jobId": job_id}, headers=headers or {}
    )


async def test_good_pair(http):
    client, _ = http
    body = (await score(client, "job-java")).json()

    assert body["cvId"] == USER_ID and body["jobId"] == "job-java"
    assert body["passed"] is True
    assert 0.7 < body["score"] <= 1
    assert body["explanationForCandidate"]["matchSummary"].startswith("Bạn có 4/4")
    assert body["explanationForRecruiter"]["matchSummary"].startswith("Ứng viên có 4/4")
    assert 0 <= body["breakdown"]["hybrid"] <= 1


async def test_bad_pair_still_scored_but_not_passed(http):
    client, _ = http
    body = (await score(client, "job-acct")).json()

    assert body["passed"] is False  # thiếu must_have excel
    assert body["score"] < 0.5
    assert body["explanationForRecruiter"]["missingSkills"] == ["excel"]


async def test_score_matches_recommendation_ranking_order(http):
    client, _ = http
    good = (await score(client, "job-java")).json()["score"]
    bad = (await score(client, "job-acct")).json()["score"]
    assert good > bad


async def test_not_indexed_is_404(http):
    client, _ = http
    assert (await score(client, "job-x")).status_code == 404
    assert (await score(client, "job-java", cv_id="cv-x")).status_code == 404


async def test_permissions(http):
    client, _ = http
    assert (await score(client, "job-java", {"X-User-Id": "hr", "X-User-Role": "HR"})).is_success
    own = {"X-User-Id": USER_ID, "X-User-Role": "USER"}
    assert (await score(client, "job-java", own)).is_success
    other = {"X-User-Id": "someone-else", "X-User-Role": "USER"}
    assert (await score(client, "job-java", other)).status_code == 403
