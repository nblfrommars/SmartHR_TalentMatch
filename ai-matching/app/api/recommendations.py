"""API gợi ý (đi qua gateway: /api/v1/ai/...).

- GET /ai/recommendations/jobs?cvId=...    User: job phù hợp với CV
- GET /ai/search/candidates?jobId=...      HR: ứng viên phù hợp với job (reverse matching)
- GET /ai/match-score?cvId=...&jobId=...    Điểm của một cặp (application-service lưu khi apply)
- POST /ai/search/candidates/query          HR: tìm ứng viên bằng câu hỏi tự do
"""

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import Field

from app.api.auth import IdentityDep, Role, ensure_cv_access
from app.core.container import Container, get_container
from app.explain.llm import facts_for
from app.explain.template import Explanation
from app.retrieval import filters
from app.retrieval.nl_query import MAX_QUERY_CHARS, ParsedQuery, build_query_source
from app.retrieval.service import Match, NotIndexedError, PairScore
from app.schemas import JobType, Level
from app.schemas.common import CamelModel
from app.skills import get_normalizer
from app.vectorstore import Kind

router = APIRouter(prefix="/ai", tags=["recommendations"])

ContainerDep = Annotated[Container, Depends(get_container)]


class ScoreBreakdown(CamelModel):
    hybrid: float
    skill: float
    level: float
    exp: float
    salary: float
    recency: float


class ExplanationOut(CamelModel):
    match_summary: str
    matched_skills: list[str]
    missing_skills: list[str]
    nice_to_have_matched: list[str]
    suggestion: str | None = None
    source: str = "template"  # "llm" khi câu tóm tắt do LLM viết lại


class JobRecommendation(CamelModel):
    job_id: str
    score: float
    is_fallback: bool
    breakdown: ScoreBreakdown
    explanation: ExplanationOut
    job: dict[str, Any]


class CandidateMatch(CamelModel):
    cv_id: str
    score: float
    breakdown: ScoreBreakdown
    explanation: ExplanationOut
    candidate: dict[str, Any]


class JobRecommendations(CamelModel):
    cv_id: str
    cv_is_thin: bool
    notice: str | None = None
    items: list[JobRecommendation]


THIN_CV_NOTICE = (
    "CV của bạn còn ít thông tin về kỹ năng. Hãy bổ sung kỹ năng, dự án hoặc đồ án đã làm "
    "để nhận gợi ý chính xác hơn."
)


class CandidateMatches(CamelModel):
    job_id: str
    items: list[CandidateMatch]


def _breakdown(match: Match) -> ScoreBreakdown:
    return ScoreBreakdown(**{k: round(v, 4) for k, v in vars(match.breakdown).items()})


def _explanation(explanation: Explanation) -> ExplanationOut:
    return ExplanationOut(**explanation.model_dump())


@router.get(
    "/recommendations/jobs",
    response_model=JobRecommendations,
    responses={
        403: {"description": "Không phải CV của người gọi, hoặc không phải USER/ADMIN"},
        404: {"description": "CV chưa được index"},
    },
)
async def recommend_jobs(
    container: ContainerDep,
    identity: IdentityDep,
    response: Response,
    cv_id: Annotated[str, Query(alias="cvId")],
    location: Annotated[list[str] | None, Query()] = None,
    job_type: Annotated[JobType | None, Query(alias="jobType")] = None,
    industry: Annotated[list[str] | None, Query()] = None,
    salary_min: Annotated[int | None, Query(alias="salaryMin", ge=0)] = None,
    exclude_job_ids: Annotated[list[str] | None, Query(alias="excludeJobIds")] = None,
    location_id: Annotated[list[str] | None, Query(alias="locationId")] = None,
    industry_id: Annotated[list[str] | None, Query(alias="industryId")] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> JobRecommendations:
    identity.require_roles(Role.USER, Role.ADMIN)
    await ensure_cv_access(identity, container, cv_id)

    cache = container.rec_cache
    cache_params = {
        "location": location,
        "jobType": job_type,
        "industry": industry,
        "salaryMin": salary_min,
        "excludeJobIds": sorted(exclude_job_ids or []),
        "locationId": location_id,
        "industryId": industry_id,
        "limit": limit,
    }
    if cache is not None and (cached := await cache.get(cv_id, cache_params)) is not None:
        response.headers["X-Cache"] = "HIT"
        return JobRecommendations.model_validate(cached)
    flt = filters.job_filter(
        now=datetime.now(UTC),
        locations=location,
        job_type=job_type,
        industries=industry,
        salary_min=salary_min,
        exclude_job_ids=exclude_job_ids,
        location_ids=location_id,
        industry_ids=industry_id,
    )
    try:
        result = await container.recommender.recommend_jobs(cv_id, flt, limit=limit)
    except NotIndexedError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    explanations = [m.explanation for m in result.matches]
    if container.explainer is not None:
        explanations = await container.explainer.rewrite(
            [
                (m.explanation, facts_for("candidate", m.explanation, m.breakdown, m.payload, None))
                for m in result.matches
            ]
        )
    result_out = JobRecommendations(
        cv_id=cv_id,
        cv_is_thin=result.cv_is_thin,
        notice=THIN_CV_NOTICE if result.cv_is_thin else None,
        items=[
            JobRecommendation(
                job_id=m.ref_id,
                score=round(m.score, 4),
                is_fallback=m.is_fallback,
                breakdown=_breakdown(m),
                explanation=_explanation(explanation),
                job=m.payload,
            )
            for m, explanation in zip(result.matches, explanations, strict=True)
        ],
    )
    if cache is not None:
        await cache.set(cv_id, cache_params, result_out.model_dump(mode="json"))
        response.headers["X-Cache"] = "MISS"
    return result_out


@router.get(
    "/search/candidates",
    response_model=CandidateMatches,
    responses={
        403: {"description": "Chỉ HR/ADMIN"},
        404: {"description": "Job chưa được index"},
    },
)
async def search_candidates(
    container: ContainerDep,
    identity: IdentityDep,
    job_id: Annotated[str, Query(alias="jobId")],
    location: Annotated[list[str] | None, Query()] = None,
    level: Annotated[list[Level] | None, Query()] = None,
    min_years: Annotated[float | None, Query(alias="minYears", ge=0)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> CandidateMatches:
    identity.require_roles(Role.HR, Role.ADMIN)
    flt = filters.candidate_filter(locations=location, levels=level, min_years=min_years)
    try:
        matches = await container.recommender.search_candidates(job_id, flt, limit=limit)
    except NotIndexedError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    explanations = [m.explanation for m in matches]
    if container.explainer is not None and matches:
        job = await container.store.get_payload(Kind.JOB, job_id)
        explanations = await container.explainer.rewrite(
            [
                (m.explanation, facts_for("recruiter", m.explanation, m.breakdown, job, m.payload))
                for m in matches
            ]
        )
    return CandidateMatches(
        job_id=job_id,
        items=[
            CandidateMatch(
                cv_id=m.ref_id,
                score=round(m.score, 4),
                breakdown=_breakdown(m),
                explanation=_explanation(explanation),
                candidate=m.payload,
            )
            for m, explanation in zip(matches, explanations, strict=True)
        ],
    )


class MatchScore(CamelModel):
    cv_id: str
    job_id: str
    score: float
    passed: bool
    breakdown: ScoreBreakdown
    explanation_for_candidate: ExplanationOut
    explanation_for_recruiter: ExplanationOut


@router.get(
    "/match-score",
    response_model=MatchScore,
    responses={
        403: {"description": "USER hỏi điểm với CV không phải của mình"},
        404: {"description": "CV hoặc job chưa được index"},
    },
)
async def match_score(
    container: ContainerDep,
    identity: IdentityDep,
    cv_id: Annotated[str, Query(alias="cvId")],
    job_id: Annotated[str, Query(alias="jobId")],
) -> MatchScore:
    """Điểm phù hợp của một CV với một job.

    application-service gọi nội bộ lúc User apply và lưu `score` để HR sắp xếp ứng viên.
    `passed=false` nghĩa là cặp này không đạt luật cứng (vẫn trả điểm để lưu).
    """
    identity.require_roles(Role.USER, Role.HR, Role.ADMIN)
    if identity.role == Role.USER:
        await ensure_cv_access(identity, container, cv_id)
    try:
        pair = await container.recommender.match_pair(cv_id, job_id)
    except NotIndexedError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _match_score(cv_id, job_id, pair)


def _match_score(cv_id: str, job_id: str, pair: PairScore) -> MatchScore:
    return MatchScore(
        cv_id=cv_id,
        job_id=job_id,
        score=round(pair.score, 4),
        passed=pair.passed,
        breakdown=ScoreBreakdown(**{k: round(v, 4) for k, v in vars(pair.breakdown).items()}),
        explanation_for_candidate=_explanation(pair.for_candidate),
        explanation_for_recruiter=_explanation(pair.for_recruiter),
    )


class CandidateQuery(CamelModel):
    query: str = Field(min_length=2, max_length=MAX_QUERY_CHARS)
    limit: int = Field(default=20, ge=1, le=100)


class QueryInterpretation(CamelModel):
    semantic_text: str
    skills: list[str]
    must_have_skills: list[str]
    locations: list[str]
    levels: list[str]
    min_years: float | None


class CandidateQueryResult(CamelModel):
    query: str
    interpreted: QueryInterpretation
    items: list[CandidateMatch]


@router.post(
    "/search/candidates/query",
    response_model=CandidateQueryResult,
    responses={
        403: {"description": "Chỉ HR/ADMIN"},
        502: {"description": "LLM lỗi"},
        503: {"description": "Chưa cấu hình OpenAI"},
    },
)
async def search_candidates_by_query(
    body: CandidateQuery, container: ContainerDep, identity: IdentityDep
) -> CandidateQueryResult:
    """HR mô tả ứng viên cần tìm bằng lời ("Java dev biết Kafka ở Hà Nội, 3 năm trở lên").

    `interpreted` cho HR thấy hệ thống đã hiểu câu hỏi thế nào. CV chưa có địa điểm / cấp bậc /
    số năm vẫn được giữ, chỉ bị lọc khi dữ liệu có và không khớp.
    """
    identity.require_roles(Role.HR, Role.ADMIN)
    if container.query_parser is None:
        raise HTTPException(503, detail="Chưa cấu hình AI_OPENAI_API_KEY")
    try:
        parsed: ParsedQuery = await container.query_parser.parse(body.query)
    except Exception as exc:
        raise HTTPException(502, detail="Không phân tích được câu tìm kiếm, thử lại sau") from exc

    source, parsed = await build_query_source(
        parsed, get_normalizer(), container.dense, container.sparse
    )
    flt = filters.candidate_filter(
        locations=parsed.locations,
        levels=parsed.levels,
        min_years=parsed.min_years,
        keep_unknown=True,
    )
    matches = await container.recommender.search_candidates_for(source, flt, limit=body.limit)
    explanations = [m.explanation for m in matches]
    if container.explainer is not None and matches:
        explanations = await container.explainer.rewrite(
            [
                (
                    m.explanation,
                    facts_for("recruiter", m.explanation, m.breakdown, source.payload, m.payload),
                )
                for m in matches
            ]
        )
    return CandidateQueryResult(
        query=body.query,
        interpreted=QueryInterpretation(
            semantic_text=parsed.semantic_text,
            skills=parsed.skills,
            must_have_skills=parsed.must_have_skills,
            locations=parsed.locations,
            levels=[lv.value for lv in parsed.levels],
            min_years=parsed.min_years,
        ),
        items=[
            CandidateMatch(
                cv_id=m.ref_id,
                score=round(m.score, 4),
                breakdown=_breakdown(m),
                explanation=_explanation(explanation),
                candidate=m.payload,
            )
            for m, explanation in zip(matches, explanations, strict=True)
        ],
    )
