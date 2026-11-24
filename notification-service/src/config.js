function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) throw new Error(`${name} phải là số nguyên, nhận được "${raw}"`);
  return value;
}

function list(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = Object.freeze({
  port: int('PORT', 8084),
  logLevel: process.env.LOG_LEVEL ?? 'info',

  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/notification_db',

  kafka: Object.freeze({
    enabled: process.env.KAFKA_ENABLED !== 'false',
    brokers: list('KAFKA_BROKERS', ['localhost:9095']),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'notification-service',
    groupId: process.env.KAFKA_GROUP_ID ?? 'notification-service',
    // Thời gian chờ giữa các lần thử lại một message lỗi, hết thì đẩy vào <topic>.DLQ
    retryBackoffMs: list('KAFKA_RETRY_BACKOFF_MS', ['1000', '5000', '30000']).map(Number),
  }),

  auth: Object.freeze({
    // Keycloak: issuer phải trùng claim "iss" (URL trình duyệt thấy), JWKS lấy qua mạng nội bộ
    issuer: process.env.AUTH_ISSUER_URI ?? 'http://localhost:8180/realms/smarthr',
    jwksUri:
      process.env.AUTH_JWK_SET_URI ??
      'http://localhost:8180/realms/smarthr/protocol/openid-connect/certs',
  }),

  ws: Object.freeze({
    path: process.env.WS_PATH ?? '/ws/notifications',
    heartbeatMs: int('WS_HEARTBEAT_MS', 30000),
    // Thời gian tối đa từ lúc mở kết nối tới khi client gửi message auth
    authTimeoutMs: int('WS_AUTH_TIMEOUT_MS', 5000),
    // Cùng biến và giá trị mặc định với gateway / user-service
    allowedOrigins: list('CORS_ALLOWED_ORIGINS', ['http://localhost:5173', 'http://localhost:5174']),
  }),

  retention: Object.freeze({
    intervalMs: int('RETENTION_INTERVAL_MS', 60 * 60 * 1000),
    // Thông báo đã đọc giữ 90 ngày; chưa đọc cũng xóa sau 180 ngày
    readDays: int('RETENTION_READ_DAYS', 90),
    maxDays: int('RETENTION_MAX_DAYS', 180),
  }),
});
