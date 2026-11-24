/**
 * Upsert snapshot job. So sánh bằng <= chứ không phải <: job.deleted gửi snapshot ngay trước khi xóa,
 * version bằng bản đang lưu, dùng < thì event xóa bị bỏ qua.
 * Trả về true nếu đã ghi, false nếu event cũ hơn bản đang lưu.
 */
export async function upsertJobSnapshot(db, s) {
  const { rowCount } = await db.query(
    `INSERT INTO job_snapshots (job_id, hr_user_id, title, status, version)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (job_id) DO UPDATE
        SET hr_user_id = EXCLUDED.hr_user_id,
            title      = EXCLUDED.title,
            status     = EXCLUDED.status,
            version    = EXCLUDED.version,
            updated_at = now()
      WHERE job_snapshots.version <= EXCLUDED.version`,
    [s.jobId, s.hrUserId, s.title, s.status, s.version],
  );
  return rowCount > 0;
}

export async function findJobSnapshot(db, jobId) {
  const { rows } = await db.query(
    'SELECT job_id, hr_user_id, title, status, version FROM job_snapshots WHERE job_id = $1',
    [jobId],
  );
  return rows[0] ?? null;
}
