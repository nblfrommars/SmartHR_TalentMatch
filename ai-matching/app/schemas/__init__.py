"""Schema dữ liệu ai-matching nhận vào (snapshot trong job.events / cv.events, kết quả parse CV)."""

from app.schemas.common import JobStatus, JobType, Level, WorkMode
from app.schemas.cv import (
    CvContent,
    CvDesired,
    CvEducation,
    CvExperience,
    CvLanguage,
    CvProject,
    CvSchema,
    CvSkill,
    CvSnapshot,
)
from app.schemas.job import JobSnapshot

__all__ = [
    "CvContent",
    "CvDesired",
    "CvEducation",
    "CvExperience",
    "CvLanguage",
    "CvProject",
    "CvSchema",
    "CvSkill",
    "CvSnapshot",
    "JobSnapshot",
    "JobStatus",
    "JobType",
    "Level",
    "WorkMode",
]
