import { randomUUID } from 'node:crypto';
import { logger } from '../logger.js';
import { httpDuration } from '../metrics.js';

export const CORRELATION_HEADER = 'X-Correlation-Id';

// Header do client gửi: chỉ nhận chuỗi ngắn an toàn để không ghi rác / chèn dòng vào log
const SAFE_CORRELATION_ID = /^[\w.:-]{1,128}$/;
const UUID_IN_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const KNOWN_PREFIXES = ['/api/v1/notifications', '/health', '/metrics'];
const QUIET_PATHS = new Set(['/health', '/metrics']);

/**
 * Nhãn route cho metrics: thay UUID bằng :id, path lạ gộp thành "other" để số nhãn không tăng vô hạn.
 */
export function routeLabel(path) {
  const normalized = path.replace(UUID_IN_PATH, ':id');
  return KNOWN_PREFIXES.some((p) => normalized === p || normalized.startsWith(`${p}/`)) ? normalized : 'other';
}

/**
 * Gắn correlation-id (nhận từ gateway hoặc tự sinh), trả lại trong response, tạo req.log có sẵn
 * correlationId, ghi một dòng log và metrics cho mỗi request.
 */
export function requestLogger(req, res, next) {
  const incoming = req.get(CORRELATION_HEADER);
  const correlationId = incoming && SAFE_CORRELATION_ID.test(incoming) ? incoming : randomUUID();
  res.set(CORRELATION_HEADER, correlationId);
  req.correlationId = correlationId;
  req.log = logger.child({ correlationId });

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const path = req.originalUrl.split('?')[0];
    httpDuration.observe({ method: req.method, route: routeLabel(path), status: res.statusCode }, seconds);
    if (QUIET_PATHS.has(path) && res.statusCode < 500) return;

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    req.log[level](
      {
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(seconds * 1000),
        userId: req.userId,
      },
      'HTTP request',
    );
  });
  next();
}
