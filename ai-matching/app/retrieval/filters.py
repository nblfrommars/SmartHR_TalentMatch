"""Hard filter (ARCHITECTURE.md mục 3.6, bước 3). Nằm TRONG prefetch của Qdrant chứ không lọc sau,
nên luôn trả đủ top-K kết quả hợp lệ.
"""

from collections.abc import Sequence
from datetime import datetime

from qdrant_client import models as qm

from app.schemas import JobType, Level
from app.text import normalize_keyword


def _keywords(values: Sequence[str] | None) -> list[str]:
    return [v for v in (normalize_keyword(x) for x in values or []) if v]


def job_filter(
    now: datetime,
    locations: Sequence[str] | None = None,
    job_type: JobType | None = None,
    industries: Sequence[str] | None = None,
    salary_min: int | None = None,
    exclude_job_ids: Sequence[str] | None = None,
    location_ids: Sequence[str] | None = None,
    industry_ids: Sequence[str] | None = None,
) -> qm.Filter:
    must: list[qm.Condition] = [
        qm.FieldCondition(key="status", match=qm.MatchValue(value="OPEN")),
        # Chặn job quá hạn ngay cả khi scheduler đóng job chạy trễ
        qm.FieldCondition(key="deadline_ts", range=qm.DatetimeRange(gte=now)),
    ]
    if locs := _keywords(locations):
        must.append(qm.FieldCondition(key="location", match=qm.MatchAny(any=locs)))
    if job_type:
        must.append(qm.FieldCondition(key="job_type", match=qm.MatchValue(value=job_type.value)))
    if inds := _keywords(industries):
        must.append(qm.FieldCondition(key="industry", match=qm.MatchAny(any=inds)))
    # Lọc theo id (khuyến nghị cho FE, lấy từ /api/v1/locations và /api/v1/industries).
    # location_ids của job gồm id của nó và id cấp cha, nên chọn tỉnh ra được cả job ở quận.
    for key, ids in (("location_ids", location_ids), ("industry_ids", industry_ids)):
        if ids:
            must.append(qm.FieldCondition(key=key, match=qm.MatchAny(any=list(ids))))
    if salary_min is not None:
        # Khoảng lương giao nhau; job "thỏa thuận" (không có salary_max) vẫn được giữ
        must.append(
            qm.Filter(
                should=[
                    qm.FieldCondition(key="salary_max", range=qm.Range(gte=salary_min)),
                    qm.IsEmptyCondition(is_empty=qm.PayloadField(key="salary_max")),
                ]
            )
        )

    must_not: list[qm.Condition] = []
    if exclude_job_ids:
        must_not.append(
            qm.FieldCondition(key="job_id", match=qm.MatchAny(any=list(exclude_job_ids)))
        )
    return qm.Filter(must=must, must_not=must_not or None)


def candidate_filter(
    locations: Sequence[str] | None = None,
    levels: Sequence[Level] | None = None,
    min_years: float | None = None,
) -> qm.Filter:
    must: list[qm.Condition] = [
        # Privacy: chỉ CV mà User chủ động cho phép tìm kiếm
        qm.FieldCondition(key="searchable", match=qm.MatchValue(value=True)),
    ]
    if locs := _keywords(locations):
        must.append(qm.FieldCondition(key="location", match=qm.MatchAny(any=locs)))
    if levels:
        must.append(
            qm.FieldCondition(key="level", match=qm.MatchAny(any=[lv.value for lv in levels]))
        )
    if min_years is not None:
        must.append(qm.FieldCondition(key="years_experience", range=qm.Range(gte=min_years)))
    return qm.Filter(must=must)
