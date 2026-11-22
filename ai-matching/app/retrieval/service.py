"""Pipeline gợi ý (ARCHITECTURE.md mục 3.6 và 3.7).

Query dùng chính vector đã index của CV (hoặc job), đọc lại từ Qdrant, nên lúc gợi ý KHÔNG gọi
OpenAI: nhanh, rẻ, và cùng một cách encode với lúc index.

  1. Đọc point nguồn (CV hoặc job) kèm vector        -> 404 nếu chưa được index
  2. Hard filter (trong prefetch)
  3. Prefetch dense top-N + sparse top-N, fusion RRF
  4. Re-score theo nghiệp vụ + luật cứng (must_have, s_skill, tau)
  5. Đa dạng hóa (tối đa N job/công ty) và cắt top-K
  6. Giải thích (template; LLM ở bước sau)
"""

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
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
    ) -> list[Match]:
        now = now or datetime.now(UTC)
        cv = await self._source(Kind.CV, cv_id)
        hits = await self._hybrid(Kind.JOB, cv, job_filter)

        matches = []
        for hit, hybrid in zip(hits, min_max([h.score for h in hits]), strict=True):
            job = hit.payload or {}
            breakdown, skills = score_pair(
                job, cv.payload, hybrid, now, self.config, recency_ts=job.get("published_ts")
            )
            if passes_hard_rules(breakdown, skills, self.config):
                matches.append(
                    Match(
                        ref_id=job["job_id"],
                        score=breakdown.final(self.config),
                        breakdown=breakdown,
                        explanation=explain_for_candidate(skills, breakdown),
                        payload=job,
                    )
                )
        return self._diversify(_ranked(matches), limit)

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
