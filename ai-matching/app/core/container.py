"""Khởi tạo và giữ các thành phần dùng chung (Qdrant, Redis, embedder, indexer...) cho cả app."""

from dataclasses import dataclass

from fastapi import Request
from openai import AsyncOpenAI
from qdrant_client import AsyncQdrantClient
from redis.asyncio import Redis

from app.core.config import Settings
from app.embedding import Bm25Encoder, DenseEmbedder
from app.embedding.factory import build_dense_embedder
from app.ingestion.events import EventHandler, InMemoryProcessedEvents, RedisProcessedEvents
from app.ingestion.indexer import Indexer
from app.parsing.extractor import OpenAICvExtractor
from app.parsing.service import CvParser
from app.retrieval.config import get_retrieval_config
from app.retrieval.service import Recommender
from app.skills import get_normalizer
from app.vectorstore import QdrantStore


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

    async def close(self) -> None:
        await self.qdrant.close()
        if self.redis is not None:
            await self.redis.aclose()


def build_qdrant_client(settings: Settings) -> AsyncQdrantClient:
    if settings.qdrant_url == ":memory:":
        return AsyncQdrantClient(location=":memory:")
    return AsyncQdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)


async def build_container(settings: Settings) -> Container:
    redis = Redis.from_url(settings.redis_url) if settings.embedding_cache == "redis" else None
    qdrant = build_qdrant_client(settings)

    store = QdrantStore(
        qdrant,
        dimension=settings.embedding_dimension,
        jobs_collection=settings.qdrant_jobs_collection,
        candidates_collection=settings.qdrant_candidates_collection,
    )
    await store.ensure_collections()

    dense = build_dense_embedder(settings, redis)
    sparse = Bm25Encoder()
    indexer = Indexer(store, dense, sparse)
    processed = RedisProcessedEvents(redis) if redis is not None else InMemoryProcessedEvents()

    parser = None
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

    return Container(
        settings=settings,
        qdrant=qdrant,
        redis=redis,
        store=store,
        dense=dense,
        sparse=sparse,
        indexer=indexer,
        events=EventHandler(indexer, processed),
        recommender=Recommender(store, get_retrieval_config()),
        parser=parser,
    )


def get_container(request: Request) -> Container:
    return request.app.state.container
