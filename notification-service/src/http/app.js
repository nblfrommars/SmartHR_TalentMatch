import express from 'express';
import { errorHandler, notFoundHandler } from './errors.js';
import { notificationRoutes } from './notification-routes.js';

export function createApp({ pool }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'UP' });
    } catch {
      res.status(503).json({ status: 'DOWN' });
    }
  });

  app.use('/api/v1/notifications', notificationRoutes(pool));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
