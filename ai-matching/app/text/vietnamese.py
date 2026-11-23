"""Tách từ tiếng Việt cho BM25: "Phát triển phần mềm" -> ["phát_triển", "phần_mềm"].

BM25 của fastembed tách theo khoảng trắng, nên từ ghép phải được nối bằng "_" trước.
Dùng CÙNG hàm này lúc index (job/CV) và lúc query, nếu không token sẽ không khớp.
"""

import re
from functools import lru_cache
from types import ModuleType

from app.text.cleaning import nfc

_HAS_WORD_CHAR = re.compile(r"\w")


@lru_cache
def _tokenizer() -> ModuleType:
    # Import trễ: pyvi nạp model mất ~2s, chỉ trả giá khi thật sự cần tách từ
    from pyvi import ViTokenizer

    return ViTokenizer


def segment(text: str | None) -> list[str]:
    """Tách từ, lowercase, bỏ token chỉ gồm dấu câu.

    pyvi đôi khi nối cả từ tiếng Anh ("Backend_Developer" nhưng lại "Java_Backend") một cách
    không nhất quán, làm BM25 trượt. Vì vậy token ghép chỉ gồm ký tự ASCII được tách lại thành
    từ rời; chỉ giữ từ ghép có dấu tiếng Việt ("phát_triển", "hà_nội").
    """
    if not text or not text.strip():
        return []
    segmented = _tokenizer().tokenize(nfc(text))
    tokens: list[str] = []
    for tok in segmented.lower().split():
        parts = tok.split("_") if "_" in tok and tok.isascii() else [tok]
        tokens.extend(p for p in parts if _HAS_WORD_CHAR.search(p))
    return tokens
