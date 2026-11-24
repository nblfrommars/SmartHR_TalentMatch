/**
 * Cursor phân trang keyset = (created_at, id) của dòng cuối trang.
 * created_at giữ nguyên dạng text Postgres trả về (độ chính xác micro giây); đổi sang Date của JS
 * sẽ mất 3 chữ số cuối và làm trang sau lặp hoặc sót dòng.
 */
export function encodeCursor(createdAtText, id) {
  return Buffer.from(JSON.stringify([createdAtText, id]), 'utf8').toString('base64url');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trả về { createdAt, id } hoặc null nếu cursor không hợp lệ. */
export function decodeCursor(cursor) {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [createdAt, id] = parsed;
    if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) return null;
    if (typeof id !== 'string' || !UUID_RE.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}
