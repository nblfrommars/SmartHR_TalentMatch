import http from 'node:http';
import { config } from './config.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './http/app.js';
import { startConsumer } from './kafka/consumer.js';
import { logger } from './logger.js';
import { ConnectionRegistry } from './realtime/connection-registry.js';
import { startPgListener } from './realtime/pg-listener.js';
import { createTokenVerifier } from './realtime/token-verifier.js';
import { attachWebSocketServer } from './realtime/ws-server.js';

const pool = createPool();
await runMigrations(pool);

const registry = new ConnectionRegistry();
const server = http.createServer(createApp({ pool }));
const ws = attachWebSocketServer(server, {
  path: config.ws.path,
  heartbeatMs: config.ws.heartbeatMs,
  verifyToken: createTokenVerifier(config.auth),
  registry,
});
const stopListener = startPgListener({ connectionString: config.databaseUrl, registry });
const stopConsumer = config.kafka.enabled ? await startConsumer(pool) : null;
if (!stopConsumer) logger.warn('KAFKA_ENABLED=false: không nhận event, chỉ chạy REST và WebSocket');

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
    await stopConsumer?.();
    await ws.close();
    await new Promise((resolve) => server.close(resolve));
    await stopListener();
    await pool.end();
  } catch (err) {
    logger.error({ err }, 'Lỗi khi dừng');
    process.exitCode = 1;
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
