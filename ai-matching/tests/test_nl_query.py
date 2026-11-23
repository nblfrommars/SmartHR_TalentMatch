"""HR tìm ứng viên bằng câu hỏi tự do (bộ phân tích LLM giả, không gọi mạng)."""

import httpx
import pytest

from app.core.config import Settings
from app.core.container import build_container
from app.ingestion.events import CvEvent
from app.main import create_app
from app.retrieval.nl_query import ParsedQuery
from tests.factories import cv_envelope, make_cv, make_cv_profile

HR = {"X-User-Id": "hr-1", "X-User-Role": "HR"}


class FakeQueryParser:
    def __init__(self, result: ParsedQuery | Exception):
        self.result = result
        self.queries: list[str] = []

    async def parse(self, query: str) -> ParsedQuery:
        self.queries.append(query)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


JAVA_HN = ParsedQuery(
    semantic_text="Lập trình viên backend Java",
    skills=["Java", "Kafka"],
    must_have_skills=["Kafka"],
    locations=["Hà Nội"],
    min_years=3,
)


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
    # CV có địa điểm (dạng cũ) và CV từ user-cv (chưa có địa điểm)
    await container.indexer.index_cvs(
        [
            make_cv("cv-hn", location="Hà Nội", searchable=True),
            make_cv("cv-hcm", location="Hồ Chí Minh", searchable=True),
            make_cv("cv-junior", location="Hà Nội", yearsExperience=1, searchable=True),
            make_cv("cv-hidden", location="Hà Nội", searchable=False),
        ]
    )
    for user_id, skills in [
        ("cv-usercv", [{"skill": "Java", "yearsOfExperience": 4}, {"skill": "Kafka"}]),
        ("cv-no-kafka", [{"skill": "Java", "yearsOfExperience": 5}]),
    ]:
        await container.events.handle_cv(
            CvEvent.model_validate(
                cv_envelope("cv_profile.created", make_cv_profile(user_id, skills=skills))
            )
        )
    app = create_app()
    app.state.container = container
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, container
    await container.close()


async def search(client, query="Java dev biết Kafka ở Hà Nội, 3 năm trở lên", headers=HR):
    return await client.post("/ai/search/candidates/query", json={"query": query}, headers=headers)


async def test_finds_matching_candidates(http):
    client, container = http
    container.query_parser = FakeQueryParser(JAVA_HN)
    body = (await search(client)).json()
    ids = {i["cvId"] for i in body["items"]}

    assert "cv-hn" in ids
    assert "cv-usercv" in ids  # chưa có địa điểm: vẫn được giữ
    assert "cv-hcm" not in ids  # địa điểm khác
    assert "cv-junior" not in ids  # 1 năm < 3 năm
    assert "cv-hidden" not in ids  # không cho phép tìm kiếm
    assert "cv-no-kafka" not in ids  # thiếu kỹ năng bắt buộc
    assert body["interpreted"]["skills"] == ["java", "kafka"]  # đã chuẩn hóa
    assert body["interpreted"]["mustHaveSkills"] == ["kafka"]


async def test_query_passed_to_parser_as_is(http):
    client, container = http
    parser = FakeQueryParser(JAVA_HN)
    container.query_parser = parser
    await search(client, query="Java dev ở Hà Nội")
    assert parser.queries == ["Java dev ở Hà Nội"]


async def test_permissions_and_validation(http):
    client, container = http
    container.query_parser = FakeQueryParser(JAVA_HN)
    user = {"X-User-Id": "u1", "X-User-Role": "USER"}
    assert (await search(client, headers=user)).status_code == 403
    assert (await search(client, query="x")).status_code == 422  # quá ngắn
    assert (await search(client, query="x" * 301)).status_code == 422  # quá dài


async def test_no_openai_key_is_503(http):
    client, container = http
    container.query_parser = None
    assert (await search(client)).status_code == 503


async def test_llm_error_is_502(http):
    client, container = http
    container.query_parser = FakeQueryParser(RuntimeError("OpenAI lỗi"))
    assert (await search(client)).status_code == 502


def test_ground_fixes_must_have_and_drops_invented_values():
    from app.retrieval.nl_query import ground

    parsed = ParsedQuery(
        semantic_text="thực tập sinh frontend",
        skills=["React", "TypeScript", "Vue"],  # "Vue" không có trong câu
        must_have_skills=["biết TypeScript"],
        locations=["TP.HCM", "Hà Nội"],  # "Hà Nội" không có trong câu
    )
    out = ground(parsed, "Cần thực tập sinh frontend React ở TP.HCM, bắt buộc biết TypeScript")

    assert out.skills == ["React", "TypeScript"]
    assert out.must_have_skills == ["TypeScript"]
    assert out.locations == ["TP.HCM"]


def test_must_have_only_when_query_says_so():
    from app.retrieval.nl_query import ground

    parsed = ParsedQuery(skills=["Java", "Kafka"], must_have_skills=["Java"])
    assert ground(parsed, "Java dev biết Kafka ở Hà Nội").must_have_skills == []
    assert ground(parsed, "Java dev, bắt buộc Java").must_have_skills == ["Java"]
