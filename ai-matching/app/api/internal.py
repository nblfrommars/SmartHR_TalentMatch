"""API nội bộ nhận event qua HTTP, thay cho Kafka khi dev/test (Kafka consumer chưa có).

Chỉ bật khi AI_INTERNAL_API_ENABLED=true. KHÔNG mở route này qua API gateway.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.container import Container, get_container
from app.ingestion.events import CvEvent, JobEvent
from app.schemas.common import CamelModel

router = APIRouter(prefix="/ai/internal", tags=["internal"])

ContainerDep = Annotated[Container, Depends(get_container)]


class EventResult(CamelModel):
    event_id: str
    processed: bool


@router.post("/events/job", response_model=EventResult)
async def job_event(event: JobEvent, container: ContainerDep) -> EventResult:
    processed = await container.events.handle_job(event)
    return EventResult(event_id=event.event_id, processed=processed)


@router.post("/events/cv", response_model=EventResult)
async def cv_event(event: CvEvent, container: ContainerDep) -> EventResult:
    processed = await container.events.handle_cv(event)
    return EventResult(event_id=event.event_id, processed=processed)
