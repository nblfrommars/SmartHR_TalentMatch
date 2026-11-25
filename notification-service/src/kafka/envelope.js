import { isUuid } from '../notifications/cursor.js';

/** Lỗi không thể sửa bằng cách thử lại (JSON hỏng, thiếu trường): đẩy thẳng vào DLQ. */
export class PoisonMessageError extends Error {
  name = 'PoisonMessageError';
}

/**
 * Parse EventEnvelope của common-lib:
 * {eventId, type, version, occurredAt, producer, correlationId, data}
 */
export function parseEnvelope(value) {
  if (value == null) throw new PoisonMessageError('Message rỗng');
  let envelope;
  try {
    envelope = JSON.parse(value.toString('utf8'));
  } catch (err) {
    throw new PoisonMessageError(`JSON không hợp lệ: ${err.message}`);
  }
  if (!envelope || typeof envelope !== 'object') throw new PoisonMessageError('Envelope không phải object');
  if (!isUuid(envelope.eventId)) throw new PoisonMessageError('Thiếu hoặc sai eventId');
  if (typeof envelope.type !== 'string') throw new PoisonMessageError('Thiếu type');
  if (!envelope.data || typeof envelope.data !== 'object') throw new PoisonMessageError('Thiếu data');
  return envelope;
}

/** Kiểm tra các trường uuid bắt buộc trong data, thiếu thì là poison message. */
export function requireUuids(data, fields, eventType) {
  for (const field of fields) {
    if (!isUuid(data[field])) {
      throw new PoisonMessageError(`${eventType}: data.${field} thiếu hoặc không phải UUID`);
    }
  }
}
