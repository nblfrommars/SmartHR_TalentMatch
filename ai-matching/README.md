# ai-matching

AI Matching service của SmartHR TalentMatch (Python 3.11 + FastAPI): parse CV, đồng bộ Qdrant, hybrid search, re-scoring, giải thích kết quả. Thiết kế chi tiết xem [`ARCHITECTURE.md`](../ARCHITECTURE.md) mục 3.4 – 3.11.

## Cấu trúc

```
app/
├── main.py         # create_app(): FastAPI + middleware + routers
├── core/           # config (env AI_*), logging có correlation-id, middleware
├── api/            # FastAPI routers (hiện có GET /health)
├── skills/         # Chuẩn hóa skill: skills_alias.yaml + SkillNormalizer
├── ingestion/      # (Phase 4) Kafka consumers → embedding → Qdrant
├── parsing/        # (Phase 4) PDF → text → JSON CV
├── retrieval/      # (Phase 5) Hybrid search, filter, re-score
└── explain/        # (Phase 5) LLM sinh giải thích
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

## Test và lint

```bash
uv run pytest
uv run ruff check .
```

## Chuẩn hóa skill

Thêm alias vào `app/skills/skills_alias.yaml` theo dạng `<tên chuẩn>: [alias, ...]`. Loader báo lỗi nếu một alias bị map vào hai skill khác nhau.

```python
from app.skills import get_normalizer, to_sparse_token

n = get_normalizer()
n.normalize_many(["ReactJS", "k8s", "Spring-Boot"])  # ["react", "kubernetes", "spring boot"]
to_sparse_token("spring boot")                         # "spring_boot" (token cho BM25)
```
