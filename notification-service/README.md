# notification-service

Lưu thông báo và đẩy realtime qua WebSocket. Node 22, Express 5, PostgreSQL (`notification_db`), Kafka (`kafkajs`),
WebSocket (`ws`).

```
user-cv ──job.application.events──┐
job-service ──job.events──────────┤ Kafka
                                  ▼
                     notification-service ──INSERT──▶ notifications ──trigger NOTIFY──┐
                                  ▲                                                   │
                                  └────────────── LISTEN ◀────────────────────────────┘
                                  │
                     api-gateway: /api/v1/notifications/** (REST), /ws/notifications (WebSocket)
                                  │
                               Frontend
```

Hiện có:

| Type | Người nhận | Khi nào |
|---|---|---|
| `APPLICATION_RECEIVED` | HR đăng job | Ứng viên apply (`job_application.created`) |
| `JOB_EXPIRED` | HR đăng job | Job quá hạn và bị đóng tự động (`job.expired`) |

Định dạng event nhận vào, DLQ, kênh NOTIFY: xem [EVENTS.md](EVENTS.md).

## Chạy

**Cùng cả hệ thống** (từ thư mục gốc repo):

```bash
docker compose up -d --build notification-service api-gateway
```

`notification_db` được tạo bởi `docker/postgres/init_databases.sql`, file này **chỉ chạy khi volume Postgres còn
trống**. Máy đã từng chạy compose thì tạo bằng tay một lần:

```bash
docker exec postgres-db psql -U postgres -c "CREATE DATABASE notification_db;"
```

Bảng được tạo tự động khi service khởi động (migration `migrations/V*.sql`, ghi lại trong `schema_migrations`).

**Chạy riêng để phát triển** (cần Postgres, Kafka, Keycloak đang chạy bằng compose):

```bash
npm install
DATABASE_URL=postgres://postgres:<mật khẩu>@localhost:5432/notification_db \
KAFKA_BROKERS=localhost:9095 \
AUTH_JWK_SET_URI=http://localhost:8180/realms/smarthr/protocol/openid-connect/certs \
npm run dev
```

## Biến môi trường

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `PORT` | `8084` | |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/notification_db` | Mật khẩu có ký tự đặc biệt (`@ : /`) phải mã hóa URL |
| `KAFKA_ENABLED` | `true` | `false`: chỉ chạy REST và WebSocket |
| `KAFKA_BROKERS` | `localhost:9095` | Nhiều broker cách nhau bằng dấu phẩy |
| `KAFKA_GROUP_ID` | `notification-service` | |
| `KAFKA_RETRY_BACKOFF_MS` | `1000,5000,30000` | Thời gian chờ giữa các lần thử lại trước khi vào DLQ |
| `AUTH_ISSUER_URI` | `http://localhost:8180/realms/smarthr` | Phải trùng claim `iss` của token (URL trình duyệt dùng để đăng nhập) |
| `AUTH_JWK_SET_URI` | `http://localhost:8180/realms/smarthr/protocol/openid-connect/certs` | Trong compose: `http://keycloak:8080/...` |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:5174` | Origin được mở WebSocket |
| `WS_PATH` | `/ws/notifications` | |
| `WS_HEARTBEAT_MS` | `30000` | Ping để phát hiện kết nối chết |
| `RETENTION_INTERVAL_MS` | `3600000` | Chu kỳ dọn thông báo cũ |
| `RETENTION_READ_DAYS` | `90` | Xóa thông báo đã đọc quá số ngày này |
| `RETENTION_MAX_DAYS` | `180` | Xóa mọi thông báo quá số ngày này |
| `LOG_LEVEL` | `info` | |

## REST API

Đi qua gateway: `http://localhost:8080`, header `Authorization: Bearer <access token Keycloak>`. Gateway verify token
rồi gắn `X-User-Id`; mọi API chỉ thao tác trên thông báo của chính người gọi.

### `GET /api/v1/notifications?limit=20&cursor=…`

Mới nhất trước. `limit` từ 1 đến 100. Trang sau: truyền `nextCursor` của trang trước; `nextCursor = null` là hết.

```json
{
  "items": [
    {
      "id": "8b6b550e-…",
      "type": "APPLICATION_RECEIVED",
      "title": "Có ứng viên mới",
      "body": "Một ứng viên vừa ứng tuyển vào \"Java Backend\".",
      "entityType": "APPLICATION",
      "entityId": "1519a181-…",
      "data": {
        "applicationId": "1519a181-…",
        "jobId": "3d10b9c5-…",
        "jobTitle": "Java Backend",
        "applicantId": "d1185814-…",
        "applicantName": null,
        "appliedAt": "2026-11-24T07:48:39.596Z"
      },
      "read": false,
      "readAt": null,
      "createdAt": "2026-11-24T07:48:41.709Z"
    }
  ],
  "nextCursor": null
}
```

`data` theo từng type:

| Type | `entityType` / `entityId` | `data` |
|---|---|---|
| `APPLICATION_RECEIVED` | `APPLICATION` / applicationId | `applicationId, jobId, jobTitle, applicantId, applicantName, appliedAt` |
| `JOB_EXPIRED` | `JOB` / jobId | `jobId, jobTitle, deadline` |

### Các API khác

| API | Trả về |
|---|---|
| `GET /api/v1/notifications/unread-count` | `{"count": 3}` |
| `PATCH /api/v1/notifications/{id}/read` | Thông báo sau khi đánh dấu. Gọi lại nhiều lần không sao. Không tồn tại hoặc của người khác: 404 |
| `PATCH /api/v1/notifications/read-all` | `{"updated": 3}` |
| `GET /health` (không qua gateway) | `{"status":"UP","components":{"db":"UP","listener":"UP","kafka":"UP"}}`, có thành phần `DOWN` thì 503 |

Lỗi cùng định dạng với các service Java:

```json
{"timestamp":"…","status":400,"error":"Bad Request","message":"cursor không hợp lệ","path":"/api/v1/notifications?cursor=abc"}
```

## WebSocket

```js
const ws = new WebSocket(`ws://localhost:8080/ws/notifications?access_token=${accessToken}`);
```

Trình duyệt không gửi được header `Authorization` khi mở WebSocket, nên token đi qua query `access_token` và
notification-service tự verify (gateway để route này `permitAll`). Client chỉ nhận, mọi thao tác đi qua REST.

### Message server gửi

| `type` | `data` | Khi nào |
|---|---|---|
| `connected` | không có | Xác thực xong. **Chỉ coi là đã kết nối khi nhận được message này** |
| `notification.created` | Một thông báo, giống item của `GET /api/v1/notifications` | Có thông báo mới |
| `notification.read` | `{"ids": ["…"]}` | Tab / thiết bị khác của cùng user vừa đánh dấu đã đọc |
| `notification.read_all` | `{"readAt": "…"}` | Tab / thiết bị khác vừa đánh dấu tất cả là đã đọc |

### Mã đóng kết nối

| Mã | Ý nghĩa | Frontend nên |
|---|---|---|
| `4001` | Token hết hạn | Refresh token rồi kết nối lại |
| `1002` trước khi nhận `connected` | Token sai (qua gateway: gateway nhận kết nối trước rồi đóng khi service từ chối) | Lấy token mới / đăng nhập lại |
| HTTP 401 khi bắt tay | Token sai (gọi thẳng service, không qua gateway) | Như trên |
| HTTP 403 khi bắt tay | `Origin` không nằm trong `CORS_ALLOWED_ORIGINS` | Sửa cấu hình |
| `1001` | Service đang dừng / deploy | Kết nối lại sau vài giây |
| Khác / mất mạng | | Kết nối lại với backoff |

Thông báo phát ra lúc mất kết nối **không được gửi lại** qua WebSocket. Sau mỗi lần kết nối lại (nhận `connected`),
gọi lại `GET /api/v1/notifications` và `/unread-count`.

## Hướng dẫn frontend

1. Đăng nhập xong: gọi `/unread-count` cho số trên chuông, mở WebSocket.
2. `notification.created`: thêm lên đầu danh sách, tăng số chưa đọc.
3. `notification.read` / `notification.read_all`: cập nhật trạng thái trong danh sách, giảm số chưa đọc.
4. HR bấm vào `APPLICATION_RECEIVED`:
   1. `PATCH /api/v1/notifications/{id}/read`
   2. Chuyển tới trang ứng viên của job `data.jobId`, dữ liệu từ `GET /api/v1/applications/jobs/{jobId}` (user-cv)
   3. Làm nổi bật đơn có id = `entityId`

## Test

```bash
npm test
```

Integration test chạy trên Postgres thật khi đặt `TEST_DATABASE_URL` trỏ tới một database quản trị (vd
`postgres://postgres:<mật khẩu>@localhost:5432/postgres`). Test tự tạo database tạm `notification_test_<ngẫu nhiên>`
rồi xóa khi xong. Không đặt thì chỉ chạy unit test.

## Giới hạn hiện tại

- Thông báo chưa có tên ứng viên: event của user-cv chưa có `applicantName`.
- Danh sách ứng viên (user-cv) chưa có tên; HR chưa lấy được link CV của ứng viên (endpoint link chỉ cho người
  upload hoặc admin).
- Chưa có thông báo cho ứng viên (đổi trạng thái đơn) và cho HR khi ứng viên rút đơn: user-cv chưa phát event.
- Độ trễ apply → thông báo khoảng 2 giây, phần lớn do outbox relay của user-cv quét mỗi 2 giây.
- Token nằm trên URL WebSocket nên có thể xuất hiện trong access log của proxy.
