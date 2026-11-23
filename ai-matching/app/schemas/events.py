"""Hợp đồng message Kafka mà các service backend gửi sang ai-matching.

- `EventEnvelope`: "phong bì" chung của mọi event, khớp `EventEnvelope.java` trong common-lib.
- `JobRes` (+ `LocationRes`, `IndustryRes`, `JobSkillRes`): phần `data` của event `job.events`,
  khớp DTO `dto/res` của job-service (xem backend/job-service/DATAFORAISERVICE.md).
- `CvProfileData` (+ `CvProfileSkill`, `EduLevel`): phần `data` của event `cv.profile.events`,
  khớp `CVProfileEventData.java` của user-cv (backend/user-cv/.../event/).

Các model chỉ đọc những trường ai-matching cần; trường thừa (createdBy, createdAt...) bị bỏ qua
(`extra="ignore"` của CamelModel), nên job-service thêm trường mới không làm vỡ ai-matching.
"""

from datetime import UTC, datetime
from enum import IntEnum
from typing import Generic, Self, TypeVar

from pydantic import AwareDatetime, Field, NonNegativeInt, model_validator

from app.schemas.common import CamelModel, JobStatus, JobType, Level, WorkMode
from app.schemas.cv import CvEducation, CvSkill, CvSnapshot
from app.schemas.job import JobSnapshot

T = TypeVar("T")


class EventEnvelope(CamelModel, Generic[T]):  # noqa: UP046 (Python 3.11 chưa có cú pháp [T])
    """{eventId, type, version, occurredAt, producer, correlationId, data}."""

    event_id: str
    type: str
    version: int = 1
    occurred_at: datetime | None = None
    producer: str | None = None
    correlation_id: str | None = None
    data: T


# ---------- job-service: JobRes ----------


class RefRes(CamelModel):
    """Dữ liệu tham chiếu dạng cây (LocationRes, IndustryRes): {id, name, parentId}."""

    id: str
    name: str
    parent_id: str | None = None


class LocationRes(RefRes):
    pass


class IndustryRes(RefRes):
    pass


class JobSkillRes(CamelModel):
    skill: str = Field(min_length=1)
    must_have: bool | None = False
    required: bool | None = True


class JobRes(CamelModel):
    id: str
    # DATAFORAISERVICE.md không liệt kê companyId nhưng JobRes.java vẫn gửi. Không bắt buộc, để
    # job-service có bỏ trường này thì event vẫn được nhận (không rơi hết vào DLQ)
    company_id: str | None = None
    company_name: str | None = None
    title: str = Field(min_length=1)
    description: str | None = ""
    level: Level | None = None
    job_type: JobType | None = None
    work_mode: WorkMode | None = None
    location: LocationRes | None = None
    industry: IndustryRes | None = None
    salary_min: NonNegativeInt | None = None
    salary_max: NonNegativeInt | None = None
    min_years_exp: NonNegativeInt | None = None
    deadline: AwareDatetime
    status: JobStatus = JobStatus.OPEN
    version: NonNegativeInt | None = None
    published_at: AwareDatetime | None = None
    skills: list[JobSkillRes] | None = None

    @model_validator(mode="after")
    def _check_salary_range(self) -> Self:
        # Kiểm tra ngay lúc parse message (giống JobSnapshot), để message sai bị từ chối sớm
        # (422 / đưa vào DLQ) thay vì làm lỗi 500 ở bước xử lý
        if (
            self.salary_min is not None
            and self.salary_max is not None
            and self.salary_min > self.salary_max
        ):
            raise ValueError("salaryMin phải nhỏ hơn hoặc bằng salaryMax")
        return self

    def to_snapshot(self) -> JobSnapshot:
        """Chuyển sang mô hình nội bộ. Phân loại skill:
        mustHave=true -> must_have; required=true -> required; còn lại -> nice_to_have.
        """
        must_have: list[str] = []
        required: list[str] = []
        nice: list[str] = []
        for s in self.skills or []:
            if s.must_have:
                must_have.append(s.skill)
            elif s.required is not False:  # null coi như bắt buộc (mặc định của job-service)
                required.append(s.skill)
            else:
                nice.append(s.skill)

        return JobSnapshot(
            job_id=self.id,
            company_id=self.company_id,
            company_name=self.company_name,
            title=self.title,
            description=self.description or "",
            status=self.status,
            level=self.level,
            industry=self.industry.name if self.industry else None,
            industry_id=self.industry.id if self.industry else None,
            industry_parent_id=self.industry.parent_id if self.industry else None,
            job_type=self.job_type,
            work_mode=self.work_mode,
            location=self.location.name if self.location else None,
            location_id=self.location.id if self.location else None,
            location_parent_id=self.location.parent_id if self.location else None,
            salary_min=self.salary_min,
            salary_max=self.salary_max,
            min_years_exp=self.min_years_exp,
            required_skills=required,
            nice_to_have_skills=nice,
            must_have_skills=must_have,
            deadline=self.deadline,
            published_at=self.published_at,
            version=self.version,
        )


# ---------- user-cv: CVProfileEventData ----------


class EduLevel(IntEnum):
    """Khớp enum EduLevel của user-cv. Jackson gửi dạng SỐ (do @JsonValue getValue())."""

    LOWER_SECONDARY = 0
    UPPER_SECONDARY = 1
    INTERMEDIATE = 2
    JUNIORCOLLEGE = 3
    COLLEGE = 4
    POSTGRADUATE = 5
    STUDENT = 6
    OTHER = 7

    @property
    def label(self) -> str:
        return _EDU_LABELS[self]


_EDU_LABELS = {
    EduLevel.LOWER_SECONDARY: "Đã tốt nghiệp THCS",
    EduLevel.UPPER_SECONDARY: "Đã tốt nghiệp THPT",
    EduLevel.INTERMEDIATE: "Tốt nghiệp trung cấp",
    EduLevel.JUNIORCOLLEGE: "Tốt nghiệp cao đẳng",
    EduLevel.COLLEGE: "Tốt nghiệp đại học",
    EduLevel.POSTGRADUATE: "Cao học",
    EduLevel.STUDENT: "Sinh viên",
    EduLevel.OTHER: "Khác",
}


class CvProfileSkill(CamelModel):
    skill: str = Field(min_length=1)
    years_of_experience: NonNegativeInt | None = None


class CvProfileData(CamelModel):
    """Mỗi User có đúng một CV profile, khóa chính là userId nên cvId = userId.

    Không dùng cvAttachmentUrl (link MinIO ký sẵn, hết hạn sau 5 phút) và không lưu nó vào Qdrant.
    """

    user_id: str
    position_id: int | None = None
    work_location_id: int | None = None
    cv_attachment_id: str | None = None
    summary: str | None = None
    edu_level: EduLevel | None = None
    education: str | None = None
    skills: list[CvProfileSkill] | None = None

    def to_snapshot(
        self, updated_at: datetime | None = None, searchable: bool = False
    ) -> CvSnapshot:
        if updated_at is not None and updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=UTC)  # occurredAt thiếu múi giờ: coi là UTC
        skills = self.skills or []
        years = [s.years_of_experience for s in skills if s.years_of_experience is not None]
        education = (
            # education là văn bản tự do (trường/ngành): đặt vào major để được tách từ vào sparse
            [
                CvEducation(
                    degree=self.edu_level.label if self.edu_level else None, major=self.education
                )
            ]
            if self.education or self.edu_level is not None
            else []
        )
        return CvSnapshot(
            cv_id=self.user_id,
            user_id=self.user_id,
            searchable=searchable,
            updated_at=updated_at or datetime.now(UTC),
            summary=self.summary,
            # Số năm kinh nghiệm ước lượng = số năm lớn nhất trong các skill
            years_experience=max(years) if years else None,
            # Chỉ suy ra cấp bậc khi chắc chắn (đang là sinh viên); còn lại để trống (trung tính)
            level=Level.INTERN if self.edu_level == EduLevel.STUDENT else None,
            skills=[CvSkill(name=s.skill, years=s.years_of_experience) for s in skills],
            education=education,
            position_id=self.position_id,
            work_location_id=self.work_location_id,
            edu_level=self.edu_level.name if self.edu_level is not None else None,
        )
