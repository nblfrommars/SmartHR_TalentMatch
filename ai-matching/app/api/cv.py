"""POST /ai/cv/parse: candidate-service gửi file PDF, nhận lại CV nháp (JSON) để User xem và sửa."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from openai import OpenAIError

from app.core.container import Container, get_container
from app.parsing.extractor import ExtractionError
from app.parsing.pdf import NotPdfError, PdfError, PdfTooLargeError
from app.schemas import CvSchema
from app.schemas.common import CamelModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/cv", tags=["cv"])


class ParsedCv(CamelModel):
    cv: CvSchema
    warnings: list[str]


@router.post(
    "/parse",
    response_model=ParsedCv,
    responses={
        413: {"description": "File quá lớn"},
        415: {"description": "Không phải PDF"},
        422: {"description": "PDF hỏng hoặc dạng ảnh scan"},
        502: {"description": "LLM lỗi"},
        503: {"description": "Chưa cấu hình LLM"},
    },
)
async def parse_cv(
    file: Annotated[UploadFile, File(description="CV dạng PDF")],
    container: Annotated[Container, Depends(get_container)],
) -> ParsedCv:
    if container.parser is None:
        raise HTTPException(503, detail="Chưa cấu hình AI_OPENAI_API_KEY, không parse được CV")

    # Đọc dư 1 byte để biết file có vượt giới hạn hay không mà không phải đọc hết
    data = await file.read(container.parser.max_bytes + 1)
    try:
        result = await container.parser.parse(data)
    except PdfTooLargeError as exc:
        raise HTTPException(413, detail={"code": exc.code, "message": str(exc)}) from exc
    except NotPdfError as exc:
        raise HTTPException(415, detail={"code": exc.code, "message": str(exc)}) from exc
    except PdfError as exc:
        raise HTTPException(422, detail={"code": exc.code, "message": str(exc)}) from exc
    except (ExtractionError, OpenAIError) as exc:
        logger.warning("LLM parse CV lỗi: %s", exc)
        raise HTTPException(502, detail="Không phân tích được CV lúc này, thử lại sau") from exc
    return ParsedCv(cv=result.cv, warnings=result.warnings)
