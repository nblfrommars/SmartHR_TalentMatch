import pytest
from pydantic import ValidationError

from app.documents import build_cv_document, build_job_document
from app.schemas import CvSnapshot, JobSnapshot


def make_job(**overrides) -> JobSnapshot:
    data = {
        "jobId": "job-1",
        "companyId": "company-1",
        "title": "Senior Java Backend Developer",
        "description": (
            "<p>Phát triển hệ thống <b>microservices</b> với Spring Boot &amp; Kafka.</p>"
            "<p>Liên hệ: hr@abc.vn hoặc 0912.345.678</p>"
        ),
        "level": "SENIOR",
        "industry": "IT-Software",
        "jobType": "FULL_TIME",
        "workMode": "HYBRID",
        "location": "  Hà Nội ",
        "salaryMin": 30_000_000,
        "salaryMax": 50_000_000,
        "minYearsExp": 3,
        "requiredSkills": ["Java", "SpringBoot", "Postgres", "kafka"],
        "niceToHaveSkills": ["k8s", "AWS", "java"],
        "mustHaveSkills": ["Docker"],
        "deadline": "2026-12-31T23:59:59+07:00",
        "publishedAt": "2026-11-15T09:00:00+07:00",
    }
    data.update(overrides)
    return JobSnapshot.model_validate(data)


def make_cv(**overrides) -> CvSnapshot:
    data = {
        "cvId": "cv-1",
        "userId": "user-1",
        "searchable": True,
        "updatedAt": "2026-11-15T10:00:00Z",
        "fullName": "Nguyễn Văn An",
        "email": "an.nguyen@gmail.com",
        "phone": "0987654321",
        "headline": "Lập trình viên Java Backend",
        "location": "Hà Nội",
        "yearsExperience": 3.5,
        "level": "MIDDLE",
        "skills": [{"name": "Spring-Boot", "years": 3}, {"name": "PostgreSQL"}, {"name": "C#"}],
        "experiences": [
            {
                "company": "ABC Corp",
                "title": "Backend Developer",
                "from": "2022-01",
                "to": "present",
                "summary": "Xây dựng API thanh toán. Liên hệ an.nguyen@gmail.com",
            }
        ],
        "education": [{"school": "HUST", "degree": "Bachelor", "major": "Computer Science"}],
        "certifications": ["AWS Solutions Architect Associate"],
        "languages": [{"name": "English", "level": "IELTS 6.5"}],
        "desired": {
            "salaryMin": 25_000_000,
            "jobType": "FULL_TIME",
            "workMode": "HYBRID",
            "locations": ["Hà Nội", " Remote "],
        },
    }
    data.update(overrides)
    return CvSnapshot.model_validate(data)


# ---------- Job ----------


def test_job_dense_text_follows_architecture_format():
    doc = build_job_document(make_job())

    assert doc.dense_text.splitlines()[:4] == [
        "Title: Senior Java Backend Developer",
        "Level: SENIOR | Industry: IT-Software | Type: FULL_TIME",
        "Required skills: java, spring boot, postgresql, kafka, docker",
        "Nice to have: kubernetes, aws",
    ]
    assert "Description: Phát triển hệ thống microservices với Spring Boot & Kafka." in (
        doc.dense_text
    )


def test_job_skills_are_normalized_and_must_have_is_required():
    payload = build_job_document(make_job()).payload

    assert payload["required_skills"] == ["java", "spring boot", "postgresql", "kafka", "docker"]
    assert payload["must_have_skills"] == ["docker"]
    # "java" đã nằm trong required nên không lặp lại ở nice-to-have
    assert payload["nice_skills"] == ["kubernetes", "aws"]


def test_job_sparse_text_has_skill_and_vietnamese_tokens():
    tokens = build_job_document(make_job()).sparse_text.split()

    assert {"spring_boot", "postgresql", "kubernetes", "phát_triển", "hệ_thống"} <= set(tokens)


def test_job_payload_fields():
    doc = build_job_document(make_job())

    assert doc.id == "job-1"
    assert doc.payload["status"] == "OPEN"
    assert doc.payload["deadline_ts"] == "2026-12-31T16:59:59+00:00"
    assert doc.payload["published_ts"] == "2026-11-15T02:00:00+00:00"
    assert doc.payload["location"] == "hà nội"
    assert doc.payload["industry"] == "it-software"
    assert doc.payload["embedding_version"] == "text-embedding-3-small@v1"
    assert all(not hasattr(v, "value") for v in doc.payload.values())


def test_job_contacts_never_reach_index():
    doc = build_job_document(make_job())

    for pii in ["hr@abc.vn", "0912.345.678", "0912"]:
        assert pii not in doc.dense_text
        assert pii not in doc.sparse_text


def test_job_description_is_truncated(monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "document_max_chars", 50)
    doc = build_job_document(make_job(description="phát triển " * 100))

    description = doc.dense_text.split("Description: ", 1)[1]
    assert len(description) <= 50


def test_job_rejects_inverted_salary():
    with pytest.raises(ValidationError, match="salaryMin"):
        make_job(salaryMin=60_000_000, salaryMax=50_000_000)


def test_job_rejects_naive_deadline():
    with pytest.raises(ValidationError):
        make_job(deadline="2026-12-31T23:59:59")


def test_job_accepts_snake_case_too():
    job = JobSnapshot.model_validate(
        {"job_id": "j", "company_id": "c", "title": "Dev", "deadline": "2026-12-31T00:00:00Z"}
    )

    doc = build_job_document(job)
    assert doc.dense_text == "Title: Dev"
    assert doc.payload["required_skills"] == []


# ---------- CV ----------


def test_cv_never_contains_pii():
    doc = build_cv_document(make_cv())
    everything = doc.dense_text + doc.sparse_text + str(doc.payload)

    for pii in ["Nguyễn Văn An", "an.nguyen@gmail.com", "0987654321"]:
        assert pii not in everything


def test_cv_dense_text():
    doc = build_cv_document(make_cv())

    assert doc.dense_text.splitlines()[:5] == [
        "Headline: Lập trình viên Java Backend",
        "Level: MIDDLE | Experience: 3.5 years",
        "Skills: spring boot, postgresql, c#",
        "Certifications: aws saa",
        "Languages: English (IELTS 6.5)",
    ]
    assert "- Backend Developer at ABC Corp (2022-01 – present): Xây dựng API" in doc.dense_text
    assert "Education: Bachelor Computer Science" in doc.dense_text


def test_cv_sparse_text_matches_architecture_example():
    assert build_cv_document(make_cv()).sparse_text.split() == [
        "spring_boot",
        "postgresql",
        "c_sharp",
        "aws_saa",
        "lập_trình_viên",
        "java",
        "backend",
        "computer",  # chuyên ngành "Computer Science"
        "science",
    ]


def test_cv_payload():
    payload = build_cv_document(make_cv()).payload

    assert payload["cv_id"] == "cv-1"
    assert payload["searchable"] is True
    assert payload["skills"] == ["spring boot", "postgresql", "c#"]
    assert payload["desired_locations"] == ["hà nội", "remote"]
    assert payload["desired_job_type"] == "FULL_TIME"
    assert payload["updated_ts"] == "2026-11-15T10:00:00+00:00"


def test_cv_minimal():
    cv = CvSnapshot.model_validate(
        {"cvId": "cv-2", "userId": "u", "updatedAt": "2026-11-15T10:00:00Z"}
    )

    doc = build_cv_document(cv)
    assert doc.dense_text == ""
    assert doc.sparse_text == ""
    assert doc.payload["searchable"] is False
