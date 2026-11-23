"""Hợp đồng với job-service: message trên topic job.events (EventEnvelope + JobRes).

Nguồn: backend/job-service/DATAFORAISERVICE.md, JobRes.java, EventEnvelope.java (common-lib).
"""

import json

import httpx
import pytest

from app.core.config import Settings
from app.core.container import build_container
from app.documents import build_job_document
from app.ingestion.events import JobEvent, JobEventType
from app.main import create_app
from app.schemas import JobRes, JobStatus, JobType
from tests.factories import (
    CAU_GIAY_ID,
    HA_NOI_ID,
    IT_ID,
    job_envelope,
    make_cv,
    make_job_res,
)

# Message Kafka y như job-service gửi (Jackson: OffsetDateTime dạng ISO, có thể tới nano giây)
RAW_MESSAGE = """
{
  "eventId": "5f0c6a4e-2b1d-4c8e-9a51-0d3f7e2b9c11",
  "type": "job.created",
  "version": 1,
  "occurredAt": "2026-11-23T13:00:00.123456789+07:00",
  "producer": "job-service",
  "correlationId": null,
  "data": {
    "id": "8b7e2c1a-4f3d-4e2b-9c8a-1d2e3f4a5b6c",
    "companyId": "c0ffee00-0000-4000-8000-000000000001",
    "createdBy": "c0ffee00-0000-4000-8000-000000000002",
    "companyName": "FPT Software",
    "title": "Thực tập sinh Java",
    "description": "<p>Tham gia phát triển <b>REST API</b></p>",
    "level": "INTERN",
    "jobType": "INTERNSHIP",
    "workMode": "ONSITE",
    "location": {"id": "22222222-2222-2222-2222-222222222222", "name": "Cầu Giấy",
                 "parentId": "11111111-1111-1111-1111-111111111111"},
    "industry": {"id": "33333333-3333-3333-3333-333333333333", "name": "Công nghệ thông tin",
                 "parentId": null},
    "salaryMin": null,
    "salaryMax": null,
    "minYearsExp": 0,
    "deadline": "2099-12-31T23:59:59+07:00",
    "status": "OPEN",
    "version": 0,
    "createdAt": "2026-11-23T13:00:00.123456+07:00",
    "updatedAt": "2026-11-23T13:00:00.123456+07:00",
    "publishedAt": "2026-11-23T13:00:00.123456+07:00",
    "skills": [
      {"skill": "Java", "mustHave": true, "required": true},
      {"skill": "SpringBoot", "mustHave": false, "required": true},
      {"skill": "Docker", "mustHave": false, "required": false}
    ]
  }
}
"""


# ---------- Parse message ----------


def test_parse_raw_kafka_message():
    event = JobEvent.model_validate_json(RAW_MESSAGE)

    assert event.type is JobEventType.CREATED
    assert event.event_id == "5f0c6a4e-2b1d-4c8e-9a51-0d3f7e2b9c11"
    assert event.job_id == "8b7e2c1a-4f3d-4e2b-9c8a-1d2e3f4a5b6c"
    assert event.data.job_type is JobType.INTERNSHIP
    assert event.data.location.parent_id == HA_NOI_ID


def test_job_res_to_snapshot():
    snap = JobEvent.model_validate_json(RAW_MESSAGE).data.to_snapshot()

    assert snap.job_id == "8b7e2c1a-4f3d-4e2b-9c8a-1d2e3f4a5b6c"
    assert snap.company_name == "FPT Software"
    assert snap.location == "Cầu Giấy"
    assert (snap.location_id, snap.location_parent_id) == (CAU_GIAY_ID, HA_NOI_ID)
    assert (snap.industry, snap.industry_id) == ("Công nghệ thông tin", IT_ID)
    assert snap.must_have_skills == ["Java"]
    assert snap.required_skills == ["SpringBoot"]
    assert snap.nice_to_have_skills == ["Docker"]
    assert snap.version == 0


def test_payload_for_frontend():
    payload = build_job_document(
        JobEvent.model_validate_json(RAW_MESSAGE).data.to_snapshot()
    ).payload

    assert payload["job_id"] == "8b7e2c1a-4f3d-4e2b-9c8a-1d2e3f4a5b6c"  # = id trong DB job-service
    assert payload["company_name"] == "FPT Software"
    assert payload["location_name"] == "Cầu Giấy"  # giữ nguyên dạng để hiển thị
    assert payload["location"] == "cầu giấy"  # dạng chuẩn hóa để lọc theo tên
    assert payload["location_ids"] == [CAU_GIAY_ID, HA_NOI_ID]
    assert payload["industry_ids"] == [IT_ID]
    assert payload["job_type"] == "INTERNSHIP"
    assert payload["required_skills"] == ["spring boot", "java"]
    assert payload["salary_max"] is None  # lương thỏa thuận
    assert "createdBy" not in payload and "created_by" not in payload


@pytest.mark.parametrize(
    "job_type", ["PART_TIME", "FULL_TIME", "CONTRACT", "INTERNSHIP", "FREELANCE"]
)
def test_all_job_types_of_job_service_are_accepted(job_type):
    assert JobRes.model_validate(make_job_res(jobType=job_type)).job_type == job_type


def test_nullable_fields_and_unknown_fields():
    """Job thiếu location/industry/skills, mustHave/required null, và trường mới chưa biết."""
    res = JobRes.model_validate(
        make_job_res(
            location=None,
            industry=None,
            skills=[{"skill": "Excel", "mustHave": None, "required": None}],
            someNewField="job-service thêm sau",
        )
    )
    snap = res.to_snapshot()
    assert snap.location is None and snap.location_id is None
    assert snap.required_skills == ["Excel"]  # required null coi như bắt buộc
    assert build_job_document(snap).payload["location_ids"] == []

    assert JobRes.model_validate(make_job_res(skills=None)).to_snapshot().required_skills == []


def test_expired_and_status_values():
    for status in ["DRAFT", "OPEN", "CLOSED"]:
        assert JobRes.model_validate(make_job_res(status=status)).status == JobStatus(status)
    event = JobEvent.model_validate(job_envelope("job.expired", make_job_res(status="CLOSED")))
    assert event.type is JobEventType.EXPIRED


# ---------- End-to-end: event job-service -> gợi ý -> FE ----------


@pytest.fixture
async def http():
    container = await build_container(
        Settings(qdrant_url=":memory:", embedding_provider="hashing", embedding_dimension=256)
    )
    hcm_id = "44444444-4444-4444-4444-444444444444"
    finance_id = "55555555-5555-5555-5555-555555555555"
    events = [
        job_envelope("job.created", make_job_res("job-cau-giay")),
        job_envelope(
            "job.created",
            make_job_res(
                "job-ha-noi",
                companyId="company-2",
                location={"id": HA_NOI_ID, "name": "Hà Nội", "parentId": None},
            ),
        ),
        job_envelope(
            "job.created",
            make_job_res(
                "job-hcm",
                companyId="company-3",
                location={"id": hcm_id, "name": "Hồ Chí Minh", "parentId": None},
                industry={"id": finance_id, "name": "Tài chính", "parentId": None},
            ),
        ),
    ]
    for e in events:
        await container.events.handle_job(JobEvent.model_validate(e))
    await container.indexer.index_cvs([make_cv("cv-1")])

    app = create_app()
    app.state.container = container
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, hcm_id, finance_id
    await container.close()


async def ids(client, **params) -> list[str]:
    response = await client.get(
        "/ai/recommendations/jobs", params={"cvId": "cv-1", "limit": 50, **params}
    )
    assert response.status_code == 200, response.text
    return sorted(i["jobId"] for i in response.json()["items"])


async def test_filter_by_location_id_includes_child_locations(http):
    client, hcm_id, _ = http
    # Chọn "Hà Nội" -> ra cả job ở Hà Nội và job ở Cầu Giấy (quận thuộc Hà Nội)
    assert await ids(client, locationId=HA_NOI_ID) == ["job-cau-giay", "job-ha-noi"]
    assert await ids(client, locationId=CAU_GIAY_ID) == ["job-cau-giay"]
    assert await ids(client, locationId=hcm_id) == ["job-hcm"]
    assert await ids(client, locationId=[CAU_GIAY_ID, hcm_id]) == ["job-cau-giay", "job-hcm"]


async def test_filter_by_industry_id(http):
    client, _, finance_id = http
    assert await ids(client, industryId=finance_id) == ["job-hcm"]
    assert await ids(client, industryId=IT_ID) == ["job-cau-giay", "job-ha-noi"]


async def test_response_has_what_frontend_needs(http):
    client, _, _ = http
    response = await client.get("/ai/recommendations/jobs", params={"cvId": "cv-1"})
    item = next(i for i in response.json()["items"] if i["jobId"] == "job-cau-giay")
    job = item["job"]

    # jobId dùng thẳng cho GET /jobs/{id} (job-service) và POST /applications (application-service)
    assert item["jobId"] == job["job_id"] == "job-cau-giay"
    assert job["company_name"] == "FPT Software"
    assert job["location_name"] == "Cầu Giấy"
    assert job["industry_name"] == "Công nghệ thông tin"
    assert {"title", "salary_min", "salary_max", "work_mode", "level", "deadline_ts"} <= set(job)
    json.dumps(item)  # serialize được


def test_invalid_message_is_rejected_at_parse_time():
    """Message sai phải lỗi ngay lúc parse (422 / DLQ), không được lọt tới bước index (500)."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="salaryMin"):
        JobEvent.model_validate(
            job_envelope("job.updated", make_job_res(salaryMin=50_000_000, salaryMax=1))
        )
