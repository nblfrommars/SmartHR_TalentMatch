"""Sparse vector BM25 cho Qdrant.

Qdrant tự tính IDF trên toàn collection (SparseVectorParams(modifier=IDF)), nên phía client chỉ
cần gửi phần TF của BM25. Văn bản đầu vào là sparse_text đã được tách từ bởi documents/
(skill nối "_", tiếng Việt qua pyvi), nên ở đây chỉ cần tách theo khoảng trắng.

Không dùng fastembed: tránh kéo onnxruntime + tải model, và tránh stemmer tiếng Anh làm hỏng
token tiếng Việt. Công thức giống Qdrant/bm25 của fastembed (k1=1.2, b=0.75, avg_len=256).
"""

import hashlib
from collections import Counter

from qdrant_client.models import SparseVector


def token_index(token: str) -> int:
    """Hash ổn định (không phụ thuộc PYTHONHASHSEED) -> uint32, dùng làm chỉ số chiều sparse."""
    return int.from_bytes(hashlib.blake2b(token.encode("utf-8"), digest_size=4).digest(), "big")


class Bm25Encoder:
    def __init__(self, k1: float = 1.2, b: float = 0.75, avg_len: float = 256.0) -> None:
        self.k1 = k1
        self.b = b
        self.avg_len = avg_len

    @staticmethod
    def _tokens(text: str) -> list[str]:
        return text.lower().split()

    def encode_document(self, text: str) -> SparseVector:
        tokens = self._tokens(text)
        counts = Counter(tokens)
        norm = self.k1 * (1 - self.b + self.b * len(tokens) / self.avg_len)
        weights: dict[int, float] = {}
        for token, tf in counts.items():
            idx = token_index(token)
            weights[idx] = weights.get(idx, 0.0) + tf * (self.k1 + 1) / (tf + norm)
        return _to_sparse(weights)

    def encode_query(self, text: str) -> SparseVector:
        """Mỗi token của query có trọng số 1; IDF do Qdrant nhân vào."""
        return _to_sparse({token_index(t): 1.0 for t in set(self._tokens(text))})


def _to_sparse(weights: dict[int, float]) -> SparseVector:
    indices = sorted(weights)
    return SparseVector(indices=indices, values=[weights[i] for i in indices])
