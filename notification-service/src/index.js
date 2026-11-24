import http from 'node:http';
import { config } from './config.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './http/app.js';
import { startConsumer } from './kafka/consumer.js';
import { logger } from './logger.js';
import { startRetentionJob } from './maintenance/retention.js';
import { ConnectionRegistry } from './realtime/connection-registry.js';
import { startPgListener } from './realtime/pg-listener.js';
import { createTokenVerifier } from './realtime/token-verifier.js';
import { attachWebSocketServer } from './realtime/ws-server.js';

const pool = createPool();
await runMigrations(pool);

const registry = new ConnectionRegistry();
const listener = startPgListener({ connectionString: config.databaseUrl, registry });
const consumer = config.kafka.enabled ? await startConsumer(pool) : null;
if (!consumer) logger.warn('KAFKA_ENABLED=false: không nhận event, chỉ chạy REST và WebSocket');
const retention = startRetentionJob(pool, config.retention);

const checks = { listener: listener.isListening };
if (consumer) checks.kafka = consumer.isHealthy;

const server = http.createServer(createApp({ pool, checks }));
const ws = attachWebSocketServer(server, {
  path: config.ws.path,
  heartbeatMs: config.ws.heartbeatMs,
  authTimeoutMs: config.ws.authTimeoutMs,
  allowedOrigins: config.ws.allowedOrigins,
  verifyToken: createTokenVerifier(config.auth),
  registry,
});

server.listen(config.port, () => {
  logger.info({ port: config.port, wsPath: config.ws.path }, 'notification-service đã chạy');
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Đang dừng');
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  try {
    retention.stop();
    await consumer?.stop();
    await ws.close();
    await new Promise((resolve) => server.close(resolve));
    await listener.stop();
    await pool.end();
  } catch (err) {
    logger.error({ err }, 'Lỗi khi dừng');
    process.exitCode = 1;
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
