"""CV có cấu trúc theo CvSchema (ARCHITECTURE.md mục 3.5).

- CvContent: phần nội dung KHÔNG chứa PII, dùng để dựng document index.
- CvSchema: kết quả parse PDF trả cho User xem lại, có thêm full_name/email/phone.
- CvSnapshot: snapshot trong event cv.events (không PII) + id, version.
"""

from pydantic import AwareDatetime, Field, NonNegativeFloat, NonNegativeInt

from app.schemas.common import CamelModel, JobType, Level, WorkMode


class CvSkill(CamelModel):
    name: str = Field(min_length=1)
    years: NonNegativeFloat | None = None


class CvExperience(CamelModel):
    company: str | None = None
    title: str | None = None
    from_date: str | None = Field(default=None, alias="from")  # "2022-01"
    to_date: str | None = Field(default=None, alias="to")  # "2024-06" hoặc "present"
    summary: str | None = None


class CvEducation(CamelModel):
    school: str | None = None
    degree: str | None = None
    major: str | None = None
    year: int | None = None


class CvLanguage(CamelModel):
    name: str
    level: str | None = None


class CvDesired(CamelModel):
    salary_min: NonNegativeInt | None = None
    job_type: JobType | None = None
    work_mode: WorkMode | None = None
    locations: list[str] = Field(default_factory=list)


class CvContent(CamelModel):
    headline: str | None = None
    location: str | None = None
    years_experience: NonNegativeFloat | None = None
    level: Level | None = None
    skills: list[CvSkill] = Field(default_factory=list)
    experiences: list[CvExperience] = Field(default_factory=list)
    education: list[CvEducation] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    languages: list[CvLanguage] = Field(default_factory=list)
    desired: CvDesired = Field(default_factory=CvDesired)


class CvSchema(CvContent):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None


class CvSnapshot(CvContent):
    cv_id: str
    user_id: str
    searchable: bool = False
    version: int = 1
    updated_at: AwareDatetime
