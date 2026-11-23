"""Giải thích bằng LLM: viết lại câu tóm tắt, lỗi/chậm thì quay về template, có cache.

Dùng client OpenAI giả, không gọi mạng.
"""

import asyncio
from types import SimpleNamespace

import httpx
import pytest

from app.core.config import Settings
from app.core.container import build_container
from app.explain.llm import ExplainFacts, LlmExplainer, LlmExplanation, facts_for
from app.explain.template import Explanation
from app.ingestion.events import CvEvent, JobEvent
from app.main import create_app
from app.retrieval.scoring import Breakdown
from tests.factories import USER_ID, cv_envelope, job_envelope, make_cv_profile, make_job_res


class FakeOpenAI:
    """Giả client.chat.completions.parse."""

    def __init__(self, reply=None, delay=0.0, error=None):
        self.calls: list[list[dict]] = []
        self.reply = reply or LlmExplanation(
            match_summary="Bạn rất hợp với vị trí này nhờ Java và Spring Boot.",
            suggestion="Học thêm Kafka để nổi bật hơn.",
        )
        self.delay = delay
        self.error = error
        self.chat = SimpleNamespace(completions=SimpleNamespace(parse=self._parse))

    async def _parse(self, **kwargs):
        self.calls.append(kwargs["messages"])
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.error:
            raise self.error
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(parsed=self.reply))]
        )


TEMPLATE = Explanation(
    match_summary="Bạn có 2/3 kỹ năng bắt buộc (java, spring boot). Còn thiếu: kafka.",
    matched_skills=["java", "spring boot"],
    missing_skills=["kafka"],
    nice_to_have_matched=[],
    suggestion="Bổ sung kinh nghiệm hoặc dự án có dùng kafka.",
)
BREAKDOWN = Breakdown(hybrid=0.9, skill=0.67, level=1.0, exp=1.0, salary=1.0, recency=0.9)


def facts(audience="candidate", **overrides) -> ExplainFacts:
    f = facts_for(audience, TEMPLATE, BREAKDOWN, {"title": "Java Backend"}, {"headline": "Dev"})
    return f.model_copy(update=overrides)


async def test_rewrites_summary_and_keeps_skill_lists():
    client = FakeOpenAI()
    [out] = await LlmExplainer(client).rewrite([(TEMPLATE, facts())])

    assert out.source == "llm"
    assert out.match_summary == "Bạn rất hợp với vị trí này nhờ Java và Spring Boot."
    assert out.suggestion == "Học thêm Kafka để nổi bật hơn."
    assert (out.matched_skills, out.missing_skills) == (["java", "spring boot"], ["kafka"])


async def test_llm_only_sees_precomputed_facts():
    client = FakeOpenAI()
    await LlmExplainer(client).rewrite([(TEMPLATE, facts())])
    user_message = client.calls[0][1]["content"]

    assert '"matched_skills":["java","spring boot"]' in user_message
    assert '"level_fit":"phù hợp"' in user_message
    # Không có văn bản CV, email hay SĐT: chỉ có các trường của ExplainFacts
    assert set(ExplainFacts.model_validate_json(user_message).model_dump()) == set(
        ExplainFacts.model_fields
    )


@pytest.mark.parametrize(
    "client",
    [
        FakeOpenAI(delay=1.0),  # chậm hơn timeout
        FakeOpenAI(error=RuntimeError("429 hết hạn mức")),
        FakeOpenAI(reply=LlmExplanation(match_summary="   ")),  # rỗng
        FakeOpenAI(reply=LlmExplanation(match_summary="x" * 1000)),  # dài bất thường
    ],
)
async def test_falls_back_to_template(client):
    [out] = await LlmExplainer(client, timeout_seconds=0.1).rewrite([(TEMPLATE, facts())])
    assert out == TEMPLATE


async def test_cache_avoids_repeated_calls_for_same_facts():
    client = FakeOpenAI()
    explainer = LlmExplainer(client)
    await explainer.rewrite([(TEMPLATE, facts())])
    await explainer.rewrite([(TEMPLATE, facts())])
    assert len(client.calls) == 1

    await explainer.rewrite([(TEMPLATE, facts(missing_skills=["rust"]))])
    assert len(client.calls) == 2  # dữ kiện khác -> gọi lại


async def test_only_top_k_are_rewritten_in_parallel():
    client = FakeOpenAI(delay=0.2)
    explainer = LlmExplainer(client, top_k=3, timeout_seconds=1)
    items = [(TEMPLATE, facts(job_title=f"Job {i}")) for i in range(6)]

    loop = asyncio.get_running_loop()
    start = loop.time()
    out = await explainer.rewrite(items)
    elapsed = loop.time() - start

    assert [o.source for o in out] == ["llm"] * 3 + ["template"] * 3
    assert elapsed < 0.5  # 3 lời gọi chạy song song, không phải 0.6s nối tiếp


async def test_recruiter_explanation_has_no_suggestion():
    [out] = await LlmExplainer(FakeOpenAI()).rewrite([(TEMPLATE, facts("recruiter"))])
    assert out.source == "llm" and out.suggestion is None


# ---------- Qua API ----------


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


async def test_api_uses_llm_explanations_when_enabled(http):
    client, container = http
    container.explainer = LlmExplainer(FakeOpenAI())

    rec = (await client.get("/ai/recommendations/jobs", params={"cvId": USER_ID})).json()
    assert rec["items"][0]["explanation"]["source"] == "llm"
    assert rec["items"][0]["explanation"]["matchedSkills"]  # vẫn do code tính

    cand = (await client.get("/ai/search/candidates", params={"jobId": "job-1"})).json()
    assert cand["items"][0]["explanation"]["source"] == "llm"


async def test_api_template_when_disabled(http):
    client, _ = http
    rec = (await client.get("/ai/recommendations/jobs", params={"cvId": USER_ID})).json()
    assert rec["items"][0]["explanation"]["source"] == "template"


async def test_container_builds_explainer_only_when_enabled_with_key():
    base = {"qdrant_url": ":memory:", "embedding_provider": "hashing", "embedding_dimension": 8}
    for kwargs, expected in [
        ({"llm_explanations": True}, False),  # không có key
        ({"llm_explanations": False, "openai_api_key": "sk-test"}, False),
        ({"llm_explanations": True, "openai_api_key": "sk-test"}, True),
    ]:
        c = await build_container(Settings(**base, **kwargs))
        try:
            assert (c.explainer is not None) is expected
        finally:
            await c.close()
