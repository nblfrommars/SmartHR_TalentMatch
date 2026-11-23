"""PDF -> CvSchema nháp cho User xem lại và sửa trước khi lưu (ARCHITECTURE.md mục 3.5).

1. Trích text (pdfplumber), kiểm tra magic bytes, kích thước, PDF scan
2. Tách email/SĐT bằng regex rồi xóa khỏi text: không gửi PII này sang OpenAI
3. LLM trích xuất JSON theo schema
4. Chuẩn hóa skill, tự tính số năm kinh nghiệm nếu CV không ghi
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date

from app.parsing.extractor import CvExtractor, ExtractedCv
from app.parsing.pdf import extract_text
from app.schemas import CvExperience, CvSchema, CvSkill
from app.skills import SkillNormalizer
from app.text import find_contacts, scrub_pii, truncate
from app.text.cleaning import normalize_whitespace

_YEAR_MONTH = re.compile(r"(\d{4})(?:\s*[-/.]\s*(\d{1,2}))?")
_PRESENT = {"present", "now", "current", "hiện tại", "nay", "đến nay"}


@dataclass
class ParseResult:
    cv: CvSchema
    warnings: list[str] = field(default_factory=list)


class CvParser:
    def __init__(
        self,
        extractor: CvExtractor,
        normalizer: SkillNormalizer,
        max_bytes: int,
        max_pages: int,
        max_chars: int,
    ) -> None:
        self.extractor = extractor
        self.normalizer = normalizer
        self.max_bytes = max_bytes
        self.max_pages = max_pages
        self.max_chars = max_chars

    async def parse(self, pdf: bytes, today: date | None = None) -> ParseResult:
        raw = extract_text(pdf, self.max_bytes, self.max_pages)
        emails, phones = find_contacts(raw)

        text = normalize_whitespace(scrub_pii(raw))
        warnings = []
        if len(text) > self.max_chars:
            text = truncate(text, self.max_chars)
            warnings.append("CV quá dài, chỉ phân tích phần đầu.")

        extracted = await self.extractor.extract(text)
        cv = self._finalize(extracted, emails, phones, today or date.today())
        if not cv.skills:
            warnings.append("Không tìm thấy kỹ năng nào, vui lòng bổ sung.")
        return ParseResult(cv=cv, warnings=warnings)

    def _finalize(
        self, extracted: ExtractedCv, emails: list[str], phones: list[str], today: date
    ) -> CvSchema:
        data = extracted.model_dump()
        data["skills"] = self._merge_skills(extracted.skills)
        data["certifications"] = self.normalizer.normalize_many(extracted.certifications)
        for project in data["projects"]:
            project["technologies"] = self.normalizer.normalize_many(project["technologies"])
        if data["years_experience"] is None:
            data["years_experience"] = total_years(extracted.experiences, today)
        data["email"] = emails[0] if emails else None
        data["phone"] = phones[0] if phones else None
        return CvSchema.model_validate(data)

    def _merge_skills(self, skills: Sequence[CvSkill]) -> list[dict]:
        """Chuẩn hóa tên, gộp trùng (ReactJS + React.js -> react), giữ số năm lớn nhất."""
        merged: dict[str, float | None] = {}
        for skill in skills:
            name = self.normalizer.normalize(skill.name)
            if not name:
                continue
            years = [y for y in (merged.get(name), skill.years) if y is not None]
            merged[name] = max(years) if years else None
        return [{"name": name, "years": years} for name, years in merged.items()]


def _parse_month(value: str | None, today: date, is_end: bool) -> date | None:
    if not value:
        return None
    if value.strip().lower() in _PRESENT:
        return today
    match = _YEAR_MONTH.search(value)
    if not match:
        return None
    year = int(match.group(1))
    month = int(match.group(2)) if match.group(2) else (12 if is_end else 1)
    if not 1 <= month <= 12:
        return None
    return date(year, month, 1)


def total_years(experiences: Sequence[CvExperience], today: date) -> float | None:
    """Tổng số năm kinh nghiệm, gộp các khoảng thời gian chồng nhau (làm 2 việc song song)."""
    intervals = []
    for exp in experiences:
        start = _parse_month(exp.from_date, today, is_end=False)
        end = _parse_month(exp.to_date, today, is_end=True) or (start and today)
        if start and end and end >= start:
            intervals.append((_month_index(start), _month_index(end) + 1))
    if not intervals:
        return None

    intervals.sort()
    months = 0
    current_start, current_end = intervals[0]
    for start, end in intervals[1:]:
        if start <= current_end:
            current_end = max(current_end, end)
        else:
            months += current_end - current_start
            current_start, current_end = start, end
    months += current_end - current_start
    return round(months / 12, 1)


def _month_index(d: date) -> int:
    return d.year * 12 + d.month - 1
