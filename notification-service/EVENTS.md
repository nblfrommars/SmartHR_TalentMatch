# Event notification-service nhận

notification-service viết bằng Node nên **không dùng được `common-lib`**. Định dạng event dưới đây được viết lại
bằng tay trong `src/kafka/`. Ai đổi `EventEnvelope`, `JobRes` hoặc `JobApplicationEventData` thì báo người làm
notification-service, nếu không event sẽ rơi vào DLQ.

Consumer group: `notification-service`, đọc từ đầu topic ở lần chạy đầu (`fromBeginning`).

## Envelope chung

Lấy từ `backend/common-lib/.../event/EventEnvelope.java`. Message value là JSON:

```json
{
  "eventId": "uuid",
  "type": "job.created",
  "version": 1,
  "occurredAt": "2026-11-24T09:00:00Z",
  "producer": "job-service",
  "correlationId": "…",
  "data": { }
}
```

| Trường | Bắt buộc | Dùng để |
|---|---|---|
| `eventId` | Có, UUID | Chống trùng: cùng `eventId` + người nhận chỉ tạo một thông báo |
| `type` | Có | Chọn handler; type không biết thì bỏ qua (không lỗi) |
| `data` | Có, object | Nội dung |
| `correlationId` | Không | Ghi vào log |
| `version`, `occurredAt`, `producer` | Không | Chưa dùng |

## Topic `job.events` (job-service)

`data` là `JobRes` (xem `backend/job-service/DATAFORAISERVICE.md`). Chỉ dùng các trường:

| Trường | Bắt buộc | Dùng để |
|---|---|---|
| `id` | Có, UUID | `job_snapshots.job_id` |
| `createdBy` | Có, UUID | HR nhận thông báo của job này |
| `title` | Có | Hiển thị trong thông báo |
| `version` | Có, số nguyên | Bỏ qua event cũ hơn bản đã lưu (so sánh `<=`) |
| `status` | Không | `DRAFT` / `OPEN` / `CLOSED` |
| `deadline` | Không | Đưa vào `data` của thông báo `JOB_EXPIRED` |

Không dùng `companyId`: hợp đồng dữ liệu của job-service không có trường này.

| `type` | Xử lý |
|---|---|
| `job.created`, `job.updated`, `job.closed` | Upsert `job_snapshots` |
| `job.expired` | Upsert `job_snapshots` và tạo thông báo `JOB_EXPIRED` cho `createdBy` |
| `job.deleted` | Upsert `job_snapshots` với `status = 'DELETED'` (giữ lại tên job cho thông báo về sau) |

## Topic `job.application.events` (user-cv)

`data` là `JobApplicationEventData`.

| `type` | Xử lý |
|---|---|
| `job_application.created` | Tạo thông báo `APPLICATION_RECEIVED` cho HR đã đăng job (tra trong `job_snapshots`) |

| Trường | Bắt buộc | Dùng để |
|---|---|---|
| `applicationId` | Có, UUID | `entityId` của thông báo |
| `jobId` | Có, UUID | Tìm HR và tên job trong `job_snapshots` |
| `applicantId` | Có, UUID | Đưa vào `data` |
| `appliedAt` | Không | Đưa vào `data` |
| `applicantName` | Không | **user-cv chưa gửi.** Có thì thông báo ghi tên, không có thì ghi "Một ứng viên" |
| `cvAttachmentId`, `coverLetter`, `status` | Không | Không dùng |

Đã có sẵn type thông báo nhưng **chưa có handler**, chờ user-cv phát event:

| Event cần có | Thông báo |
|---|---|
| Đổi trạng thái đơn (HR duyệt / từ chối…) | `APPLICATION_STATUS_CHANGED` gửi ứng viên |
| Ứng viên rút đơn | `APPLICATION_WITHDRAWN` gửi HR |

## Khi xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| JSON hỏng, thiếu `eventId` / `type` / `data`, thiếu trường bắt buộc | Đẩy thẳng vào DLQ, không thử lại |
| Lỗi tạm thời (DB lỗi, apply mà chưa có snapshot job vì `job.events` chưa tới) | Thử lại sau `KAFKA_RETRY_BACKOFF_MS` (mặc định 1s, 5s, 30s), hết lượt thì vào DLQ |
| Type không liên quan | Bỏ qua |

DLQ là topic `<topic gốc>.DLQ` (`job.events.DLQ`, `job.application.events.DLQ`). Message giữ nguyên key, value,
header gốc, thêm header:

| Header | Nội dung |
|---|---|
| `x-dlq-error` | Thông báo lỗi (tối đa 1000 ký tự) |
| `x-dlq-original-offset` | Offset ở topic gốc |

## Kênh Postgres `LISTEN` / `NOTIFY` (nội bộ, trong `notification_db`)

| Kênh | Ai phát | Payload |
|---|---|---|
| `notification_created` | Trigger `trg_notifications_created` khi INSERT `notifications` | `row_to_json` của dòng mới |
| `notification_read` | Ứng dụng khi đánh dấu đã đọc | `{"recipientId","ids":[...]}` hoặc `{"recipientId","all":true,"readAt"}` |

Mọi instance đều `LISTEN` cả hai kênh và chỉ đẩy tới socket đang kết nối với mình. NOTIFY chỉ phát khi transaction
commit. Payload NOTIFY tối đa 8000 byte, vì vậy `notifications.body` bị giới hạn 1000 ký tự.
