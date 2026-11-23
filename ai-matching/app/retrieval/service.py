"""Pipeline gợi ý (ARCHITECTURE.md mục 3.6 và 3.7).

Query dùng chính vector đã index của CV (hoặc job), đọc lại từ Qdrant, nên lúc gợi ý KHÔNG gọi
OpenAI: nhanh, rẻ, và cùng một cách encode với lúc index.

  1. Đọc point nguồn (CV hoặc job) kèm vector        -> 404 nếu chưa được index
  2. Hard filter (trong prefetch)
  3. Prefetch dense top-N + sparse top-N, fusion RRF
  4. Re-score theo nghiệp vụ + luật cứng (must_have, s_skill, tau)
  5. Đa dạng hóa (tối đa N job/công ty) và cắt top-K
  6. CV sơ sài mà chưa đủ K job: bù job khớp yếu hơn, rồi job mới đăng (vẫn giữ hard filter
     và must_have, nên constraint compliance không đổi)
  7. Giải thích (template; LLM ở bước sau)
"""

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Any

from qdrant_client import models as qm

from app.explain.template import Explanation, explain_for_candidate, explain_for_recruiter
from app.retrieval.config import RetrievalConfig
from app.retrieval.scoring import Breakdown, min_max, passes_hard_rules, score_pair
from app.vectorstore import DENSE, SPARSE, Kind, PointData, QdrantStore


class NotIndexedError(LookupError):
    """CV/job nguồn chưa có trong Qdrant (chưa được index hoặc đã bị xóa)."""


@dataclass(frozen=True)
class Match:
    ref_id: str
    score: float
    breakdown: Breakdown
    explanation: Explanation
    payload: dict[str, Any]
    # True: job được bù vào cho CV sơ sài, không đạt ngưỡng gợi ý thông thường
    is_fallback: bool = False


@dataclass(frozen=True)
class JobRecommendations:
    matches: list[Match]
    # CV ít kỹ năng: FE nên nhắc User bổ sung CV
    cv_is_thin: bool


class Recommender:
    def __init__(self, store: QdrantStore, config: RetrievalConfig) -> None:
        self.store = store
        self.config = config

    async def recommend_jobs(
        self,
        cv_id: str,
        job_filter: qm.Filter,
        limit: int = 10,
        now: datetime | None = None,
    ) -> JobRecommendations:
        now = now or datetime.now(UTC)
        cv = await self._source(Kind.CV, cv_id)
        cv_is_thin = len(cv.payload.get("skills") or []) < self.config.thin_cv_min_skills
        hits = await self._hybrid(Kind.JOB, cv, job_filter)

        strict: list[Match] = []
        relaxed: list[Match] = []
        for hit, hybrid in zip(hits, min_max([h.score for h in hits]), strict=True):
            match, passed = self._score_job(hit.payload or {}, cv.payload, hybrid, now)
            if passed:
                strict.append(match)
            elif cv_is_thin and match is not None:
                relaxed.append(match)

        result = self._diversify(_ranked(strict), limit)
        if cv_is_thin and len(result) < limit:
            seen = {m.ref_id for m in strict} | {m.ref_id for m in relaxed}
            newest = await self._newest_jobs(cv.payload, job_filter, seen, now)
            # Thứ tự ưu tiên: khớp chặt -> khớp yếu hơn -> job mới đăng
            result = self._diversify([*result, *_ranked(relaxed), *_ranked(newest)], limit)
        return JobRecommendations(matches=result, cv_is_thin=cv_is_thin)

    def _score_job(
        self, job: dict[str, Any], cv: dict[str, Any], hybrid: float, now: datetime
    ) -> tuple[Match | None, bool]:
        """Trả (match, qua_luật_cứng). match = None nếu thiếu skill must_have: không bao giờ bù."""
        breakdown, skills = score_pair(
            job, cv, hybrid, now, self.config, recency_ts=job.get("published_ts")
        )
        passed = passes_hard_rules(breakdown, skills, self.config)
        if not passed and skills.missing_must_have:
            return None, False
        return (
            Match(
                ref_id=job["job_id"],
                score=breakdown.final(self.config),
                breakdown=breakdown,
                explanation=explain_for_candidate(skills, breakdown),
                payload=job,
                is_fallback=not passed,
            ),
            passed,
        )

    async def _newest_jobs(
        self, cv: dict[str, Any], job_filter: qm.Filter, seen: set[str], now: datetime
    ) -> list[Match]:
        """Job mới đăng nhất thỏa hard filter (cùng filter với hybrid search)."""
        if self.config.fallback_newest_limit == 0:
            return []
        points, _ = await self.store.client.scroll(
            self.store.collection(Kind.JOB),
            scroll_filter=job_filter,
            order_by=qm.OrderBy(key="published_ts", direction=qm.Direction.DESC),
            limit=self.config.fallback_newest_limit,
            with_payload=True,
        )
        matches = []
        for point in points:
            job = point.payload or {}
            if job.get("job_id") in seen:
                continue
            match, _ = self._score_job(job, cv, hybrid=0.0, now=now)
            if match is not None:
                matches.append(replace(match, is_fallback=True))
        return matches

    async def search_candidates(
        self,
        job_id: str,
        candidate_filter: qm.Filter,
        limit: int = 20,
        now: datetime | None = None,
    ) -> list[Match]:
        now = now or datetime.now(UTC)
        job = await self._source(Kind.JOB, job_id)
        hits = await self._hybrid(Kind.CV, job, candidate_filter)

        matches = []
        for hit, hybrid in zip(hits, min_max([h.score for h in hits]), strict=True):
            cv = hit.payload or {}
            breakdown, skills = score_pair(
                job.payload, cv, hybrid, now, self.config, recency_ts=cv.get("updated_ts")
            )
            if passes_hard_rules(breakdown, skills, self.config):
                matches.append(
                    Match(
                        ref_id=cv["cv_id"],
                        score=breakdown.final(self.config),
                        breakdown=breakdown,
                        explanation=explain_for_recruiter(skills, breakdown),
                        payload=cv,
                    )
                )
        return _ranked(matches)[:limit]

    async def _source(self, kind: Kind, ref_id: str) -> PointData:
        point = await self.store.get(kind, ref_id)
        if point is None:
            raise NotIndexedError(f"{kind.value} {ref_id} chưa được index")
        return point

    async def _hybrid(
        self, target: Kind, source: PointData, flt: qm.Filter
    ) -> Sequence[qm.ScoredPoint]:
        prefetch = [
            qm.Prefetch(
                query=source.dense, using=DENSE, filter=flt, limit=self.config.prefetch_limit
            )
        ]
        if source.sparse.indices:
            prefetch.append(
                qm.Prefetch(
                    query=source.sparse, using=SPARSE, filter=flt, limit=self.config.prefetch_limit
                )
            )
        response = await self.store.client.query_points(
            self.store.collection(target),
            prefetch=prefetch,
            query=qm.FusionQuery(fusion=qm.Fusion.RRF),
            limit=self.config.fusion_limit,
            with_payload=True,
        )
        return response.points

    def _diversify(self, ranked: Sequence[Match], limit: int) -> list[Match]:
        per_company: Counter[str] = Counter()
        result = []
        for match in ranked:
            company = match.payload.get("company_id", "")
            if per_company[company] >= self.config.max_per_company:
                continue
            per_company[company] += 1
            result.append(match)
            if len(result) == limit:
                break
        return result


def _ranked(matches: list[Match]) -> list[Match]:
    return sorted(matches, key=lambda m: m.score, reverse=True)
