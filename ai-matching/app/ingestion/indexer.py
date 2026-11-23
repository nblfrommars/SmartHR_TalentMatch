"""Snapshot job/CV -> document -> vector -> Qdrant.

Khi job/CV được sửa, luôn dựng lại document và upsert toàn bộ. Nếu nội dung văn bản không đổi
(chỉ sửa metadata như lương, hạn nộp) thì embedding cache trả lại vector cũ, không tốn lời gọi
OpenAI; đây là cách đạt mục "chỉ sửa metadata thì không re-embed" ở ARCHITECTURE.md mục 3.4.
"""

from collections.abc import Sequence

from app.documents import IndexDocument, build_cv_document, build_job_document
from app.embedding import Bm25Encoder, DenseEmbedder
from app.schemas import CvSnapshot, JobSnapshot, JobStatus
from app.vectorstore import Kind, PointData, QdrantStore


class Indexer:
    def __init__(self, store: QdrantStore, dense: DenseEmbedder, sparse: Bm25Encoder) -> None:
        self.store = store
        self.dense = dense
        self.sparse = sparse

    async def index_jobs(self, jobs: Sequence[JobSnapshot]) -> None:
        await self._index(Kind.JOB, [build_job_document(job) for job in jobs])

    async def index_cvs(self, cvs: Sequence[CvSnapshot]) -> None:
        await self._index(Kind.CV, [build_cv_document(cv) for cv in cvs])

    async def set_job_status(self, job_id: str, status: JobStatus) -> None:
        await self.store.set_payload(Kind.JOB, job_id, {"status": status.value})

    async def job_version(self, job_id: str) -> int | None:
        """Version của bản job đang nằm trong Qdrant (None nếu chưa có hoặc không rõ)."""
        point = await self.store.get(Kind.JOB, job_id)
        return point.payload.get("version") if point else None

    async def set_cv_searchable(self, cv_id: str, searchable: bool) -> None:
        await self.store.set_payload(Kind.CV, cv_id, {"searchable": searchable})

    async def delete_job(self, job_id: str) -> None:
        await self.store.delete(Kind.JOB, job_id)

    async def delete_cv(self, cv_id: str) -> None:
        await self.store.delete(Kind.CV, cv_id)

    async def _index(self, kind: Kind, docs: Sequence[IndexDocument]) -> None:
        if not docs:
            return
        dense_vectors = await self.dense.embed([doc.dense_text for doc in docs])
        await self.store.upsert(
            kind,
            [
                PointData(
                    ref_id=doc.id,
                    dense=dense,
                    sparse=self.sparse.encode_document(doc.sparse_text),
                    payload=doc.payload,
                )
                for doc, dense in zip(docs, dense_vectors, strict=True)
            ],
        )
