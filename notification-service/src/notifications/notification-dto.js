function iso(value) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Dòng notifications (snake_case, từ pg hoặc từ row_to_json của pg_notify) → JSON trả cho client.
 * Hai nguồn trả timestamp khác nhau (Date vs chuỗi), nên chuẩn hóa về ISO.
 */
export function toNotificationDto(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body ?? null,
    entityType: row.entity_type ?? null,
    entityId: row.entity_id ?? null,
    data: row.data ?? {},
    read: row.read_at != null,
    readAt: iso(row.read_at),
    createdAt: iso(row.created_at),
  };
}
