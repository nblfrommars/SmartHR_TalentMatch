import { notificationsCreated } from '../metrics.js';
import { publishRead } from './channels.js';
import { encodeCursor } from './cursor.js';

const COLUMNS = `id, recipient_id, type, title, body, entity_type, entity_id, data,
                 source_event_id, read_at, created_at`;
const COLUMNS_N = COLUMNS.split(',').map((c) => `n.${c.trim()}`).join(', ');

/**
 * Thêm thông báo. Event bị gửi lại (cùng source_event_id + recipient_id) thì bỏ qua và trả về null.
 * @param db pg Pool hoặc client đang trong transaction
 */
export async function insertNotification(db, n) {
  const { rows } = await db.query(
    `INSERT INTO notifications
        (recipient_id, type, title, body, entity_type, entity_id, data, source_event_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (source_event_id, recipient_id) DO NOTHING
     RETURNING ${COLUMNS}`,
    [
      n.recipientId,
      n.type,
      n.title,
      n.body ?? null,
      n.entityType ?? null,
      n.entityId ?? null,
      JSON.stringify(n.data ?? {}),
      n.sourceEventId,
    ],
  );
  const row = rows[0] ?? null;
  if (row) notificationsCreated.inc({ type: row.type });
  return row;
}

/** Trang thông báo mới nhất trước. Trả về { rows, nextCursor }. */
export async function listForRecipient(db, recipientId, { limit, after }) {
  const params = [recipientId, limit + 1];
  let keyset = '';
  if (after) {
    params.push(after.createdAt, after.id);
    keyset = 'AND (created_at, id) < ($3::timestamptz, $4::uuid)';
  }
  const { rows } = await db.query(
    `SELECT ${COLUMNS}, created_at::text AS created_at_cursor
       FROM notifications
      WHERE recipient_id = $1 ${keyset}
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    params,
  );
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor: hasMore ? encodeCursor(last.created_at_cursor, last.id) : null,
  };
}

export async function countUnread(db, recipientId) {
  const { rows } = await db.query(
    'SELECT count(*)::int AS count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL',
    [recipientId],
  );
  return rows[0].count;
}

/**
 * Đánh dấu đã đọc. Gọi lại nhiều lần vẫn giữ read_at lần đầu; chỉ lần chuyển từ chưa đọc sang
 * đã đọc mới phát notification_read cho các tab khác.
 * Trả về null nếu không tồn tại hoặc không thuộc người này (không phân biệt, tránh lộ id).
 */
export async function markRead(db, id, recipientId) {
  const { rows } = await db.query(
    `WITH target AS (
        SELECT id, read_at IS NULL AS was_unread
          FROM notifications
         WHERE id = $1 AND recipient_id = $2
         FOR UPDATE
     )
     UPDATE notifications n SET read_at = COALESCE(n.read_at, now())
       FROM target t
      WHERE n.id = t.id
      RETURNING ${COLUMNS_N}, t.was_unread`,
    [id, recipientId],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.was_unread) await publishRead(db, { recipientId, ids: [row.id] });
  return row;
}

export async function markAllRead(db, recipientId) {
  const { rows, rowCount } = await db.query(
    `UPDATE notifications SET read_at = now()
      WHERE recipient_id = $1 AND read_at IS NULL
      RETURNING read_at`,
    [recipientId],
  );
  if (rowCount > 0) {
    await publishRead(db, { recipientId, all: true, readAt: rows[0].read_at.toISOString() });
  }
  return rowCount;
}

/**
 * Xóa thông báo cũ theo lô, để không khóa bảng lâu. Trả về số dòng đã xóa.
 * Đã đọc quá readDays ngày, hoặc (kể cả chưa đọc) quá maxDays ngày.
 */
export async function deleteExpired(db, { readDays, maxDays, batchSize = 5000 }) {
  let total = 0;
  for (;;) {
    const { rowCount } = await db.query(
      `DELETE FROM notifications
        WHERE id IN (
          SELECT id FROM notifications
           WHERE (read_at IS NOT NULL AND read_at < now() - make_interval(days => $1))
              OR created_at < now() - make_interval(days => $2)
           LIMIT $3)`,
      [readDays, maxDays, batchSize],
    );
    total += rowCount;
    if (rowCount < batchSize) return total;
  }
}
