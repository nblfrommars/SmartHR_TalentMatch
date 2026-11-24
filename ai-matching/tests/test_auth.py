"""Phân quyền theo header của api-gateway (X-User-Id, X-User-Role)."""

import httpx
import pytest

from app.core.config import Settings, get_settings
from app.core.container import build_container
from app.ingestion.events import CvEvent, JobEvent
from app.main import create_app
from tests.factories import cv_envelope, job_envelope, make_cv_profile, make_job_res

ALICE = "aaaaaaaa-0000-4000-8000-00000000a11c"
BOB = "bbbbbbbb-0000-4000-8000-0000000000b0"


def as_user(user_id: str, role: str) -> dict[str, str]:
    return {"X-User-Id": user_id, "X-User-Role": role}


@pytest.fixture
async def http():
    container = await build_container(
        Settings(
            qdrant_url=":memory:",
            embedding_provider="hashing",
            embedding_dimension=256,
            cv_searchable_default=True,
        )
    )
    await container.events.handle_job(
        JobEvent.model_validate(job_envelope("job.created", make_job_res("job-1")))
    )
    for user in (ALICE, BOB):
        await container.events.handle_cv(
            CvEvent.model_validate(cv_envelope("cv_profile.created", make_cv_profile(user)))
        )
    app = create_app()
    app.state.container = container
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
    await container.close()


async def recs(client, cv_id, headers):
    return await client.get("/ai/recommendations/jobs", params={"cvId": cv_id}, headers=headers)


async def test_user_sees_only_own_cv(http):
    assert (await recs(http, ALICE, as_user(ALICE, "USER"))).status_code == 200

    other = await recs(http, BOB, as_user(ALICE, "USER"))
    assert other.status_code == 403
    assert "không có quyền" in other.json()["detail"]


async def test_unknown_cv_of_someone_else_is_403_not_404(http):
    """Không để lộ CV nào tồn tại: CV lạ của người khác cũng trả 403."""
    assert (await recs(http, "khong-ton-tai", as_user(ALICE, "USER"))).status_code == 403
    # CV của chính mình nhưng chưa được index thì 404
    assert (await recs(http, "new-user", as_user("new-user", "USER"))).status_code == 404


async def test_admin_can_view_any_cv_and_hr_cannot_get_job_recommendations(http):
    assert (await recs(http, BOB, as_user("admin-1", "ADMIN"))).status_code == 200
    assert (await recs(http, BOB, as_user("hr-1", "HR"))).status_code == 403
    assert (await recs(http, ALICE, as_user(ALICE, ""))).status_code == 403  # không có vai trò


async def test_candidate_search_is_hr_or_admin_only(http):
    url, params = "/ai/search/candidates", {"jobId": "job-1"}
    assert (await http.get(url, params=params, headers=as_user("hr-1", "HR"))).status_code == 200
    assert (await http.get(url, params=params, headers=as_user("a", "ADMIN"))).status_code == 200
    user = await http.get(url, params=params, headers=as_user(ALICE, "USER"))
    assert user.status_code == 403


async def test_role_header_is_case_insensitive(http):
    assert (await recs(http, ALICE, as_user(ALICE, "user"))).status_code == 200


async def test_parse_cv_requires_user_or_admin(http):
    files = {"file": ("cv.pdf", b"%PDF-1.4", "application/pdf")}
    hr = await http.post("/ai/cv/parse", files=files, headers=as_user("hr-1", "HR"))
    assert hr.status_code == 403


async def test_internal_calls_without_headers_are_allowed_by_default(http):
    """application-service / user-cv gọi nội bộ trong mạng Docker, không qua gateway."""
    assert (await recs(http, BOB, {})).status_code == 200


async def test_require_identity_blocks_calls_without_headers(http, monkeypatch):
    monkeypatch.setenv("AI_REQUIRE_IDENTITY", "true")
    get_settings.cache_clear()
    try:
        response = await recs(http, BOB, {})
        assert response.status_code == 401
        assert (await recs(http, ALICE, as_user(ALICE, "USER"))).status_code == 200
    finally:
        get_settings.cache_clear()


async def test_empty_user_id_from_gateway_is_401_not_internal(http):
    """Gateway gắn X-User-Id rỗng khi token không có `sub`: không được coi là gọi nội bộ."""
    response = await recs(http, BOB, {"X-User-Id": "", "X-User-Role": ""})
    assert response.status_code == 401
    assert (await recs(http, BOB, {"X-User-Id": "  ", "X-User-Role": "ADMIN"})).status_code == 401


async def test_token_without_sub_through_gateway_is_401(http):
    """Token không có `sub`: gateway bỏ hẳn X-User-Id nhưng vẫn gắn X-User-Role (rỗng)."""
    assert (await recs(http, BOB, {"X-User-Role": ""})).status_code == 401
    assert (await recs(http, BOB, {"X-User-Role": "ADMIN"})).status_code == 401
