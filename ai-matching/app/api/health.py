from typing import Any

from fastapi import APIRouter, Request

from app import __version__
from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health(request: Request) -> dict[str, Any]:
    """Service còn sống. Kafka mất kết nối KHÔNG làm health fail (API gợi ý vẫn phục vụ được),
    chỉ báo trạng thái trong trường "kafka" để theo dõi.
    """
    settings = get_settings()
    container = getattr(request.app.state, "container", None)
    consumer = container.consumer if container is not None else None
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": __version__,
        "kafka": consumer.status() if consumer is not None else {"enabled": False},
    }
