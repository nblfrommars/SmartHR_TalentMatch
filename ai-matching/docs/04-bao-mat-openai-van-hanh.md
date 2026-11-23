# 04. Phân quyền, OpenAI thật, chống prompt injection, cache

Tài liệu này mô tả các phần làm thêm sau khi đã có Kafka consumer: phân quyền theo api-gateway,
API `match-score`, cache gợi ý, giải thích bằng LLM, HR tìm ứng viên bằng câu hỏi tự do, và các
lớp chống prompt injection. Mọi phần đều đã chạy thử với OpenAI thật (gpt-4o-mini,
text-embedding-3-small) ngày 2026-11-23.

---

## 1. Danh sách API

| API | Ai được gọi | Ghi chú |
|-----|-------------|---------|
| `GET /ai/recommendations/jobs?cvId=` | `USER` (CV của mình), `ADMIN` | Có cache Redis 10 phút (`X-Cache: HIT/MISS`) |
| `GET /ai/search/candidates?jobId=` | `HR`, `ADMIN` | |
| `POST /ai/search/candidates/query` | `HR`, `ADMIN` | Câu hỏi tự do, cần OpenAI key (không có: 503) |
| `GET /ai/match-score?cvId=&jobId=` | `USER` (CV của mình), `HR`, `ADMIN` | application-service gọi lúc apply |
| `POST /ai/cv/parse` | `USER`, `ADMIN` | Cần OpenAI key |
| `GET /health` | mọi người | Có trạng thái Kafka |

Qua api-gateway, các route trên nằm dưới `/api/v1/ai/**` (gateway cần `RewritePath` về `/ai/**`).
**Không** mở `/ai/internal/**` qua gateway.

---

## 2. Phân quyền (`app/api/auth.py`)

api-gateway xác thực JWT (Keycloak), xóa `X-User-Id` / `X-User-Role` do client tự gửi rồi gắn lại:

- `X-User-Id` = `sub` của token, cũng là `userId` của CV bên user-cv (vì `cvId = userId`).
- `X-User-Role` = `ADMIN` / `HR` / `USER`.

| Tình huống | Kết quả |
|------------|---------|
| USER xem gợi ý theo CV của người khác | 403 (kể cả CV không tồn tại, để không lộ CV nào có thật) |
| USER xem CV của mình nhưng CV chưa được index | 404 |
| Không có `X-User-Id` (service nội bộ gọi thẳng trong mạng Docker) | Cho qua; bật `AI_REQUIRE_IDENTITY=true` để chặn (401) |

Kiểm tra quyền chạy **trước** khi đọc cache, nên cache không thành đường vòng qua phân quyền.
Cổng của ai-matching không được mở ra Internet: mọi request từ ngoài phải đi qua gateway.

Chưa kiểm tra được HR có thuộc công ty sở hữu job hay không (gateway chưa gửi `X-Company-Id`).

---

## 3. `GET /ai/match-score`

Chấm một cặp CV - job cụ thể, trả `score`, `passed` (đạt luật cứng hay không), `breakdown`, giải
thích cho ứng viên và cho HR. Thành phần `hybrid` ở đây là độ tương đồng cosine của vector dense
(RRF chỉ có nghĩa khi xếp hạng nhiều kết quả), nên điểm so sánh được giữa các ứng viên của cùng
một job: đúng nhu cầu "HR sắp xếp ứng viên theo độ phù hợp".

---

## 4. Cache gợi ý (`app/retrieval/cache.py`)

- Chỉ bật khi có Redis (`AI_EMBEDDING_CACHE=redis`), TTL `AI_REC_CACHE_TTL_SECONDS` (mặc định
  600, `0` để tắt). Key gồm cvId + mọi tham số lọc.
- Vô hiệu hóa theo "thế hệ": job bất kỳ thay đổi -> tăng thế hệ chung; CV thay đổi -> tăng thế
  hệ của CV đó. Không phải tìm và xóa từng key.
- Redis lỗi: coi như không có cache, API vẫn trả kết quả.

---

## 5. Giải thích bằng LLM (`app/explain/llm.py`)

Bật bằng `AI_LLM_EXPLANATIONS=true` (cần OpenAI key). Mặc định tắt vì thêm khoảng 2-3 giây cho
lần gọi đầu (sau đó lấy từ cache).

- LLM chỉ nhận **dữ kiện đã tính sẵn** (kỹ năng khớp/thiếu, mức phù hợp cấp bậc, kinh nghiệm,
  lương), không nhận văn bản CV: không có PII, không có chỗ cho prompt injection.
- `matchedSkills` / `missingSkills` vẫn do code tính; LLM chỉ viết lại `matchSummary` và
  `suggestion`. Trường `source` cho biết `template` hay `llm`.
- Chỉ top `AI_LLM_EXPLAIN_TOP_K` (5) kết quả, gọi song song, timeout
  `AI_LLM_EXPLAIN_TIMEOUT_SECONDS` (3s). Lỗi / chậm / output rỗng hoặc dài bất thường -> template.
- Cache theo nội dung dữ kiện (Redis, 7 ngày).

Chạy thật: 3 giải thích song song 3.2s, viết tự nhiên, không thêm kỹ năng ngoài dữ kiện.

---

## 6. HR tìm bằng câu hỏi tự do (`app/retrieval/nl_query.py`)

```
POST /ai/search/candidates/query   {"query": "Java dev biết Kafka ở Hà Nội, 3 năm trở lên"}
-> interpreted: {semanticText, skills: [java, kafka], mustHaveSkills: [], locations: [Hà Nội], minYears: 3}
-> items: ứng viên (như /ai/search/candidates)
```

- LLM chỉ tách câu hỏi thành điều kiện; tìm và chấm điểm vẫn dùng pipeline hybrid như tìm ứng viên
  cho một job ("job ảo"). LLM không thấy dữ liệu ứng viên nào.
- Hậu kiểm (`ground`): chỉ giữ kỹ năng / địa điểm có thật trong câu hỏi; kỹ năng bắt buộc chỉ khi
  câu hỏi có chữ "bắt buộc / phải biết / yêu cầu / must"; "biết TypeScript" -> "TypeScript".
- CV chưa có địa điểm / cấp bậc / số năm (ví dụ CV từ user-cv chưa gửi tên địa điểm) vẫn được giữ,
  chỉ bị loại khi dữ liệu có và không khớp.

---

## 7. Parse CV với OpenAI thật và chống prompt injection

### Lỗi thật tìm ra khi chạy CV tiếng Việt (đã sửa)

| Lỗi | Sửa |
|-----|-----|
| Số năm kinh nghiệm 3.0 thay vì 6.5 (LLM tự đoán) | Luôn tự tính từ mốc thời gian; chỉ dùng số của LLM khi không có mốc nào |
| `headline` của sinh viên là họ tên | Prompt rõ hơn + bỏ nếu trùng họ tên |
| `degree = "null"` (chuỗi) | Đổi `"null" / "N/A" / ""` thành null |
| Không trích "thực tập ở TP.HCM hoặc làm từ xa" | Prompt cho `desired.jobType / workMode / locations` |
| `Vue 3`, `Java 17` không chuẩn hóa | Bỏ số phiên bản ở cuối nếu phần còn lại là skill đã biết |

### Các lớp chống prompt injection (`app/parsing/service.py`)

CV do người ngoài gửi lên, có thể chứa câu lệnh nhằm tự nâng cấp bậc / thêm kỹ năng:

1. Bỏ thẻ phân cách giả `<cv_text>` / `</cv_text>`.
2. Nối lại các dòng PDF tự ngắt thành đoạn, bỏ từ câu mang dáng câu lệnh tới hết đoạn ("bỏ qua
   hướng dẫn", "ignore previous instructions", "SYSTEM:", "đặt level = ...", "thêm kỹ năng ... vào
   skills"...), so khớp không dấu. Có cảnh báo cho User.
3. Chỉ giữ skill / công nghệ thực sự xuất hiện trong CV (tính cả alias: `K8s` -> kubernetes).
4. Cấp bậc phải hợp với số năm tự tính (SENIOR >= 3 năm, LEAD / MANAGER >= 5 năm).
5. Email, SĐT, số năm kinh nghiệm do code tính, không lấy từ LLM.

Chạy thật: chặn **9/9** lượt tấn công (có dấu, không dấu, tiếng Anh); CV bình thường có chữ
"system" không bị báo nhầm. Trước khi có các lớp 1-4, kỹ năng bị chèn lọt qua 2/3 lần.

---

## 8. Embedding OpenAI so với hashing

Đo chỉ phần ngữ nghĩa (dense), 6 job và 5 CV viết khác chữ nhưng cùng nghĩa với job đúng:

| | Top-1 đúng | MRR |
|---|---|---|
| hashing | 3/5 | 0.73 |
| OpenAI `text-embedding-3-small` | 4/5 | 0.90 |

### Chuyển index từ hashing sang OpenAI

Vector của hai cách không so được với nhau dù cùng 1536 chiều, nên phải dựng lại index:

1. Đặt `AI_EMBEDDING_PROVIDER=openai`, `AI_OPENAI_API_KEY=...`.
2. Đổi tên collection (`AI_QDRANT_JOBS_COLLECTION=jobs_openai`,
   `AI_QDRANT_CANDIDATES_COLLECTION=candidates_openai`) và `AI_KAFKA_GROUP_ID=ai-matching-openai`.
3. Khởi động lại: consumer group mới đọc Kafka từ đầu và dựng lại toàn bộ index (trong thời gian
   topic còn giữ message). Xóa collection cũ khi đã kiểm tra xong.

---

## 9. Cấu hình mới

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `AI_REQUIRE_IDENTITY` | `false` | `true`: bắt buộc có `X-User-Id` |
| `AI_REC_CACHE_TTL_SECONDS` | `600` | TTL cache gợi ý, `0` = tắt |
| `AI_LLM_EXPLANATIONS` | `false` | Bật giải thích bằng LLM |
| `AI_LLM_EXPLAIN_TOP_K` | `5` | Số kết quả được viết lại |
| `AI_LLM_EXPLAIN_TIMEOUT_SECONDS` | `3` | Timeout mỗi lời gọi |
| `AI_QDRANT_TIMEOUT_SECONDS` | `30` | Timeout gọi Qdrant |
| `AI_QDRANT_STARTUP_ATTEMPTS` | `10` | Số lần thử lại khi Qdrant chưa sẵn sàng lúc khởi động |

Test không bao giờ dùng OpenAI key thật trong `ai-matching/.env` (`tests/conftest.py` ghi đè).
