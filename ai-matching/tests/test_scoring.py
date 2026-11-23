import math
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.explain.template import explain_for_candidate, explain_for_recruiter
from app.retrieval.config import RetrievalConfig, get_retrieval_config
from app.retrieval.scoring import (
    Breakdown,
    exp_score,
    level_score,
    min_max,
    passes_hard_rules,
    recency_score,
    salary_score,
    skill_match,
)

NOW = datetime(2026, 11, 22, tzinfo=UTC)


def test_weights_yaml_is_valid():
    config = get_retrieval_config()
    assert config.tau == 0.35
    assert config.weights.hybrid == 0.40


def test_weights_must_sum_to_one():
    data = get_retrieval_config().model_dump()
    data["weights"]["hybrid"] = 0.9
    with pytest.raises(ValidationError, match="Tổng trọng số"):
        RetrievalConfig.model_validate(data)


def test_min_max():
    assert min_max([2.0, 4.0, 3.0]) == [0.0, 1.0, 0.5]
    assert min_max([0.7, 0.7]) == [1.0, 1.0]
    assert min_max([]) == []


def test_skill_match():
    m = skill_match(
        ["java", "kafka", "docker"],
        required=["java", "spring boot", "kafka", "postgresql"],
        nice=["docker", "aws"],
        must_have=["java", "spring boot"],
        nice_bonus=0.1,
    )
    assert m.matched == ["java", "kafka"]
    assert m.missing == ["spring boot", "postgresql"]
    assert m.nice_matched == ["docker"]
    assert m.missing_must_have == ["spring boot"]
    assert math.isclose(m.score, 0.5 + 0.1 * 0.5)


def test_skill_match_caps_at_one_and_handles_no_requirements():
    full = skill_match(["a", "b"], required=["a"], nice=["b"], must_have=[], nice_bonus=0.1)
    assert full.score == 1.0
    assert skill_match([], required=[], nice=[], must_have=[], nice_bonus=0.1).score == 1.0


@pytest.mark.parametrize(
    ("cv", "job", "expected"),
    [
        ("SENIOR", "SENIOR", 1.0),
        ("MIDDLE", "SENIOR", 0.5),
        ("JUNIOR", "SENIOR", 0.0),
        (None, "SENIOR", 0.5),
        ("SENIOR", None, 0.5),
    ],
)
def test_level_score(cv, job, expected):
    assert level_score(cv, job) == expected


def test_exp_score():
    assert exp_score(4, 3) == 1.0
    assert exp_score(1.5, 3) == 0.5
    assert exp_score(None, 3) == 0.5
    assert exp_score(None, None) == 1.0


def test_salary_score():
    assert salary_score(None, 30) == 1.0
    assert salary_score(30, None) == 0.5  # job lương thỏa thuận
    assert salary_score(30, 40) == 1.0
    assert math.isclose(salary_score(40, 30), 0.75)
    assert salary_score(100, 10) == pytest.approx(0.1)


def test_recency_score():
    assert recency_score(NOW.isoformat(), NOW, 30) == 1.0
    assert math.isclose(recency_score((NOW - timedelta(days=30)).isoformat(), NOW, 30), math.e**-1)
    assert recency_score(None, NOW, 30) == 0.5
    assert recency_score((NOW + timedelta(days=1)).isoformat(), NOW, 30) == 1.0


def _breakdown(**kw):
    base = dict(hybrid=1.0, skill=1.0, level=1.0, exp=1.0, salary=1.0, recency=1.0)
    base.update(kw)
    return Breakdown(**base)


def test_final_score_uses_weights():
    config = get_retrieval_config()
    assert math.isclose(_breakdown().final(config), 1.0)
    assert math.isclose(_breakdown(skill=0.0).final(config), 0.70)


def test_hard_rules():
    config = get_retrieval_config()
    ok = skill_match(["java"], ["java"], [], [], 0.1)
    no_must = skill_match(["java"], ["java", "go"], [], ["go"], 0.1)

    assert passes_hard_rules(_breakdown(), ok, config)
    assert not passes_hard_rules(_breakdown(), no_must, config)
    assert not passes_hard_rules(_breakdown(skill=0.29), ok, config)
    zero = _breakdown(hybrid=0, skill=0.3, level=0, exp=0, salary=0, recency=0)
    assert not passes_hard_rules(zero, ok, config)  # final 0.09 < tau


def test_explanations():
    skills = skill_match(["java", "docker"], ["java", "kafka"], ["docker"], [], 0.1)
    user = explain_for_candidate(skills, _breakdown(exp=0.5))
    assert user.match_summary.startswith("Bạn có 1/2 kỹ năng bắt buộc (java). Còn thiếu: kafka.")
    assert "docker" in user.match_summary
    assert "kinh nghiệm" in user.match_summary
    assert user.suggestion == "Bổ sung kinh nghiệm hoặc dự án có dùng kafka."

    hr = explain_for_recruiter(skills, _breakdown())
    assert hr.match_summary.startswith("Ứng viên có 1/2 kỹ năng bắt buộc")
    assert hr.suggestion is None
