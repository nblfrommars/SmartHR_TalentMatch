"""CV sinh viên / mới ra trường: dự án, chuyên ngành, và cơ chế bù gợi ý cho CV sơ sài."""

import httpx
import pytest

from app.core.config import Settings
from app.core.container import build_container
from app.documents import build_cv_document
from app.main import create_app
from tests.factories import iso, make_cv, make_job


def student_cv(cv_id: str, **overrides):
    data = {
        "headline": "Sinh viên năm cuối ngành Công nghệ thông tin",
        "level": "INTERN",
        "yearsExperience": 0,
        "skills": [{"name": "Java"}],
        "education": [{"school": "HUST", "degree": "Kỹ sư", "major": "Công nghệ thông tin"}],
        "desired": {},
    }
    data.update(overrides)
    return make_cv(cv_id, **data)


PROJECTS = [
    {
        "name": "Website bán sách",
        "role": "Backend",
        "technologies": ["SpringBoot", "Postgres", "Docker"],
        "summary": "Xây dựng REST API, liên hệ sv@hust.edu.vn",
    }
]


# ---------- Document ----------


def test_projects_go_into_dense_text():
    doc = build_cv_document(student_cv("s", projects=PROJECTS))

    assert (
        "Projects:\n- Website bán sách (Backend) [spring boot, postgresql, docker]: "
        "Xây dựng REST API" in doc.dense_text
    )
    assert "sv@hust.edu.vn" not in doc.dense_text


def test_project_technologies_count_as_skills():
    payload = build_cv_document(student_cv("s", projects=PROJECTS)).payload

    assert payload["skills"] == ["java", "spring boot", "postgresql", "docker"]
    assert payload["project_skills"] == ["spring boot", "postgresql", "docker"]


def test_sparse_has_project_skills_and_major_once():
    tokens = build_cv_document(
        student_cv("s", projects=PROJECTS, skills=[{"name": "Java"}, {"name": "Docker"}])
    ).sparse_text.split()

    assert {"spring_boot", "postgresql", "công_nghệ", "thông_tin"} <= set(tokens)
    assert tokens.count("docker") == 1  # skill tự khai trùng công nghệ dự án: không đếm 2 lần


# ---------- Gợi ý end-to-end ----------


@pytest.fixture
async def client():
    container = await build_container(
        Settings(qdrant_url=":memory:", embedding_provider="hashing", embedding_dimension=256)
    )
    await container.indexer.index_jobs(
        [
            make_job("job-java", level="JUNIOR", minYearsExp=0, publishedAt=iso(-10)),
            make_job(
                "job-intern",
                title="Thực tập sinh Java",
                level="INTERN",
                minYearsExp=0,
                requiredSkills=["java", "spring boot"],
                companyId="c-intern",
                publishedAt=iso(-5),
            ),
            make_job(
                "job-newest",
                title="Kế toán",
                description="Lập báo cáo tài chính",
                requiredSkills=["excel"],
                level="FRESHER",
                companyId="c-newest",
                publishedAt=iso(-0.1),
            ),
            make_job("job-expired", deadline=iso(-1), companyId="c-exp", publishedAt=iso(0)),
            make_job("job-closed", status="CLOSED", companyId="c-closed", publishedAt=iso(0)),
            make_job("job-must", mustHaveSkills=["golang"], companyId="c-must", publishedAt=iso(0)),
            make_job("job-applied", companyId="c-applied"),
            *[make_job(f"job-spam-{i}", companyId="c-spam") for i in range(5)],
        ]
    )
    await container.indexer.index_cvs(
        [
            student_cv("thin"),
            student_cv("with-projects", projects=PROJECTS),
        ]
    )
    app = create_app()
    app.state.container = container
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as http:
        yield http, container
    await container.close()


async def get(http, cv_id, **params):
    response = await http.get(
        "/ai/recommendations/jobs", params={"cvId": cv_id, "limit": 50, **params}
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_thin_cv_gets_fallback_with_notice(client):
    http, _ = client
    body = await get(http, "thin")

    assert body["cvIsThin"] is True
    assert "bổ sung" in body["notice"]
    assert body["items"], "CV sơ sài vẫn phải có gợi ý"
    assert all(i["isFallback"] for i in body["items"] if i["score"] < 0.35)


async def test_fallback_still_respects_constraints(client):
    http, _ = client
    items = (await get(http, "thin", excludeJobIds=["job-applied"]))["items"]
    ids = [i["jobId"] for i in items]

    for forbidden in ["job-expired", "job-closed", "job-must", "job-applied"]:
        assert forbidden not in ids
    assert len([i for i in ids if i.startswith("job-spam")]) <= 3
    assert len(ids) == len(set(ids))


async def test_strict_matches_come_before_fallback(client):
    http, _ = client
    items = (await get(http, "thin"))["items"]
    flags = [i["isFallback"] for i in items]

    assert flags == sorted(flags)  # mọi False (khớp chặt) đứng trước True (bù)


async def test_projects_make_cv_not_thin_and_match_strictly(client):
    http, _ = client
    body = await get(http, "with-projects")

    assert body["cvIsThin"] is False
    ids = {i["jobId"] for i in body["items"]}
    assert "job-intern" in ids  # java (tự khai) + spring boot (từ dự án)
    assert not any(i["isFallback"] for i in body["items"])


async def test_newest_jobs_fill_when_hybrid_returns_few(client):
    http, container = client
    # Ép hybrid chỉ trả 1 job để kiểm tra nhánh "job mới đăng nhất"
    container.recommender.config = container.recommender.config.model_copy(
        update={"prefetch_limit": 1, "fusion_limit": 1}
    )
    items = (await get(http, "thin", limit=5))["items"]
    assert len(items) == 5  # 1 job từ hybrid, phần còn lại bù từ job mới đăng
    assert sum(i["isFallback"] for i in items) >= 4

    everything = [i["jobId"] for i in (await get(http, "thin"))["items"]]
    # Job mới đăng nhưng không khớp gì (kế toán) vẫn được bù, nhưng xếp sau job hợp hơn
    assert everything[-1] == "job-newest"
    for forbidden in ["job-expired", "job-closed", "job-must"]:
        assert forbidden not in everything


async def test_normal_cv_never_gets_fallback(client):
    http, container = client
    await container.indexer.index_cvs([make_cv("senior")])  # 5 skill: không sơ sài
    body = await get(http, "senior")

    assert body["cvIsThin"] is False
    assert body["notice"] is None
    assert not any(i["isFallback"] for i in body["items"])
    assert "job-newest" not in {i["jobId"] for i in body["items"]}
