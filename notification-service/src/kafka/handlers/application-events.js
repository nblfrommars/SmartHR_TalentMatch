import { findJobSnapshot } from '../../jobs/job-snapshot-repo.js';
import { insertNotification } from '../../notifications/notification-repo.js';
import { requireUuids } from '../envelope.js';

export const APPLICATION_EVENTS_TOPIC = 'job.application.events';

/** Chưa có snapshot của job (job.events chưa tới): lỗi tạm thời, thử lại sau. */
export class JobSnapshotMissingError extends Error {
  name = 'JobSnapshotMissingError';
}

/**
 * Topic job.application.events (user-cv). Hiện user-cv mới phát job_application.created;
 * APPLICATION_WITHDRAWN / APPLICATION_STATUS_CHANGED sẽ thêm khi user-cv phát event tương ứng.
 */
export async function handleApplicationEvent(pool, envelope) {
  switch (envelope.type) {
    case 'job_application.created':
      return handleApplicationCreated(pool, envelope);
    default:
      return false;
  }
}

/**
 * Event hiện chưa có tên ứng viên. Nếu user-cv thêm data.applicantName thì tự dùng,
 * không cần sửa gì ở đây; chưa có thì ghi "Một ứng viên".
 */
function applicantNameOf(data) {
  if (typeof data.applicantName !== 'string') return null;
  const name = data.applicantName.trim();
  return name ? name.slice(0, 100) : null;
}

async function handleApplicationCreated(pool, envelope) {
  const { data } = envelope;
  requireUuids(data, ['applicationId', 'jobId', 'applicantId'], envelope.type);

  const job = await findJobSnapshot(pool, data.jobId);
  if (!job) {
    throw new JobSnapshotMissingError(`Chưa có snapshot cho job ${data.jobId}`);
  }

  const applicantName = applicantNameOf(data);
  await insertNotification(pool, {
    recipientId: job.hr_user_id,
    type: 'APPLICATION_RECEIVED',
    title: 'Có ứng viên mới',
    body: `${applicantName ?? 'Một ứng viên'} vừa ứng tuyển vào "${job.title}".`,
    entityType: 'APPLICATION',
    entityId: data.applicationId,
    // FE dùng jobId để mở danh sách ứng viên (GET /api/v1/applications/jobs/{jobId} của user-cv)
    // và applicationId để làm nổi bật đơn vừa nộp
    data: {
      applicationId: data.applicationId,
      jobId: data.jobId,
      jobTitle: job.title,
      applicantId: data.applicantId,
      applicantName,
      appliedAt: data.appliedAt ?? null,
    },
    sourceEventId: envelope.eventId,
  });
  return true;
}
