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
from app.schemas.events import (
    CvProfileData,
    CvProfileSkill,
    EduLevel,
    EventEnvelope,
    IndustryRes,
    JobRes,
    JobSkillRes,
    LocationRes,
)
from app.schemas.job import JobSnapshot

__all__ = [
    "CvContent",
    "CvDesired",
    "CvEducation",
    "CvExperience",
    "CvLanguage",
    "CvProfileData",
    "CvProfileSkill",
    "CvProject",
    "CvSchema",
    "CvSkill",
    "CvSnapshot",
    "EduLevel",
    "EventEnvelope",
    "IndustryRes",
    "JobRes",
    "JobSkillRes",
    "JobSnapshot",
    "JobStatus",
    "JobType",
    "Level",
    "LocationRes",
    "WorkMode",
]
