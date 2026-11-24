import { logger } from '../logger.js';
import { deleteExpired } from '../notifications/notification-repo.js';

/**
 * Định kỳ xóa thông báo cũ. Nhiều instance cùng chạy cũng không sao: DELETE theo điều kiện thời
 * gian, chạy trùng chỉ là xóa 0 dòng.
 */
export function startRetentionJob(pool, { intervalMs, readDays, maxDays }) {
  let running = false;

  async function runOnce() {
    if (running) return;
    running = true;
    try {
      const deleted = await deleteExpired(pool, { readDays, maxDays });
      if (deleted > 0) logger.info({ deleted, readDays, maxDays }, 'Đã xóa thông báo cũ');
    } catch (err) {
      logger.error({ err }, 'Dọn thông báo cũ thất bại');
    } finally {
      running = false;
    }
  }

  const timer = setInterval(runOnce, intervalMs);
  timer.unref();
  return {
    runOnce,
    stop: () => clearInterval(timer),
  };
}
