from typing import Self

from pydantic import AwareDatetime, Field, NonNegativeInt, model_validator

from app.schemas.common import CamelModel, JobStatus, JobType, Level, WorkMode


class JobSnapshot(CamelModel):
    """Mô hình job nội bộ của ai-matching (dựng document, chấm điểm).

    Event thật từ job-service là `JobRes` (app/schemas/job_events.py), được chuyển sang đây bằng
    `JobRes.to_snapshot()`.
    """

    job_id: str
    company_id: str
    company_name: str | None = None
    title: str = Field(min_length=1)
    description: str = ""
    status: JobStatus = JobStatus.OPEN
    level: Level | None = None
    industry: str | None = None
    job_type: JobType | None = None
    work_mode: WorkMode | None = None
    location: str | None = None
    # id của location/industry ở job-service, kèm id cấp cha (tỉnh/thành, ngành lớn) để lọc theo cây
    location_id: str | None = None
    location_parent_id: str | None = None
    industry_id: str | None = None
    industry_parent_id: str | None = None
    salary_min: NonNegativeInt | None = None
    salary_max: NonNegativeInt | None = None
    min_years_exp: NonNegativeInt | None = None
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    must_have_skills: list[str] = Field(default_factory=list)
    deadline: AwareDatetime
    published_at: AwareDatetime | None = None
    # Số phiên bản tăng dần mỗi lần sửa job (optimistic lock của job-service), dùng bỏ event cũ
    version: NonNegativeInt | None = None

    @model_validator(mode="after")
    def _check_salary_range(self) -> Self:
        if (
            self.salary_min is not None
            and self.salary_max is not None
            and self.salary_min > self.salary_max
        ):
            raise ValueError("salaryMin phải nhỏ hơn hoặc bằng salaryMax")
        return self
