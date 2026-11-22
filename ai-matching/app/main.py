import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import __version__
from app.api import cv, health, internal, recommendations
from app.core.config import get_settings
from app.core.container import build_container
from app.core.logging import setup_logging
from app.core.middleware import CorrelationIdMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    container = await build_container(get_settings())
    app.state.container = container
    try:
        yield
    finally:
        await container.close()


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level)

    app = FastAPI(title="SmartHR AI Matching", version=__version__, lifespan=lifespan)
    app.add_middleware(CorrelationIdMiddleware)
    app.include_router(health.router)
    app.include_router(recommendations.router)
    app.include_router(cv.router)
    if settings.internal_api_enabled:
        app.include_router(internal.router)

    logger.info("Khởi động %s (env=%s)", settings.app_name, settings.environment)
    return app


app = create_app()
