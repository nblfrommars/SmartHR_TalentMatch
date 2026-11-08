import logging

from fastapi import FastAPI

from app import __version__
from app.api import health
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.core.middleware import CorrelationIdMiddleware

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level)

    app = FastAPI(title="SmartHR AI Matching", version=__version__)
    app.add_middleware(CorrelationIdMiddleware)
    app.include_router(health.router)

    logger.info("Khởi động %s (env=%s)", settings.app_name, settings.environment)
    return app


app = create_app()
