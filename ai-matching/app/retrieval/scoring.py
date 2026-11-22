"""Re-scoring theo nghiệp vụ (ARCHITECTURE.md mục 3.6, bước 5). Hàm thuần, dễ test và tune.

Điểm do code tính, LLM không tham gia chấm điểm (chống prompt injection qua CV).
Thiếu dữ liệu ở một vế thì trả 0.5 (trung lập) thay vì phạt hay thưởng.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.retrieval.config import RetrievalConfig
from app.schemas import Level

NEUTRAL = 0.5
_LEVEL_RANK = {level.value: rank for rank, level in enumerate(Level)}


@dataclass(frozen=True)
class SkillMatch:
    matched: list[str]
    missing: list[str]
    nice_matched: list[str]
    missing_must_have: list[str]
    score: float


@dataclass(frozen=True)
class Breakdown:
    hybrid: float
    skill: float
    level: float
    exp: float
    salary: float
    recency: float

    def final(self, config: RetrievalConfig) -> float:
        w = config.weights
        return (
            w.hybrid * self.hybrid
            + w.skill * self.skill
            + w.level * self.level
            + w.exp * self.exp
            + w.salary * self.salary
            + w.recency * self.recency
        )


def min_max(scores: Sequence[float]) -> list[float]:
    if not scores:
        return []
    low, high = min(scores), max(scores)
    if high - low < 1e-12:
        return [1.0] * len(scores)
    return [(s - low) / (high - low) for s in scores]


def skill_match(
    candidate_skills: Sequence[str],
    required: Sequence[str],
    nice: Sequence[str],
    must_have: Sequence[str],
    nice_bonus: float,
) -> SkillMatch:
    have = set(candidate_skills)
    matched = [s for s in required if s in have]
    missing = [s for s in required if s not in have]
    nice_matched = [s for s in nice if s in have]

    score = len(matched) / len(required) if required else 1.0
    if nice:
        score += nice_bonus * len(nice_matched) / len(nice)
    return SkillMatch(
        matched=matched,
        missing=missing,
        nice_matched=nice_matched,
        missing_must_have=[s for s in must_have if s not in have],
        score=min(1.0, score),
    )


def level_score(candidate: str | None, job: str | None) -> float:
    if candidate not in _LEVEL_RANK or job not in _LEVEL_RANK:
        return NEUTRAL
    gap = abs(_LEVEL_RANK[candidate] - _LEVEL_RANK[job])
    return {0: 1.0, 1: 0.5}.get(gap, 0.0)


def exp_score(candidate_years: float | None, min_years: int | None) -> float:
    if not min_years:
        return 1.0
    if candidate_years is None:
        return NEUTRAL
    return min(1.0, candidate_years / min_years)


def salary_score(desired_min: int | None, job_max: int | None) -> float:
    """Lương mong muốn tối thiểu so với mức trần của job."""
    if desired_min is None:
        return 1.0
    if job_max is None:  # job ghi "thỏa thuận"
        return NEUTRAL
    if job_max >= desired_min:
        return 1.0
    return max(0.0, 1.0 - (desired_min - job_max) / desired_min)


def recency_score(timestamp: str | None, now: datetime, recency_days: float) -> float:
    if not timestamp:
        return NEUTRAL
    days = max(0.0, (now - datetime.fromisoformat(timestamp)).total_seconds() / 86400)
    return math.exp(-days / recency_days)


def score_pair(
    job: dict[str, Any],
    cv: dict[str, Any],
    hybrid: float,
    now: datetime,
    config: RetrievalConfig,
    recency_ts: str | None,
) -> tuple[Breakdown, SkillMatch]:
    """Chấm một cặp (job, CV) từ payload Qdrant. Dùng cho cả hai chiều gợi ý."""
    skills = skill_match(
        cv.get("skills") or [],
        job.get("required_skills") or [],
        job.get("nice_skills") or [],
        job.get("must_have_skills") or [],
        config.nice_to_have_bonus,
    )
    breakdown = Breakdown(
        hybrid=hybrid,
        skill=skills.score,
        level=level_score(cv.get("level"), job.get("level")),
        exp=exp_score(cv.get("years_experience"), job.get("min_years_exp")),
        salary=salary_score(cv.get("desired_salary_min"), job.get("salary_max")),
        recency=recency_score(recency_ts, now, config.recency_days),
    )
    return breakdown, skills


def passes_hard_rules(breakdown: Breakdown, skills: SkillMatch, config: RetrievalConfig) -> bool:
    return (
        not skills.missing_must_have
        and breakdown.skill >= config.min_skill_score
        and breakdown.final(config) >= config.tau
    )
