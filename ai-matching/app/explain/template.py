"""Giải thích kết quả match bằng template (không cần LLM).

Đây là bản giải thích mặc định và cũng là đường lui khi LLM lỗi/chậm (graceful degradation).
Bản LLM (gpt-4o-mini) ở bước sau chỉ viết lại match_summary cho tự nhiên hơn; matched_skills /
missing_skills luôn do code tính.
"""

from typing import Literal

from pydantic import BaseModel

from app.retrieval.scoring import Breakdown, SkillMatch


class Explanation(BaseModel):
    match_summary: str
    matched_skills: list[str]
    missing_skills: list[str]
    nice_to_have_matched: list[str]
    suggestion: str | None = None
    # "llm": match_summary / suggestion do LLM viết lại; các danh sách skill luôn do code tính
    source: Literal["template", "llm"] = "template"


def _skill_sentence(subject: str, skills: SkillMatch) -> str:
    total = len(skills.matched) + len(skills.missing)
    if total == 0:
        return "Job không yêu cầu kỹ năng bắt buộc cụ thể."
    sentence = f"{subject} có {len(skills.matched)}/{total} kỹ năng bắt buộc"
    if skills.matched:
        sentence += f" ({', '.join(skills.matched)})"
    sentence += "."
    if skills.missing:
        sentence += f" Còn thiếu: {', '.join(skills.missing)}."
    if skills.nice_matched:
        sentence += f" Có thêm kỹ năng cộng điểm: {', '.join(skills.nice_matched)}."
    return sentence


def _fit_notes(breakdown: Breakdown) -> list[str]:
    notes = []
    if breakdown.level == 1.0:
        notes.append("Cấp bậc phù hợp.")
    elif breakdown.level == 0.0:
        notes.append("Cấp bậc chênh lệch nhiều.")
    if breakdown.exp < 1.0:
        notes.append("Số năm kinh nghiệm có thể chưa đạt yêu cầu tối thiểu.")
    if breakdown.salary < 0.5:
        notes.append("Mức lương job thấp hơn mong muốn.")
    return notes


def explain_for_candidate(skills: SkillMatch, breakdown: Breakdown) -> Explanation:
    """Giải thích cho User: vì sao job này được gợi ý."""
    summary = " ".join([_skill_sentence("Bạn", skills), *_fit_notes(breakdown)])
    suggestion = (
        f"Bổ sung kinh nghiệm hoặc dự án có dùng {', '.join(skills.missing[:3])}."
        if skills.missing
        else None
    )
    return Explanation(
        match_summary=summary,
        matched_skills=skills.matched,
        missing_skills=skills.missing,
        nice_to_have_matched=skills.nice_matched,
        suggestion=suggestion,
    )


def explain_for_recruiter(skills: SkillMatch, breakdown: Breakdown) -> Explanation:
    """Giải thích cho HR: vì sao ứng viên này phù hợp với job."""
    summary = " ".join([_skill_sentence("Ứng viên", skills), *_fit_notes(breakdown)])
    return Explanation(
        match_summary=summary,
        matched_skills=skills.matched,
        missing_skills=skills.missing,
        nice_to_have_matched=skills.nice_matched,
    )
