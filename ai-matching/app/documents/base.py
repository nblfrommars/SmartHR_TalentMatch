from collections.abc import Iterable
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.skills import to_sparse_token
from app.text import segment


class IndexDocument(BaseModel):
    """Một point sẽ upsert vào Qdrant.

    - dense_text: văn bản có cấu trúc gửi đi embedding (ngữ nghĩa).
    - sparse_text: chuỗi token cho BM25 (từ khóa); skill đã nối "_", tiếng Việt đã tách từ.
    - payload: metadata để filter và re-score. Không chứa PII.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    dense_text: str
    sparse_text: str
    payload: dict[str, Any]


def skill_tokens(skills: Iterable[str]) -> list[str]:
    return [token for token in (to_sparse_token(s) for s in skills) if token]


def join_tokens(*groups: Iterable[str]) -> str:
    return " ".join(token for group in groups for token in group)


def segment_all(texts: Iterable[str | None]) -> list[str]:
    return [token for text in texts for token in segment(text)]


def to_utc_iso(value: datetime | None) -> str | None:
    """Datetime RFC 3339 theo UTC, dạng Qdrant dùng cho payload index kiểu datetime."""
    return value.astimezone(UTC).isoformat() if value else None


def labeled_line(label: str, value: str | None) -> str | None:
    return f"{label}: {value}" if value else None


def joined_line(*parts: str | None, sep: str = " | ") -> str | None:
    present = [p for p in parts if p]
    return sep.join(present) if present else None


def compact_lines(lines: Iterable[str | None]) -> str:
    return "\n".join(line for line in lines if line)


def plain_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Enum -> chuỗi để payload là JSON thuần."""
    return {k: (v.value if isinstance(v, Enum) else v) for k, v in payload.items()}
