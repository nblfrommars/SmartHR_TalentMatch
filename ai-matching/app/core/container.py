"""Khởi tạo và giữ các thành phần dùng chung (Qdrant, Redis, embedder, indexer...) cho cả app."""

import asyncio
import logging
from dataclasses import dataclass

from fastapi import Request
from openai import AsyncOpenAI
from qdrant_client import AsyncQdrantClient
from redis.asyncio import Redis

from app.core.config import Settings
from app.embedding import Bm25Encoder, DenseEmbedder
from app.embedding.factory import build_dense_embedder
from app.explain.llm import LlmExplainer
from app.ingestion.consumer import KafkaEventConsumer
from app.ingestion.events import EventHandler, InMemoryProcessedEvents, RedisProcessedEvents
from app.ingestion.indexer import Indexer
from app.parsing.extractor import OpenAICvExtractor
from app.parsing.service import CvParser
from app.retrieval.cache import RecommendationCache
from app.retrieval.config import get_retrieval_config
from app.retrieval.nl_query import OpenAIQueryParser, QueryParser
from app.retrieval.service import Recommender
from app.skills import get_normalizer
from app.vectorstore import QdrantStore

logger = logging.getLogger(__name__)


@dataclass
class Container:
    settings: Settings
    qdrant: AsyncQdrantClient
    redis: Redis | None
    store: QdrantStore
    dense: DenseEmbedder
    sparse: Bm25Encoder
    indexer: Indexer
    events: EventHandler
    recommender: Recommender
    # None khi chưa có OpenAI API key: API parse CV trả 503
    parser: CvParser | None
    # None khi AI_KAFKA_ENABLED=false
    consumer: KafkaEventConsumer | None = None
    # None khi không dùng Redis hoặc AI_REC_CACHE_TTL_SECONDS=0
    rec_cache: RecommendationCache | None = None
    # None khi AI_LLM_EXPLANATIONS=false hoặc chưa có OpenAI key: dùng giải thích template
    explainer: LlmExplainer | None = None
    # None khi chưa có OpenAI key: API tìm ứng viên bằng câu hỏi tự do trả 503
    query_parser: QueryParser | None = None

    async def close(self) -> None:
        if self.consumer is not None:
            await self.consumer.stop()
        await self.qdrant.close()
        if self.redis is not None:
            await self.redis.aclose()


def build_qdrant_client(settings: Settings) -> AsyncQdrantClient:
    if settings.qdrant_url == ":memory:":
        return AsyncQdrantClient(location=":memory:")
    return AsyncQdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key,
        timeout=settings.qdrant_timeout_seconds,
    )


async def ensure_collections_with_retry(store: QdrantStore, attempts: int) -> None:
    for attempt in range(1, max(1, attempts) + 1):
        try:
            await store.ensure_collections()
            return
        except Exception as exc:
            if attempt >= attempts:
                raise
            delay = min(2 ** (attempt - 1), 10)
            logger.warning(
                "Qdrant chưa sẵn sàng (lần %d/%d): %s: %s. Thử lại sau %ds",
                attempt,
                attempts,
                type(exc).__name__,
                str(exc)[:200],
                delay,
            )
            await asyncio.sleep(delay)


async def build_container(settings: Settings) -> Container:
    redis = Redis.from_url(settings.redis_url) if settings.embedding_cache == "redis" else None
    qdrant = build_qdrant_client(settings)

    store = QdrantStore(
        qdrant,
        dimension=settings.embedding_dimension,
        jobs_collection=settings.qdrant_jobs_collection,
        candidates_collection=settings.qdrant_candidates_collection,
    )
    await ensure_collections_with_retry(store, settings.qdrant_startup_attempts)

    dense = build_dense_embedder(settings, redis)
    sparse = Bm25Encoder()
    indexer = Indexer(store, dense, sparse)
    # Gắn với bộ collection đang ghi: dựng index mới (collection khác) không lẫn dữ liệu cũ
    index_namespace = f"{settings.qdrant_jobs_collection}+{settings.qdrant_candidates_collection}"
    processed = (
        RedisProcessedEvents(
            redis,
            namespace=index_namespace,
        )
        if redis is not None
        else InMemoryProcessedEvents()
    )

    parser = None
    explainer = None
    query_parser = None
    if settings.openai_api_key:
        client = AsyncOpenAI(
            api_key=settings.openai_api_key, timeout=settings.openai_timeout_seconds
        )
        parser = CvParser(
            OpenAICvExtractor(client, model=settings.openai_chat_model),
            get_normalizer(),
            max_bytes=settings.cv_max_bytes,
            max_pages=settings.cv_max_pages,
            max_chars=settings.cv_max_chars,
        )
        query_parser = OpenAIQueryParser(client, model=settings.openai_chat_model)
        if settings.llm_explanations:
            explainer = LlmExplainer(
                client,
                model=settings.openai_chat_model,
                redis=redis,
                timeout_seconds=settings.llm_explain_timeout_seconds,
                top_k=settings.llm_explain_top_k,
            )

    rec_cache = (
        RecommendationCache(redis, settings.rec_cache_ttl_seconds, namespace=index_namespace)
        if redis is not None and settings.rec_cache_ttl_seconds > 0
        else None
    )
    events = EventHandler(indexer, processed, settings.cv_searchable_default, rec_cache)
    return Container(
        settings=settings,
        qdrant=qdrant,
        redis=redis,
        store=store,
        dense=dense,
        sparse=sparse,
        indexer=indexer,
        events=events,
        recommender=Recommender(store, get_retrieval_config()),
        parser=parser,
        consumer=KafkaEventConsumer(settings, events) if settings.kafka_enabled else None,
        rec_cache=rec_cache,
        explainer=explainer,
        query_parser=query_parser,
    )


def get_container(request: Request) -> Container:
    return request.app.state.container
