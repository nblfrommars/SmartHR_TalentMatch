"""Viết lại giải thích bằng LLM (gpt-4o-mini) cho tự nhiên hơn (ARCHITECTURE.md mục 3.7).

An toàn theo thiết kế:
- LLM CHỈ nhận các dữ kiện đã tính sẵn (kỹ năng khớp/thiếu, mức phù hợp cấp bậc, kinh nghiệm,
  lương), KHÔNG nhận văn bản CV: không có PII, không có chỗ cho prompt injection, và không bịa
  được kỹ năng ngoài danh sách đưa vào.
- matched_skills / missing_skills vẫn do code tính; LLM chỉ viết lại câu tóm tắt và gợi ý.
- Gọi song song cho top-K kết quả, có timeout. Lỗi / chậm / output lạ -> giữ bản template.
- Cache theo nội dung dữ kiện (Redis hoặc RAM), nên các cặp có dữ kiện giống nhau dùng lại.
"""

import asyncio
import hashlib
import json
import logging
from collections import OrderedDict
from collections.abc import Sequence
from typing import Any, Literal

from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from redis.asyncio import Redis

from app.explain.template import Explanation
from app.retrieval.scoring import Breakdown

logger = logging.getLogger(__name__)

PROMPT_VERSION = "v1"
MAX_SUMMARY_CHARS = 400

SYSTEM_PROMPT = """\
Bạn viết lời giải thích NGẮN (1-2 câu, tiếng Việt, giọng thân thiện, chuyên nghiệp) cho một kết \
quả ghép việc làm, dựa DUY NHẤT trên các dữ kiện JSON được cung cấp.

Quy tắc:
- Không thêm kỹ năng, con số hay thông tin nào không có trong dữ kiện.
- audience = "candidate": nói với ứng viên ("Bạn ..."), giải thích vì sao job này hợp; nếu thiếu \
kỹ năng thì "suggestion" gợi ý cụ thể nên bổ sung gì (chỉ dùng kỹ năng trong missing_skills).
- audience = "recruiter": nói với nhà tuyển dụng ("Ứng viên ..."), nêu điểm mạnh và điểm cần lưu \
ý; "suggestion" để null.
- Không dùng điểm số dạng phần trăm; không hứa hẹn kết quả tuyển dụng.
"""


class ExplainFacts(BaseModel):
    audience: Literal["candidate", "recruiter"]
    job_title: str | None = None
    candidate_headline: str | None = None
    matched_skills: list[str]
    missing_skills: list[str]
    nice_to_have_matched: list[str]
    level_fit: str
    experience_fit: str
    salary_fit: str


class LlmExplanation(BaseModel):
    match_summary: str = Field(description="1-2 câu giải thích")
    suggestion: str | None = Field(default=None, description="Gợi ý cho ứng viên, hoặc null")


def facts_for(
    audience: Literal["candidate", "recruiter"],
    explanation: Explanation,
    breakdown: Breakdown,
    job: dict[str, Any] | None,
    cv: dict[str, Any] | None,
) -> ExplainFacts:
    return ExplainFacts(
        audience=audience,
        job_title=(job or {}).get("title"),
        candidate_headline=(cv or {}).get("headline"),
        matched_skills=explanation.matched_skills,
        missing_skills=explanation.missing_skills,
        nice_to_have_matched=explanation.nice_to_have_matched,
        level_fit={1.0: "phù hợp", 0.5: "chênh một bậc", 0.0: "chênh nhiều"}.get(
            breakdown.level, "không rõ"
        ),
        experience_fit="đạt yêu cầu" if breakdown.exp >= 1.0 else "có thể chưa đạt yêu cầu",
        salary_fit=(
            "phù hợp mong muốn"
            if breakdown.salary >= 1.0
            else "thấp hơn mong muốn"
            if breakdown.salary < 0.5
            else "chưa rõ"
        ),
    )


class LlmExplainer:
    def __init__(
        self,
        client: AsyncOpenAI,
        model: str = "gpt-4o-mini",
        redis: Redis | None = None,
        timeout_seconds: float = 3.0,
        top_k: int = 5,
        ttl_seconds: int = 7 * 24 * 3600,
    ) -> None:
        self.client = client
        self.model = model
        self.redis = redis
        self.timeout_seconds = timeout_seconds
        self.top_k = top_k
        self.ttl_seconds = ttl_seconds
        self._memory: OrderedDict[str, dict[str, Any]] = OrderedDict()

    async def rewrite(self, items: Sequence[tuple[Explanation, ExplainFacts]]) -> list[Explanation]:
        """Trả danh sách giải thích cùng thứ tự; chỉ top_k đầu được viết lại bằng LLM."""
        head = items[: self.top_k]
        rewritten = await asyncio.gather(
            *(self._one(explanation, facts) for explanation, facts in head)
        )
        return [*rewritten, *(explanation for explanation, _ in items[self.top_k :])]

    async def _one(self, explanation: Explanation, facts: ExplainFacts) -> Explanation:
        key = self._key(facts)
        try:
            cached = await self._cache_get(key)
            if cached is None:
                result = await asyncio.wait_for(self._call(facts), self.timeout_seconds)
                cached = _validated(result, facts)
                if cached is None:
                    return explanation
                await self._cache_set(key, cached)
        except Exception as exc:  # timeout, lỗi mạng, hết hạn mức... -> template
            logger.warning("Giải thích LLM lỗi, dùng template: %s: %s", type(exc).__name__, exc)
            return explanation
        return explanation.model_copy(
            update={
                "match_summary": cached["match_summary"],
                "suggestion": cached.get("suggestion") if facts.audience == "candidate" else None,
                "source": "llm",
            }
        )

    async def _call(self, facts: ExplainFacts) -> LlmExplanation | None:
        completion = await self.client.chat.completions.parse(
            model=self.model,
            temperature=0.3,
            max_tokens=200,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": facts.model_dump_json()},
            ],
            response_format=LlmExplanation,
        )
        return completion.choices[0].message.parsed

    def _key(self, facts: ExplainFacts) -> str:
        raw = json.dumps(
            [PROMPT_VERSION, self.model, facts.model_dump()], sort_keys=True, ensure_ascii=False
        )
        return "expl:" + hashlib.sha256(raw.encode()).hexdigest()[:32]

    async def _cache_get(self, key: str) -> dict[str, Any] | None:
        if self.redis is not None:
            raw = await self.redis.get(key)
            return json.loads(raw) if raw else None
        return self._memory.get(key)

    async def _cache_set(self, key: str, value: dict[str, Any]) -> None:
        if self.redis is not None:
            await self.redis.set(key, json.dumps(value, ensure_ascii=False), ex=self.ttl_seconds)
            return
        self._memory[key] = value
        while len(self._memory) > 5000:
            self._memory.popitem(last=False)


def _validated(result: LlmExplanation | None, facts: ExplainFacts) -> dict[str, Any] | None:
    """Bỏ output rỗng / quá dài (dấu hiệu LLM chạy lệch) để quay về template."""
    if result is None:
        return None
    summary = " ".join(result.match_summary.split())
    if not summary or len(summary) > MAX_SUMMARY_CHARS:
        return None
    suggestion = " ".join((result.suggestion or "").split()) or None
    if suggestion and len(suggestion) > MAX_SUMMARY_CHARS:
        suggestion = None
    return {"match_summary": summary, "suggestion": suggestion}
