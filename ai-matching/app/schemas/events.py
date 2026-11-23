"""Hợp đồng message Kafka mà các service backend gửi sang ai-matching.

- `EventEnvelope`: "phong bì" chung của mọi event, khớp `EventEnvelope.java` trong common-lib.
- `JobRes` (+ `LocationRes`, `IndustryRes`, `JobSkillRes`): phần `data` của event `job.events`,
  khớp DTO `dto/res` của job-service (xem backend/job-service/DATAFORAISERVICE.md).

Các model chỉ đọc những trường ai-matching cần; trường thừa (createdBy, createdAt...) bị bỏ qua
(`extra="ignore"` của CamelModel), nên job-service thêm trường mới không làm vỡ ai-matching.
"""

from datetime import datetime
from typing import Generic, Self, TypeVar

from pydantic import AwareDatetime, Field, NonNegativeInt, model_validator

from app.schemas.common import CamelModel, JobStatus, JobType, Level, WorkMode
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
    company_id: str
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
