import { Router } from 'express';
import { decodeCursor, isUuid } from '../notifications/cursor.js';
import { toNotificationDto } from '../notifications/notification-dto.js';
import {
  countUnread,
  listForRecipient,
  markAllRead,
  markRead,
} from '../notifications/notification-repo.js';
import { badRequest, notFound } from './errors.js';
import { requireUser } from './identity.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseLimit(raw) {
  if (raw === undefined) return DEFAULT_LIMIT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw badRequest(`limit phải là số nguyên từ 1 đến ${MAX_LIMIT}`);
  }
  return limit;
}

/** /api/v1/notifications: mọi route chỉ thao tác trên thông báo của chính người gọi. */
export function notificationRoutes(pool) {
  const router = Router();
  router.use(requireUser);

  // GET /api/v1/notifications?limit=20&cursor=<nextCursor của trang trước>
  router.get('/', async (req, res) => {
    const limit = parseLimit(req.query.limit);
    let after = null;
    if (req.query.cursor !== undefined) {
      after = decodeCursor(String(req.query.cursor));
      if (!after) throw badRequest('cursor không hợp lệ');
    }
    const { rows, nextCursor } = await listForRecipient(pool, req.userId, { limit, after });
    res.json({ items: rows.map(toNotificationDto), nextCursor });
  });

  router.get('/unread-count', async (req, res) => {
    res.json({ count: await countUnread(pool, req.userId) });
  });

  // Đặt trước /:id/read để "read-all" không bị hiểu là một id
  router.patch('/read-all', async (req, res) => {
    res.json({ updated: await markAllRead(pool, req.userId) });
  });

  router.patch('/:id/read', async (req, res) => {
    if (!isUuid(req.params.id)) throw badRequest('id không phải UUID');
    const row = await markRead(pool, req.params.id, req.userId);
    if (!row) throw notFound('Không tìm thấy thông báo');
    res.json(toNotificationDto(row));
  });

  return router;
}
