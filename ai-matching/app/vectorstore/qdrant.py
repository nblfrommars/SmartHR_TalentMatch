"""Truy cập Qdrant: tạo collection + payload index, upsert, cập nhật payload, xóa, đọc lại point.

Postgres là source of truth; Qdrant chỉ là index dẫn xuất (ARCHITECTURE.md mục 3.1).
"""

import logging
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from qdrant_client import AsyncQdrantClient
from qdrant_client import models as qm

logger = logging.getLogger(__name__)

DENSE = "dense"
SPARSE = "sparse"

# Namespace cố định để id không phải UUID (ví dụ id số) luôn ra cùng một point id
_ID_NAMESPACE = uuid.UUID("6b3c1f2e-8f4a-4a51-9a57-1c1e0b7d2c10")


class Kind(StrEnum):
    JOB = "job"
    CV = "cv"


_ID_FIELD = {Kind.JOB: "job_id", Kind.CV: "cv_id"}

_PAYLOAD_INDEXES: dict[Kind, dict[str, qm.PayloadSchemaType]] = {
    Kind.JOB: {
        "job_id": qm.PayloadSchemaType.KEYWORD,
        "company_id": qm.PayloadSchemaType.KEYWORD,
        "status": qm.PayloadSchemaType.KEYWORD,
        "deadline_ts": qm.PayloadSchemaType.DATETIME,
        "published_ts": qm.PayloadSchemaType.DATETIME,
        "salary_min": qm.PayloadSchemaType.INTEGER,
        "salary_max": qm.PayloadSchemaType.INTEGER,
        "location": qm.PayloadSchemaType.KEYWORD,
        "work_mode": qm.PayloadSchemaType.KEYWORD,
        "industry": qm.PayloadSchemaType.KEYWORD,
        "level": qm.PayloadSchemaType.KEYWORD,
        "job_type": qm.PayloadSchemaType.KEYWORD,
        "required_skills": qm.PayloadSchemaType.KEYWORD,
        "min_years_exp": qm.PayloadSchemaType.INTEGER,
    },
    Kind.CV: {
        "cv_id": qm.PayloadSchemaType.KEYWORD,
        "user_id": qm.PayloadSchemaType.KEYWORD,
        "searchable": qm.PayloadSchemaType.BOOL,
        "location": qm.PayloadSchemaType.KEYWORD,
        "level": qm.PayloadSchemaType.KEYWORD,
        "years_experience": qm.PayloadSchemaType.FLOAT,
        "skills": qm.PayloadSchemaType.KEYWORD,
        "desired_salary_min": qm.PayloadSchemaType.INTEGER,
        "updated_ts": qm.PayloadSchemaType.DATETIME,
    },
}


def point_id(ref_id: str) -> str:
    """Qdrant chỉ nhận UUID hoặc số nguyên làm id: giữ nguyên UUID, còn lại băm uuid5."""
    try:
        return str(uuid.UUID(ref_id))
    except ValueError:
        return str(uuid.uuid5(_ID_NAMESPACE, ref_id))


@dataclass(frozen=True)
class PointData:
    ref_id: str
    dense: list[float]
    sparse: qm.SparseVector
    payload: dict[str, Any]


class QdrantStore:
    def __init__(
        self,
        client: AsyncQdrantClient,
        dimension: int,
        jobs_collection: str = "jobs",
        candidates_collection: str = "candidates",
    ) -> None:
        self.client = client
        self.dimension = dimension
        self._collections = {Kind.JOB: jobs_collection, Kind.CV: candidates_collection}

    def collection(self, kind: Kind) -> str:
        return self._collections[kind]

    async def ensure_collections(self) -> None:
        """Tạo collection + payload index nếu chưa có (chạy lúc khởi động, an toàn khi lặp lại)."""
        for kind, name in self._collections.items():
            if not await self.client.collection_exists(name):
                await self.client.create_collection(
                    name,
                    vectors_config={
                        DENSE: qm.VectorParams(size=self.dimension, distance=qm.Distance.COSINE)
                    },
                    sparse_vectors_config={SPARSE: qm.SparseVectorParams(modifier=qm.Modifier.IDF)},
                )
                logger.info("Đã tạo collection %s", name)
            for field, schema in _PAYLOAD_INDEXES[kind].items():
                await self.client.create_payload_index(name, field, field_schema=schema)

    async def upsert(self, kind: Kind, points: Sequence[PointData]) -> None:
        if not points:
            return
        await self.client.upsert(
            self.collection(kind),
            points=[
                qm.PointStruct(
                    id=point_id(p.ref_id),
                    vector={DENSE: p.dense, SPARSE: p.sparse},
                    payload=p.payload,
                )
                for p in points
            ],
        )

    async def set_payload(self, kind: Kind, ref_id: str, payload: dict[str, Any]) -> None:
        """Cập nhật một phần payload. Lọc theo id nghiệp vụ nên không lỗi khi point chưa tồn tại."""
        await self.client.set_payload(
            self.collection(kind), payload=payload, points=self._by_ref(kind, ref_id)
        )

    async def delete(self, kind: Kind, ref_id: str) -> None:
        await self.client.delete(
            self.collection(kind),
            points_selector=qm.PointIdsList(points=[point_id(ref_id)]),
        )

    async def get(self, kind: Kind, ref_id: str) -> PointData | None:
        found = await self.client.retrieve(
            self.collection(kind), [point_id(ref_id)], with_payload=True, with_vectors=True
        )
        if not found:
            return None
        vectors = found[0].vector
        assert isinstance(vectors, dict)
        return PointData(
            ref_id=ref_id,
            dense=list(vectors[DENSE]),  # type: ignore[arg-type]
            sparse=vectors.get(SPARSE) or qm.SparseVector(indices=[], values=[]),  # type: ignore[arg-type]
            payload=found[0].payload or {},
        )

    async def count(self, kind: Kind) -> int:
        return (await self.client.count(self.collection(kind), exact=True)).count

    @staticmethod
    def _by_ref(kind: Kind, ref_id: str) -> qm.Filter:
        return qm.Filter(
            must=[qm.FieldCondition(key=_ID_FIELD[kind], match=qm.MatchValue(value=ref_id))]
        )
