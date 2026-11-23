"""Dữ liệu mẫu dùng chung cho test."""

import uuid
from datetime import UTC, datetime, timedelta

from app.schemas import CvSnapshot, JobSnapshot


def iso(days_from_now: float) -> str:
    return (datetime.now(UTC) + timedelta(days=days_from_now)).isoformat()


def make_job(job_id: str = "job-1", **overrides) -> JobSnapshot:
    data = {
        "jobId": job_id,
        "companyId": "company-1",
        "title": "Senior Java Backend Developer",
        "description": "Phát triển hệ thống microservices với Spring Boot và Kafka.",
        "level": "SENIOR",
        "industry": "IT-Software",
        "jobType": "FULL_TIME",
        "workMode": "HYBRID",
        "location": "Hà Nội",
        "salaryMin": 30_000_000,
        "salaryMax": 50_000_000,
        "minYearsExp": 3,
        "requiredSkills": ["java", "spring boot", "postgresql", "kafka"],
        "niceToHaveSkills": ["kubernetes"],
        "deadline": iso(30),
        "publishedAt": iso(-1),
    }
    data.update(overrides)
    return JobSnapshot.model_validate(data)


def make_cv(cv_id: str = "cv-1", **overrides) -> CvSnapshot:
    data = {
        "cvId": cv_id,
        "userId": "user-1",
        "searchable": True,
        "updatedAt": iso(0),
        "headline": "Java Backend Developer",
        "location": "Hà Nội",
        "yearsExperience": 4,
        "level": "SENIOR",
        "skills": [{"name": n} for n in ["java", "spring boot", "postgresql", "kafka", "docker"]],
        "desired": {"salaryMin": 35_000_000, "jobType": "FULL_TIME", "locations": ["Hà Nội"]},
    }
    data.update(overrides)
    return CvSnapshot.model_validate(data)


# ---------- Message thật của job-service (EventEnvelope + JobRes), xem DATAFORAISERVICE.md

HA_NOI_ID = "11111111-1111-1111-1111-111111111111"
CAU_GIAY_ID = "22222222-2222-2222-2222-222222222222"  # quận thuộc Hà Nội
IT_ID = "33333333-3333-3333-3333-333333333333"


def make_job_res(job_id: str = "job-1", **overrides) -> dict:
    """JSON `JobRes` đúng như job-service serialize (camelCase, location/industry là object)."""
    data = {
        "id": job_id,
        "companyId": "company-1",
        "createdBy": "hr-1",
        "companyName": "FPT Software",
        "title": "Senior Java Backend Developer",
        "description": "Phát triển hệ thống microservices với Spring Boot và Kafka.",
        "level": "SENIOR",
        "jobType": "FULL_TIME",
        "workMode": "HYBRID",
        "location": {"id": CAU_GIAY_ID, "name": "Cầu Giấy", "parentId": HA_NOI_ID},
        "industry": {"id": IT_ID, "name": "Công nghệ thông tin", "parentId": None},
        "salaryMin": 30_000_000,
        "salaryMax": 50_000_000,
        "minYearsExp": 3,
        "deadline": iso(30),
        "status": "OPEN",
        "version": 0,
        "createdAt": iso(-1),
        "updatedAt": iso(-1),
        "publishedAt": iso(-1),
        "skills": [
            {"skill": "Java", "mustHave": True, "required": True},
            {"skill": "Spring Boot", "mustHave": False, "required": True},
            {"skill": "PostgreSQL", "mustHave": False, "required": True},
            {"skill": "Kafka", "mustHave": False, "required": True},
            {"skill": "Kubernetes", "mustHave": False, "required": False},
        ],
    }
    data.update(overrides)
    return data


def job_envelope(type_: str, data: dict, event_id: str | None = None) -> dict:
    """EventEnvelope của common-lib: type là "job.created", "job.updated"..."""

    return {
        "eventId": event_id or str(uuid.uuid4()),
        "type": type_,
        "version": 1,
        "occurredAt": iso(0),
        "producer": "job-service",
        "correlationId": "corr-1",
        "data": data,
    }
