import client from 'prom-client';
import { logger } from './logger.js';

/**
 * Metrics Prometheus, lộ ở GET /metrics (không qua gateway: gateway chỉ route /api/v1/notifications/**).
 * Một registry cho cả process; các gauge lấy số liệu lúc scrape qua các hàm đăng ký bằng setMetricSources().
 */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'notification_' });

const sources = {
  wsConnections: () => ({ users: 0, sockets: 0 }),
  kafkaLag: async () => [],
};

/** Đăng ký nguồn số liệu cho gauge (gọi lúc khởi động, sau khi tạo registry kết nối / Kafka consumer). */
export function setMetricSources(partial) {
  Object.assign(sources, partial);
}

export const httpDuration = new client.Histogram({
  name: 'notification_http_request_duration_seconds',
  help: 'Thời gian xử lý request HTTP',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export const notificationsCreated = new client.Counter({
  name: 'notification_created_total',
  help: 'Số thông báo đã tạo (không tính event gửi lại bị bỏ qua)',
  labelNames: ['type'],
  registers: [registry],
});

export const kafkaMessages = new client.Counter({
  name: 'notification_kafka_messages_total',
  help: 'Số message Kafka đã xử lý theo kết quả: handled / ignored / dlq',
  labelNames: ['topic', 'result'],
  registers: [registry],
});

export const wsAuthFailures = new client.Counter({
  name: 'notification_ws_auth_failures_total',
  help: 'Số kết nối WebSocket bị đóng vì không xác thực được',
  labelNames: ['reason'],
  registers: [registry],
});

new client.Gauge({
  name: 'notification_ws_connections',
  help: 'Số kết nối WebSocket đã xác thực trên instance này',
  registers: [registry],
  collect() {
    this.set(sources.wsConnections().sockets);
  },
});

new client.Gauge({
  name: 'notification_ws_users',
  help: 'Số user đang có ít nhất một kết nối WebSocket trên instance này',
  registers: [registry],
  collect() {
    this.set(sources.wsConnections().users);
  },
});

new client.Gauge({
  name: 'notification_kafka_consumer_lag',
  help: 'Số message chưa xử lý của consumer group theo partition',
  labelNames: ['topic', 'partition'],
  registers: [registry],
  async collect() {
    this.reset();
    try {
      for (const { topic, partition, lag } of await sources.kafkaLag()) {
        this.set({ topic, partition: String(partition) }, lag);
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Không lấy được Kafka consumer lag');
    }
  },
});
