import { isUuid } from '../notifications/cursor.js';
import { unauthorized } from './errors.js';

/**
 * Gateway đã verify JWT, xóa header X-User-* client tự gửi và gắn lại X-User-Id = sub.
 * Service tin header này, nên cổng của service không được mở ra ngoài mạng nội bộ.
 */
export function requireUser(req, _res, next) {
  const userId = req.get('X-User-Id');
  if (!isUuid(userId)) return next(unauthorized('Thiếu hoặc sai X-User-Id'));
  req.userId = userId;
  next();
}
