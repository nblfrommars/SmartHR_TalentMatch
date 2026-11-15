"""CV snapshot -> IndexDocument cho collection "candidates" (ARCHITECTURE.md mục 3.5, 3.6).

dense_text / sparse_text của CV cũng chính là query khi gợi ý job cho User (Phase 5).
Không dùng full_name, email, phone: CvSnapshot không có các field này, và mọi văn bản tự do
đều đi qua clean_text() để loại email/SĐT/URL lỡ nằm trong phần mô tả.
"""

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
from app.schemas import CvEducation, CvExperience, CvLanguage, CvSnapshot
from app.skills import get_normalizer
from app.text import clean_text, normalize_keyword, truncate


def build_cv_document(cv: CvSnapshot) -> IndexDocument:
    settings = get_settings()
    normalizer = get_normalizer()

    skills = normalizer.normalize_many(s.name for s in cv.skills)
    certifications = normalizer.normalize_many(cv.certifications)
    headline = clean_text(cv.headline)

    experience_lines = [line for line in (_experience_line(e) for e in cv.experiences) if line]
    experience_block = truncate("\n".join(experience_lines), settings.document_max_chars)

    dense_text = compact_lines(
        [
            labeled_line("Headline", headline),
            joined_line(
                labeled_line("Level", cv.level),
                _years_label(cv.years_experience),
            ),
            labeled_line("Skills", ", ".join(skills)),
            labeled_line("Certifications", ", ".join(certifications)),
            labeled_line("Languages", ", ".join(_language_label(lang) for lang in cv.languages)),
            f"Experience:\n{experience_block}" if experience_block else None,
            labeled_line("Education", "; ".join(filter(None, map(_education_label, cv.education)))),
        ]
    )

    sparse_text = join_tokens(
        skill_tokens(skills),
        skill_tokens(certifications),
        segment_all([headline]),
    )

    payload = {
        "cv_id": cv.cv_id,
        "user_id": cv.user_id,
        "searchable": cv.searchable,
        "location": normalize_keyword(cv.location),
        "level": cv.level,
        "years_experience": cv.years_experience,
        "skills": skills,
        "certifications": certifications,
        "desired_salary_min": cv.desired.salary_min,
        "desired_job_type": cv.desired.job_type,
        "desired_work_mode": cv.desired.work_mode,
        "desired_locations": [
            loc for loc in (normalize_keyword(x) for x in cv.desired.locations) if loc
        ],
        "updated_ts": to_utc_iso(cv.updated_at),
        "version": cv.version,
        "embedding_version": settings.embedding_version,
    }

    return IndexDocument(
        id=cv.cv_id,
        dense_text=dense_text,
        sparse_text=sparse_text,
        payload=plain_payload(payload),
    )


def _experience_line(exp: CvExperience) -> str | None:
    title = clean_text(exp.title)
    company = clean_text(exp.company)
    head = " at ".join(filter(None, [title, company]))
    period = " – ".join(filter(None, [exp.from_date, exp.to_date]))
    if period:
        head = f"{head} ({period})" if head else period
    summary = clean_text(exp.summary)
    line = ": ".join(filter(None, [head, summary]))
    return f"- {line}" if line else None


def _years_label(years: float | None) -> str | None:
    if years is None:
        return None
    return f"Experience: {years:g} years"


def _language_label(lang: CvLanguage) -> str:
    level = clean_text(lang.level)
    return f"{clean_text(lang.name)} ({level})" if level else clean_text(lang.name)


def _education_label(edu: CvEducation) -> str | None:
    return " ".join(filter(None, [clean_text(edu.degree), clean_text(edu.major)])) or None
