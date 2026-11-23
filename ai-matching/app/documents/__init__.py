"""Dựng document để index vào Qdrant: dense text, sparse text và payload (không chứa PII)."""

from app.documents.base import IndexDocument
from app.documents.cv import build_cv_document
from app.documents.job import build_job_document

__all__ = ["IndexDocument", "build_cv_document", "build_job_document"]
