import { withTransaction } from '../../db/pool.js';
import { upsertJobSnapshot } from '../../jobs/job-snapshot-repo.js';
import { insertNotification } from '../../notifications/notification-repo.js';
import { PoisonMessageError, requireUuids } from '../envelope.js';

export const JOB_EVENTS_TOPIC = 'job.events';

const JOB_EVENT_TYPES = new Set([
  'job.created',
  'job.updated',
  'job.closed',
  'job.expired',
  'job.deleted',
]);

/**
 * Topic job.events (job-service), data = JobRes. Chỉ dùng id, createdBy, title, status, version;
 * không dùng companyId vì DATAFORAISERVICE.md không có trường này.
 * Trả về true nếu đã xử lý, false nếu loại event không liên quan.
 */
export async function handleJobEvent(pool, envelope) {
  if (!JOB_EVENT_TYPES.has(envelope.type)) return false;
  const { data } = envelope;
  requireUuids(data, ['id', 'createdBy'], envelope.type);
  if (typeof data.title !== 'string' || !Number.isInteger(data.version)) {
    throw new PoisonMessageError(`${envelope.type}: thiếu title hoặc version`);
  }

  const snapshot = {
    jobId: data.id,
    hrUserId: data.createdBy,
    title: data.title,
    // job.deleted vẫn gửi status cũ, service tự đánh dấu để giữ lại tên job cho thông báo về sau
    status: envelope.type === 'job.deleted' ? 'DELETED' : data.status,
    version: data.version,
  };

  await withTransaction(pool, async (client) => {
    await upsertJobSnapshot(client, snapshot);

    if (envelope.type === 'job.expired') {
      await insertNotification(client, {
        recipientId: data.createdBy,
        type: 'JOB_EXPIRED',
        title: 'Tin tuyển dụng đã hết hạn',
        body: `Tin "${data.title}" đã quá hạn nộp hồ sơ và được đóng tự động.`,
        entityType: 'JOB',
        entityId: data.id,
        data: { jobId: data.id, jobTitle: data.title, deadline: data.deadline ?? null },
        sourceEventId: envelope.eventId,
      });
    }
  });
  return true;
}
