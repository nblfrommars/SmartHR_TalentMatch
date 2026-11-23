"""Dữ liệu mẫu dùng chung cho test."""

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
