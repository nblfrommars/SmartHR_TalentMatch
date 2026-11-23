"""Hợp đồng với user-cv: message trên topic cv.profile.events (EventEnvelope + CVProfileEventData).

Nguồn: backend/user-cv/src/main/java/com/hr/user/cv/event/ (CVProfileEventData, CVProfileEventType)
và enums/EduLevel.java (Jackson gửi eduLevel dạng số nhờ @JsonValue).
"""

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.container import build_container
from app.documents import build_cv_document
from app.ingestion.events import CvEvent, CvEventType, JobEvent
from app.main import create_app
from app.schemas import CvProfileData, EduLevel, Level
from tests.factories import USER_ID, cv_envelope, job_envelope, make_cv_profile, make_job_res

# Message Kafka y như user-cv gửi
RAW_MESSAGE = """
{
  "eventId": "9a1b2c3d-0000-4000-8000-00000000abcd",
  "type": "cv_profile.created",
  "version": 1,
  "occurredAt": "2026-11-23T20:15:00.123456789+07:00",
  "producer": "user-service",
  "correlationId": "corr-xyz",
  "data": {
    "userId": "aaaaaaaa-0000-4000-8000-000000000001",
    "positionId": 12,
    "workLocationId": 1,
    "cvAttachmentId": "bbbbbbbb-0000-4000-8000-000000000002",
    "cvAttachmentUrl": "http://minio:9000/cv-files/abc.pdf?X-Amz-Signature=secret",
    "summary": "Sinh viên năm cuối, liên hệ sv@hust.edu.vn hoặc 0912345678. Làm đồ án REST API.",
    "eduLevel": 6,
    "education": "Đại học Bách khoa Hà Nội - Công nghệ thông tin",
    "skills": [
      {"skill": "Java", "yearsOfExperience": 1},
      {"skill": "SpringBoot", "yearsOfExperience": 0},
      {"skill": "ReactJS", "yearsOfExperience": 0}
    ]
  }
}
"""


# ---------- Parse message ----------


def test_parse_raw_kafka_message():
    event = CvEvent.model_validate_json(RAW_MESSAGE)

    assert event.type is CvEventType.CREATED
    assert event.cv_id == USER_ID  # một User một CV: cvId chính là userId
    assert event.data.edu_level is EduLevel.STUDENT
    assert event.data.position_id == 12


def test_cv_profile_to_snapshot():
    event = CvEvent.model_validate_json(RAW_MESSAGE)
    snap = event.data.to_snapshot(updated_at=event.occurred_at)

    assert snap.cv_id == snap.user_id == USER_ID
    assert snap.level is Level.INTERN  # eduLevel STUDENT
    assert snap.years_experience == 1  # số năm lớn nhất trong các skill
    assert [s.name for s in snap.skills] == ["Java", "SpringBoot", "ReactJS"]
    assert snap.education[0].degree == "Sinh viên"
    assert snap.education[0].major == "Đại học Bách khoa Hà Nội - Công nghệ thông tin"
    assert snap.searchable is False
    assert snap.updated_at == event.occurred_at


def test_document_and_payload():
    event = CvEvent.model_validate_json(RAW_MESSAGE)
    doc = build_cv_document(event.data.to_snapshot(updated_at=event.occurred_at))

    # summary vào dense, đã loại PII
    assert "Summary: Sinh viên năm cuối" in doc.dense_text
    assert "sv@hust.edu.vn" not in doc.dense_text and "0912345678" not in doc.dense_text
    # summary + chuyên ngành vào sparse (tách từ tiếng Việt)
    tokens = set(doc.sparse_text.split())
    assert {"java", "spring_boot", "react", "đồ_án", "công_nghệ"} <= tokens

    payload = doc.payload
    assert payload["skills"] == ["java", "spring boot", "react"]
    assert payload["edu_level"] == "STUDENT"
    assert (payload["position_id"], payload["work_location_id"]) == (12, 1)
    # Link MinIO ký sẵn (bí mật, hết hạn sau 5 phút) không được lưu vào Qdrant
    assert "secret" not in str(payload) and "cv_attachment_url" not in payload


@pytest.mark.parametrize(
    ("value", "level"),
    [(0, None), (4, None), (5, None), (6, Level.INTERN), (7, None)],
)
def test_edu_level_numbers(value, level):
    data = CvProfileData.model_validate(make_cv_profile(eduLevel=value))
    assert data.edu_level == EduLevel(value)
    assert data.to_snapshot().level == level


def test_minimal_profile_and_unknown_fields():
    """CV mới tạo gần như trống: không skill, không học vấn; user-cv thêm trường mới."""
    data = CvProfileData.model_validate(
        {"userId": USER_ID, "skills": None, "eduLevel": None, "newField": 1}
    )
    snap = data.to_snapshot()
    assert snap.skills == [] and snap.education == [] and snap.years_experience is None
    assert build_cv_document(snap).payload["skills"] == []


def test_naive_occurred_at_is_treated_as_utc():
    event = CvEvent.model_validate(
        {
            **cv_envelope("cv_profile.updated", make_cv_profile()),
            "occurredAt": "2026-11-23T13:00:00",
        }
    )
    snap = event.data.to_snapshot(updated_at=event.occurred_at)
    assert snap.updated_at.tzinfo is not None


def test_invalid_messages_rejected():
    with pytest.raises(ValidationError):
        CvEvent.model_validate(cv_envelope("cv_profile.created", make_cv_profile(userId=None)))
    with pytest.raises(ValidationError):
        CvEvent.model_validate(
            cv_envelope(
                "cv_profile.created",
                make_cv_profile(skills=[{"skill": "Java", "yearsOfExperience": -1}]),
            )
        )


# ---------- End-to-end: job-service + user-cv -> gợi ý / tìm ứng viên ----------


@pytest.fixture
async def http():
    container = await build_container(
        Settings(
            qdrant_url=":memory:",
            embedding_provider="hashing",
            embedding_dimension=256,
            cv_searchable_default=True,
        )
    )
    jobs = [
        make_job_res(
            "job-intern",
            title="Thực tập sinh Java Spring Boot",
            level="INTERN",
            jobType="INTERNSHIP",
            minYearsExp=0,
            skills=[
                {"skill": "Java", "mustHave": True, "required": True},
                {"skill": "Spring Boot", "mustHave": False, "required": True},
            ],
        ),
        make_job_res(
            "job-accountant",
            companyId="company-2",
            title="Kế toán",
            description="Lập báo cáo tài chính",
            skills=[{"skill": "Excel", "mustHave": True, "required": True}],
        ),
    ]
    for j in jobs:
        await container.events.handle_job(JobEvent.model_validate(job_envelope("job.created", j)))
    await container.events.handle_cv(CvEvent.model_validate_json(RAW_MESSAGE))

    app = create_app()
    app.state.container = container
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
    await container.close()


async def test_student_from_user_cv_gets_internship(http):
    # FE gọi bằng userId (= cvId)
    response = await http.get("/ai/recommendations/jobs", params={"cvId": USER_ID})
    assert response.status_code == 200
    items = response.json()["items"]
    ids = [i["jobId"] for i in items]

    assert ids[0] == "job-intern"
    assert "job-accountant" not in ids  # thiếu skill must_have (excel)
    assert items[0]["explanation"]["matchSummary"].startswith("Bạn có 2/2 kỹ năng bắt buộc")
    assert items[0]["breakdown"]["level"] == 1.0  # INTERN khớp INTERN


async def test_hr_finds_candidate_from_user_cv(http):
    response = await http.get("/ai/search/candidates", params={"jobId": "job-intern"})
    items = response.json()["items"]

    assert [i["cvId"] for i in items] == [USER_ID]
    assert items[0]["candidate"]["user_id"] == USER_ID
    assert "sv@hust.edu.vn" not in str(items[0])
