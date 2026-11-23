"""companyId không bắt buộc: job-service có bỏ trường này thì AI vẫn nhận event và vẫn giới hạn
"tối đa 3 job mỗi công ty" (theo tên công ty, hoặc mỗi job một nhóm riêng).
"""

import httpx
import pytest

from app.core.config import Settings
from app.core.container import build_container
from app.ingestion.events import CvEvent, JobEvent
from app.main import create_app
from app.retrieval.service import company_key
from app.schemas import JobRes
from tests.factories import USER_ID, cv_envelope, job_envelope, make_cv_profile, make_job_res


def job_without_company_id(job_id: str, **overrides) -> dict:
    data = make_job_res(job_id, **overrides)
    del data["companyId"]
    return data


def test_event_without_company_id_is_accepted():
    event = JobEvent.model_validate(job_envelope("job.created", job_without_company_id("j1")))
    snap = event.data.to_snapshot()
    assert snap.company_id is None and snap.company_name == "FPT Software"


@pytest.mark.parametrize(
    ("payload", "key"),
    [
        ({"company_id": "c1", "company_name": "FPT", "job_id": "j"}, "id:c1"),
        (
            {"company_id": None, "company_name": "  FPT  Software ", "job_id": "j"},
            "name:fpt software",
        ),
        ({"company_id": None, "company_name": None, "job_id": "j9"}, "job:j9"),
        ({"job_id": "j9"}, "job:j9"),
    ],
)
def test_company_key(payload, key):
    assert company_key(payload) == key


def test_company_id_none_in_job_res():
    assert JobRes.model_validate({**make_job_res("j"), "companyId": None}).company_id is None


@pytest.fixture
async def http():
    container = await build_container(
        Settings(qdrant_url=":memory:", embedding_provider="hashing", embedding_dimension=256)
    )
    jobs = [
        # 5 tin của cùng một công ty (chỉ có tên): tối đa 3 được gợi ý
        *[job_without_company_id(f"fpt-{i}", companyName="FPT Software") for i in range(5)],
        # 4 tin không có cả id lẫn tên công ty: mỗi tin một nhóm, không bị gộp
        *[job_without_company_id(f"anon-{i}", companyName=None) for i in range(4)],
        # vẫn hỗ trợ event có companyId như hiện tại
        *[make_job_res(f"vng-{i}", companyId="vng", companyName="VNG") for i in range(4)],
    ]
    for j in jobs:
        await container.events.handle_job(JobEvent.model_validate(job_envelope("job.created", j)))
    await container.events.handle_cv(
        CvEvent.model_validate(cv_envelope("cv_profile.created", make_cv_profile()))
    )
    app = create_app()
    app.state.container = container
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, container
    await container.close()


async def test_diversification_without_company_id(http):
    client, container = http
    assert container.events  # mọi event đều được nhận (không lỗi validate)
    r = await client.get("/ai/recommendations/jobs", params={"cvId": USER_ID, "limit": 50})
    ids = [i["jobId"] for i in r.json()["items"]]

    assert len([i for i in ids if i.startswith("fpt-")]) == 3
    assert len([i for i in ids if i.startswith("anon-")]) == 4
    assert len([i for i in ids if i.startswith("vng-")]) == 3
