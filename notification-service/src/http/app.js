import express from 'express';
import { errorHandler, notFoundHandler } from './errors.js';
import { notificationRoutes } from './notification-routes.js';
import { requestLogger } from './request-logger.js';
import { registry } from '../metrics.js';

/**
 * @param checks các hàm trả về true/false cho từng thành phần chạy nền, vd
 *   { kafka: () => consumer.isHealthy(), listener: () => listener.isListening() }.
 *   Thành phần bị tắt (KAFKA_ENABLED=false) thì không truyền vào.
 */
export function createApp({ pool, checks = {} }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    const components = {};
    try {
      await pool.query('SELECT 1');
      components.db = 'UP';
    } catch {
      components.db = 'DOWN';
    }
    for (const [name, check] of Object.entries(checks)) {
      components[name] = check() ? 'UP' : 'DOWN';
    }
    const up = Object.values(components).every((s) => s === 'UP');
    res.status(up ? 200 : 503).json({ status: up ? 'UP' : 'DOWN', components });
  });

  // Cho Prometheus scrape trong mạng nội bộ; gateway không route tới đây
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  });

  app.use('/api/v1/notifications', notificationRoutes(pool));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
