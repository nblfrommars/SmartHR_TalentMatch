"""Trích text từ file PDF CV (ARCHITECTURE.md mục 3.5)."""

import io
import logging

import pdfplumber

logger = logging.getLogger(__name__)

PDF_MAGIC = b"%PDF-"
# Ít hơn ngần này ký tự thì coi như PDF là ảnh scan (không có lớp text)
MIN_TEXT_CHARS = 50


class PdfError(ValueError):
    code = "INVALID_PDF"


class NotPdfError(PdfError):
    code = "NOT_PDF"


class PdfTooLargeError(PdfError):
    code = "PDF_TOO_LARGE"


class ScannedPdfError(PdfError):
    code = "SCANNED_PDF"


def extract_text(data: bytes, max_bytes: int, max_pages: int) -> str:
    if len(data) > max_bytes:
        raise PdfTooLargeError(f"File vượt quá {max_bytes // (1024 * 1024)}MB")
    # Kiểm tra magic bytes, không tin Content-Type hay đuôi file
    if not data.startswith(PDF_MAGIC):
        raise NotPdfError("File không phải PDF")

    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages[:max_pages]]
    except Exception as exc:  # pdfminer ném nhiều loại lỗi khác nhau với file hỏng
        logger.info("Không đọc được PDF: %s", exc)
        raise PdfError("Không đọc được nội dung PDF") from exc

    text = "\n".join(pages).strip()
    if len(text) < MIN_TEXT_CHARS:
        # OCR (Tesseract vie+eng) chưa được bật: cần cài tesseract trong image Docker
        raise ScannedPdfError("PDF dạng ảnh scan, chưa trích được chữ. Vui lòng điền form.")
    return text
