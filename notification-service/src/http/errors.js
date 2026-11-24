import { logger } from '../logger.js';

export class HttpError extends Error {
  constructor(status, error, message) {
    super(message);
    this.status = status;
    this.error = error;
  }
}

export const badRequest = (message) => new HttpError(400, 'Bad Request', message);
export const unauthorized = (message) => new HttpError(401, 'Unauthorized', message);
export const notFound = (message) => new HttpError(404, 'Not Found', message);

/** Cùng định dạng ErrorResponse của common-lib (Java): {timestamp, status, error, message, path}. */
export function errorHandler(err, req, res, _next) {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) (req.log ?? logger).error({ err, path: req.originalUrl }, 'Lỗi không xử lý được');
  res.status(status).json({
    timestamp: new Date().toISOString(),
    status,
    error: err instanceof HttpError ? err.error : 'Internal Server Error',
    message: err instanceof HttpError ? err.message : 'Đã có lỗi xảy ra',
    path: req.originalUrl,
  });
}

export function notFoundHandler(req, _res, next) {
  next(notFound(`Không có route ${req.method} ${req.path}`));
}
