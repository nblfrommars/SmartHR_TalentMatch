import { logger } from '../logger.js';
import { deleteOldDeletedJobs } from '../jobs/job-snapshot-repo.js';
import { deleteExpired } from '../notifications/notification-repo.js';

/**
 * Định kỳ xóa thông báo cũ và snapshot của job đã xóa lâu ngày. Nhiều instance cùng chạy cũng không sao: DELETE theo điều kiện thời
 * gian, chạy trùng chỉ là xóa 0 dòng.
 */
export function startRetentionJob(pool, { intervalMs, readDays, maxDays, deletedJobDays }) {
  let running = false;

  async function runOnce() {
    if (running) return;
    running = true;
    try {
      const deleted = await deleteExpired(pool, { readDays, maxDays });
      if (deleted > 0) logger.info({ deleted, readDays, maxDays }, 'Đã xóa thông báo cũ');
      const jobs = await deleteOldDeletedJobs(pool, deletedJobDays);
      if (jobs > 0) logger.info({ deleted: jobs, deletedJobDays }, 'Đã xóa snapshot của job đã xóa');
    } catch (err) {
      logger.error({ err }, 'Dọn dữ liệu cũ thất bại');
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
