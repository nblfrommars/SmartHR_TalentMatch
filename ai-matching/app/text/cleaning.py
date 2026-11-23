"""Làm sạch văn bản trước khi embedding: NFC, bỏ HTML, loại PII, gọn khoảng trắng, cắt độ dài."""

import html
import re
import unicodedata

_BLOCK_TAG = re.compile(r"</?(?:p|div|br|li|ul|ol|h[1-6]|tr|table)\b[^>]*>", re.IGNORECASE)
_ANY_TAG = re.compile(r"<[^>]+>")

# PII không được gửi sang OpenAI và không lưu vào Qdrant (ARCHITECTURE.md mục 3.5, 3.12)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_URL = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
# Link trần không có http/www: "linkedin.com/in/ten", "github.com/ten" (bắt buộc có "/" để
# không bắt nhầm "node.js", "React.js")
_BARE_URL = re.compile(r"\b(?:[\w-]+\.)+(?:com|net|org|io|me|dev|vn|co)\b/\S*", re.IGNORECASE)
# Số điện thoại Việt Nam: bắt đầu bằng 0 hoặc +84, 9-10 chữ số sau đó, cho phép dấu cách/chấm/gạch
_PHONE = re.compile(r"(?<![\w+])(?:\+84|0)(?:[\s.-]?\d){8,10}(?!\d)")

_INLINE_SPACE = re.compile(r"[ \t\f\v]+")
_SPACE_AROUND_NEWLINE = re.compile(r" *\n *")
_MANY_NEWLINES = re.compile(r"\n{3,}")


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def strip_html(text: str) -> str:
    text = _BLOCK_TAG.sub("\n", text)
    text = _ANY_TAG.sub("", text)
    return html.unescape(text)


def scrub_pii(text: str) -> str:
    for pattern in (_EMAIL, _URL, _BARE_URL, _PHONE):
        text = pattern.sub(" ", text)
    return text


def find_contacts(text: str) -> tuple[list[str], list[str]]:
    """Tìm email và SĐT (giữ thứ tự, bỏ trùng) để tách riêng trước khi gửi văn bản cho LLM."""
    emails = list(dict.fromkeys(m.group(0) for m in _EMAIL.finditer(text)))
    phones = list(dict.fromkeys(" ".join(m.group(0).split()) for m in _PHONE.finditer(text)))
    return emails, phones


def normalize_whitespace(text: str) -> str:
    text = _INLINE_SPACE.sub(" ", text)
    text = _SPACE_AROUND_NEWLINE.sub("\n", text)
    return _MANY_NEWLINES.sub("\n\n", text).strip()


def truncate(text: str, max_chars: int) -> str:
    """Cắt tối đa max_chars ký tự, không cắt ngang một từ."""
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    boundary = cut.rfind(" ")
    return (cut[:boundary] if boundary > 0 else cut).rstrip()


def clean_text(text: str | None, max_chars: int | None = None) -> str:
    if not text:
        return ""
    text = normalize_whitespace(scrub_pii(strip_html(nfc(text))))
    return truncate(text, max_chars) if max_chars else text


def normalize_keyword(value: str | None) -> str | None:
    """Giá trị keyword trong payload (location, industry): NFC, lowercase, gọn khoảng trắng.

    Filter lúc search phải đi qua đúng hàm này để khớp.
    """
    if value is None:
        return None
    cleaned = " ".join(nfc(value).lower().split())
    return cleaned or None
