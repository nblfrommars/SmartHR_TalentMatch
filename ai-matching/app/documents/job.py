"""Job snapshot -> IndexDocument cho collection "jobs" (ARCHITECTURE.md mục 3.4)."""

from app.core.config import get_settings
from app.documents.base import (
    IndexDocument,
    compact_lines,
    join_tokens,
    joined_line,
    labeled_line,
    plain_payload,
    segment_all,
    skill_tokens,
    to_utc_iso,
)
from app.schemas import JobSnapshot
from app.skills import get_normalizer
from app.text import clean_text, normalize_keyword


def _ids(*ids: str | None) -> list[str]:
    return [i for i in ids if i]


def build_job_document(job: JobSnapshot) -> IndexDocument:
    settings = get_settings()
    normalizer = get_normalizer()

    must_have = normalizer.normalize_many(job.must_have_skills)
    # Skill must_have chắc chắn là skill bắt buộc
    required = normalizer.normalize_many([*job.required_skills, *job.must_have_skills])
    nice = [s for s in normalizer.normalize_many(job.nice_to_have_skills) if s not in required]

    title = clean_text(job.title)
    description = clean_text(job.description, max_chars=settings.document_max_chars)

    dense_text = compact_lines(
        [
            labeled_line("Title", title),
            joined_line(
                labeled_line("Level", job.level),
                labeled_line("Industry", clean_text(job.industry)),
                labeled_line("Type", job.job_type),
            ),
            labeled_line("Required skills", ", ".join(required)),
            labeled_line("Nice to have", ", ".join(nice)),
            labeled_line("Description", description),
        ]
    )

    sparse_text = join_tokens(
        segment_all([title]),
        skill_tokens(required),
        skill_tokens(nice),
        segment_all([description]),
    )

    payload = {
        "job_id": job.job_id,
        "company_id": job.company_id,
        "company_name": clean_text(job.company_name) or None,
        "title": title,
        "status": job.status,
        "deadline_ts": to_utc_iso(job.deadline),
        "published_ts": to_utc_iso(job.published_at),
        "salary_min": job.salary_min,
        "salary_max": job.salary_max,
        # location/industry: dạng chuẩn hóa để lọc theo tên; *_name: dạng gốc để FE hiển thị;
        # *_ids: id của nó và id cấp cha, để lọc theo id (chọn "Hà Nội" ra cả job ở quận của Hà Nội)
        "location": normalize_keyword(job.location),
        "location_name": clean_text(job.location) or None,
        "location_ids": _ids(job.location_id, job.location_parent_id),
        "work_mode": job.work_mode,
        "industry": normalize_keyword(job.industry),
        "industry_name": clean_text(job.industry) or None,
        "industry_ids": _ids(job.industry_id, job.industry_parent_id),
        "level": job.level,
        "job_type": job.job_type,
        "required_skills": required,
        "nice_skills": nice,
        "must_have_skills": must_have,
        "min_years_exp": job.min_years_exp,
        "version": job.version,
        "embedding_version": settings.embedding_version,
    }

    return IndexDocument(
        id=job.job_id,
        dense_text=dense_text,
        sparse_text=sparse_text,
        payload=plain_payload(payload),
    )
