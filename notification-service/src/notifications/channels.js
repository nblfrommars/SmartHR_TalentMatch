/** Kênh LISTEN/NOTIFY của Postgres. Mọi instance đều LISTEN cả hai kênh. */

// Trigger trg_notifications_created phát khi INSERT (payload = row_to_json của dòng mới)
export const NOTIFICATION_CREATED_CHANNEL = 'notification_created';

// Ứng dụng phát khi đánh dấu đã đọc, để các tab khác của cùng user (có thể nằm ở instance khác)
// cập nhật theo. Payload: {"recipientId","ids":[...]} hoặc {"recipientId","all":true,"readAt"}
export const NOTIFICATION_READ_CHANNEL = 'notification_read';

export async function publishRead(db, payload) {
  await db.query('SELECT pg_notify($1, $2)', [NOTIFICATION_READ_CHANNEL, JSON.stringify(payload)]);
}
