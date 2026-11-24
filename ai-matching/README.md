# ai-matching

AI Matching service của SmartHR TalentMatch (Python 3.11 + FastAPI): parse CV, đồng bộ Qdrant, hybrid search, re-scoring, giải thích kết quả. Thiết kế chi tiết xem [`ARCHITECTURE.md`](../ARCHITECTURE.md) mục 3.4 – 3.11.

## Cấu trúc

```
app/
├── main.py         # create_app(): FastAPI + middleware + routers
├── core/           # config (env AI_*), logging, middleware, container (khởi tạo thành phần)
├── api/            # Routers: /health, /ai/recommendations, /ai/search, /ai/cv/parse, /ai/internal
├── skills/         # Chuẩn hóa skill: skills_alias.yaml + SkillNormalizer
├── schemas/        # Pydantic: JobSnapshot, CvSnapshot (event), CvSchema (kết quả parse)
├── documents/      # Job/CV → IndexDocument (dense text, sparse text, payload không PII)
├── text/           # Làm sạch HTML, loại PII, tách từ tiếng Việt (pyvi)
├── embedding/      # Dense (OpenAI/hashing) + sparse BM25, cache embedding
├── vectorstore/    # Qdrant: collection, upsert, payload, đọc lại vector
├── ingestion/      # Indexer + xử lý job/cv events (idempotent); Kafka consumer chưa nối
├── parsing/        # PDF → text → JSON CV (POST /ai/cv/parse)
├── retrieval/      # Hybrid search, filter, re-score (weights.yaml), API gợi ý
└── explain/        # Giải thích kết quả match (template; LLM ở bước sau)
tests/
```

## Chạy local

```bash
cd ai-matching
uv sync --extra dev                       # tạo .venv và cài dependency
cp .env.example .env
uv run uvicorn app.main:app --reload --port 8000
curl localhost:8000/health
```

## Chạy thử không cần Docker / OpenAI

```bash
AI_QDRANT_URL=:memory: AI_EMBEDDING_PROVIDER=hashing AI_INTERNAL_API_ENABLED=true \
  uv run uvicorn app.main:app --port 8000
```

Nạp job/CV qua `POST /ai/internal/events/job|cv` (đúng message Kafka của job-service / user-cv), rồi gọi `GET /ai/recommendations/jobs?cvId=...`. Chi tiết: [`docs/03-index-search-parse.md`](docs/03-index-search-parse.md).

## Test và lint

```bash
uv run pytest
uv run ruff check .
```

## Chạy bằng Docker

```bash
cd ai-matching
docker build -t smarthr/ai-matching:dev .
docker run --rm -p 8000:8000 --env-file .env smarthr/ai-matching:dev
curl localhost:8000/health
```

Image gồm 2 stage: stage đầu dùng `uv` cài dependency theo `uv.lock` (không gồm nhóm `dev`), stage sau chỉ chứa venv và thư mục `app/`, chạy bằng user không phải root, có `HEALTHCHECK` gọi `/health`.

## Chuẩn hóa skill

Thêm alias vào `app/skills/skills_alias.yaml` theo dạng `<tên chuẩn>: [alias, ...]`. Loader báo lỗi nếu một alias bị map vào hai skill khác nhau.

```python
from app.skills import get_normalizer, to_sparse_token

n = get_normalizer()
n.normalize_many(["ReactJS", "k8s", "Spring-Boot"])  # ["react", "kubernetes", "spring boot"]
to_sparse_token("spring boot")                         # "spring_boot" (token cho BM25)
to_sparse_token("c++")                                 # "c_plus_plus"
```

## Dựng document cho Qdrant

Chi tiết xem [`docs/02-document-builder.md`](docs/02-document-builder.md).

```python
from app.documents import build_job_document
from app.schemas import JobSnapshot

doc = build_job_document(JobSnapshot.model_validate(event["payload"]))
doc.dense_text   # gửi đi embedding (OpenAI)
doc.sparse_text  # đưa vào BM25 (fastembed)
doc.payload      # lưu vào Qdrant để filter / re-score
```

## Tài liệu

- [`docs/01-khung-ban-dau.md`](docs/01-khung-ban-dau.md): khung service
- [`docs/02-document-builder.md`](docs/02-document-builder.md): dựng document cho Qdrant
- [`docs/03-index-search-parse.md`](docs/03-index-search-parse.md): encode, Qdrant, gợi ý, parse CV, Kafka
- [`docs/04-bao-mat-openai-van-hanh.md`](docs/04-bao-mat-openai-van-hanh.md): phân quyền, match-score, cache, LLM, chống prompt injection
