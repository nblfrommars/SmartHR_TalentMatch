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
| `WS_AUTH_TIMEOUT_MS` | `5000` | Thời gian tối đa từ lúc mở kết nối tới khi client gửi `auth` |
| `RETENTION_INTERVAL_MS` | `3600000` | Chu kỳ dọn thông báo cũ |
| `RETENTION_READ_DAYS` | `90` | Xóa thông báo đã đọc quá số ngày này |
| `RETENTION_MAX_DAYS` | `180` | Xóa mọi thông báo quá số ngày này |
| `RETENTION_DELETED_JOB_DAYS` | `30` | Xóa snapshot của job đã xóa quá số ngày này |
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
| `GET /metrics` (không qua gateway) | Metrics Prometheus, xem mục [Vận hành](#vận-hành) |

Lỗi cùng định dạng với các service Java:

```json
{"timestamp":"…","status":400,"error":"Bad Request","message":"cursor không hợp lệ","path":"/api/v1/notifications?cursor=abc"}
```

## WebSocket

Token **không** đi trên URL (tránh lộ trong access log của gateway / proxy). Giống frame `CONNECT` của STOMP, client
mở kết nối trước rồi gửi token bằng message đầu tiên. Gateway để route này `permitAll`; notification-service tự
verify token Keycloak.

```js
const ws = new WebSocket('ws://localhost:8080/ws/notifications');
ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: accessToken }));
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  // msg.type: connected | auth.renewed | notification.created | notification.read | notification.read_all
};
```

- Phải gửi `auth` trong **5 giây** (`WS_AUTH_TIMEOUT_MS`) sau khi mở, nếu không bị đóng mã `4401`.
- Trước khi xác thực, message khác `auth` (hoặc lớn hơn 16KB) đều làm đóng kết nối.
- **Gia hạn không cần kết nối lại:** khi refresh được access token mới, gửi lại
  `{"type":"auth","token":"<token mới>"}` trên kết nối đang mở. Token phải của cùng user, nếu không bị đóng `4401`.
  Nên gửi trước `expiresAt` một chút (vd khi frontend refresh token).
- Sau khi xác thực, client chỉ nhận; mọi thao tác (đánh dấu đã đọc…) đi qua REST. Message khác `auth` bị bỏ qua.

### Message client gửi

| `type` | Trường | Khi nào |
|---|---|---|
| `auth` | `token`: access token Keycloak | Ngay sau khi mở kết nối, và mỗi lần có token mới |

### Message server gửi

| `type` | `data` | Khi nào |
|---|---|---|
| `connected` | `{"expiresAt": "…"}` | Xác thực xong. **Chỉ coi là đã kết nối khi nhận được message này** |
| `auth.renewed` | `{"expiresAt": "…"}` | Gia hạn bằng token mới thành công |
| `notification.created` | Một thông báo, giống item của `GET /api/v1/notifications` | Có thông báo mới |
| `notification.read` | `{"ids": ["…"]}` | Tab / thiết bị khác của cùng user vừa đánh dấu đã đọc |
| `notification.read_all` | `{"readAt": "…"}` | Tab / thiết bị khác vừa đánh dấu tất cả là đã đọc |

### Mã đóng kết nối

| Mã | Ý nghĩa | Frontend nên |
|---|---|---|
| `4001` | Token hết hạn mà chưa gửi token mới | Refresh token rồi kết nối lại |
| `4401` | Không xác thực được: token sai, quá 5 giây chưa gửi `auth`, message đầu không phải `auth`, hoặc gia hạn bằng token của user khác | Lấy token mới / đăng nhập lại rồi kết nối lại |
| `1009` | Message quá lớn (> 16KB) | Lỗi phía client |
| HTTP 403 khi bắt tay | `Origin` không nằm trong `CORS_ALLOWED_ORIGINS` | Sửa cấu hình |
| `1001` | Service đang dừng / deploy | Kết nối lại sau vài giây |
| Khác / mất mạng | | Kết nối lại với backoff |

Thông báo phát ra lúc mất kết nối **không được gửi lại** qua WebSocket. Sau mỗi lần kết nối lại (nhận `connected`),
gọi lại `GET /api/v1/notifications` và `/unread-count`.

## Hướng dẫn frontend

1. Đăng nhập xong: gọi `/unread-count` cho số trên chuông, mở WebSocket và gửi `auth`.
2. Tự gia hạn token trên WebSocket trước khi hết hạn (xem client mẫu bên dưới).
3. `notification.created`: thêm lên đầu danh sách, tăng số chưa đọc.
4. `notification.read` / `notification.read_all`: cập nhật trạng thái trong danh sách, giảm số chưa đọc.
5. HR bấm vào `APPLICATION_RECEIVED`:
   1. `PATCH /api/v1/notifications/{id}/read`
   2. Chuyển tới trang ứng viên của job `data.jobId`, dữ liệu từ `GET /api/v1/applications/jobs/{jobId}` (user-cv)
   3. Làm nổi bật đơn có id = `entityId`

### Client WebSocket mẫu

Frontend hiện chỉ refresh token khi gọi API (`getValidToken()` trong `frontend/src/auth/keycloak.js`). Access token
Keycloak sống 5 phút, nên tab để yên không gọi API sẽ bị đóng `4001`. Client dưới đây tự refresh trước khi hết hạn và
gửi lại `auth` trên kết nối đang mở, nên người dùng không bị ngắt; mất mạng / service deploy thì tự kết nối lại và lấy
lại thông báo bị lỡ.

```js
import keycloak from './auth/keycloak';

const WS_URL = `${import.meta.env.VITE_GATEWAY_WS_URL ?? 'ws://localhost:8080'}/ws/notifications`;
const RENEW_BEFORE_MS = 60_000;

/**
 * onEvent(msg): nhận notification.created / notification.read / notification.read_all
 * onReconnected(): gọi lại GET /api/v1/notifications và /unread-count để lấy thông báo bị lỡ
 * Trả về hàm đóng kết nối (gọi khi đăng xuất / unmount).
 */
export function connectNotifications({ onEvent, onReconnected }) {
  let ws;
  let renewTimer;
  let retry = 0;
  let stopped = false;

  async function sendAuth() {
    await keycloak.updateToken(RENEW_BEFORE_MS / 1000); // refresh nếu còn dưới 60 giây
    ws.send(JSON.stringify({ type: 'auth', token: keycloak.token }));
  }

  // Refresh token thất bại = phiên Keycloak đã hết: dừng hẳn và đưa về trang đăng nhập
  function sessionEnded() {
    stopped = true;
    clearTimeout(renewTimer);
    ws.close();
    keycloak.login();
  }

  function scheduleRenew(expiresAt) {
    clearTimeout(renewTimer);
    const delay = Math.max(0, Date.parse(expiresAt) - Date.now() - RENEW_BEFORE_MS);
    renewTimer = setTimeout(() => sendAuth().catch(sessionEnded), delay);
  }

  function open() {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => sendAuth().catch(sessionEnded);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'connected' || msg.type === 'auth.renewed') {
        if (msg.type === 'connected') {
          retry = 0;
          onReconnected?.();
        }
        scheduleRenew(msg.data.expiresAt);
        return;
      }
      onEvent(msg);
    };
    ws.onclose = (e) => {
      clearTimeout(renewTimer);
      if (stopped) return;
      // 4001, 4401, 1001, mất mạng...: kết nối lại (sendAuth tự refresh token), chờ 1s, 2s, 4s… tối đa 30s
      setTimeout(open, Math.min(30_000, 1000 * 2 ** retry++));
    };
  }

  open();
  return () => {
    stopped = true;
    clearTimeout(renewTimer);
    ws?.close();
  };
}
```

Lưu ý: client tự gia hạn nên phiên Keycloak **không hết vì không hoạt động** (mặc định 30 phút) khi tab còn mở; người
dùng chỉ bị đăng xuất khi chạm thời hạn tối đa của phiên (mặc định 10 giờ). Nếu muốn "để yên 30 phút thì đăng xuất",
client phải ngừng gia hạn khi người dùng không thao tác.

## Vận hành

### Log

Log JSON (pino) ra stdout. Mỗi request HTTP ghi một dòng `"HTTP request"` gồm `method`, `path`, `status`,
`durationMs`, `userId`, `correlationId` (bỏ qua `/health`, `/metrics` khi thành công). Request 4xx ghi mức `warn`,
5xx mức `error`.

`X-Correlation-Id`: nhận từ gateway (header hợp lệ: tối đa 128 ký tự chữ, số, `_ . : -`), thiếu hoặc không hợp lệ thì
tự sinh; luôn trả lại trong response. Log của Kafka consumer dùng `correlationId` trong envelope của event.
Token không bao giờ được ghi ra log.

### Metrics (`GET /metrics`)

| Metric | Loại | Nhãn | Ý nghĩa |
|---|---|---|---|
| `notification_http_request_duration_seconds` | histogram | `method`, `route`, `status` | Thời gian xử lý request (`route` đã thay UUID bằng `:id`) |
| `notification_created_total` | counter | `type` | Số thông báo đã tạo |
| `notification_kafka_messages_total` | counter | `topic`, `result` | Message đã xử lý: `handled` / `ignored` / `dlq` |
| `notification_kafka_consumer_lag` | gauge | `topic`, `partition` | Số message chưa xử lý (tính lúc scrape) |
| `notification_ws_connections` | gauge | | Kết nối WebSocket đã xác thực trên instance này |
| `notification_ws_users` | gauge | | Số user đang kết nối trên instance này |
| `notification_ws_auth_failures_total` | counter | `reason` | Kết nối bị đóng 4401: `timeout` / `invalid_token` / `bad_message` / `user_mismatch` |
| `notification_process_*`, `notification_nodejs_*` | | | Metrics mặc định của Node (CPU, RAM, event loop…) |

Nên cảnh báo khi: `notification_kafka_consumer_lag` tăng liên tục, `notification_kafka_messages_total{result="dlq"}`
tăng, hoặc `/health` trả 503.

### Đẩy lại message từ DLQ

Message lỗi nằm ở `job.events.DLQ` / `job.application.events.DLQ` (header `x-dlq-error` ghi lý do). Sau khi sửa
nguyên nhân (deploy bản sửa, hoặc dữ liệu thiếu đã tới), đẩy lại về topic gốc:

```bash
# Trong container: docker exec -it smarthr-notification-service sh
npm run dlq:replay -- --topic job.application.events --dry-run   # xem trước: offset, eventId, type, lỗi
npm run dlq:replay -- --topic job.application.events --limit 1   # thử 1 message
npm run dlq:replay -- --topic job.application.events             # đẩy lại tất cả
```

- Chỉ đẩy các message có trong DLQ lúc bắt đầu chạy. Đẩy xong message nào thì commit message đó (consumer group
  `notification-service-dlq-replay`), chạy lại không đẩy trùng. `--dry-run` không đẩy, không commit.
- Giữ nguyên key, value, header gốc; bỏ header `x-dlq-*`, thêm `x-dlq-replay-count`. Message vẫn lỗi sẽ quay lại DLQ
  với số lần đã đẩy lại.
- An toàn khi đẩy lại message đã xử lý: thông báo chống trùng theo `eventId`.

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
