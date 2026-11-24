import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { processMessage } from '../src/kafka/consumer.js';
import { parseEnvelope, PoisonMessageError } from '../src/kafka/envelope.js';
import { decodeCursor, encodeCursor } from '../src/notifications/cursor.js';
import { toNotificationDto } from '../src/notifications/notification-dto.js';
import { toSocketMessage } from '../src/realtime/pg-listener.js';
import { routeLabel } from '../src/http/request-logger.js';
import { replayHeaders } from '../src/tools/dlq-replay.js';

function envelopeBuffer(type, data, extra = {}) {
  return Buffer.from(
    JSON.stringify({
      eventId: randomUUID(),
      type,
      version: 1,
      occurredAt: new Date().toISOString(),
      producer: 'test',
      correlationId: null,
      data,
      ...extra,
    }),
  );
}

describe('cursor', () => {
  it('giữ nguyên timestamp micro giây khi encode rồi decode', () => {
    const id = randomUUID();
    const cursor = encodeCursor('2026-11-24 10:00:00.123456+00', id);
    expect(decodeCursor(cursor)).toEqual({ createdAt: '2026-11-24 10:00:00.123456+00', id });
  });

  it.each(['', 'abc', Buffer.from('[1,2]').toString('base64url'),
    Buffer.from('["2026-01-01","not-uuid"]').toString('base64url')])(
    'trả về null với cursor sai: %s',
    (cursor) => expect(decodeCursor(cursor)).toBeNull(),
  );
});

describe('parseEnvelope', () => {
  it('parse envelope hợp lệ', () => {
    const env = parseEnvelope(envelopeBuffer('job.created', { id: randomUUID() }));
    expect(env.type).toBe('job.created');
  });

  it.each([
    ['JSON hỏng', Buffer.from('{')],
    ['message rỗng', null],
    ['thiếu eventId', envelopeBuffer('job.created', {}, { eventId: undefined })],
    ['thiếu data', envelopeBuffer('job.created', null)],
  ])('ném PoisonMessageError khi %s', (_name, value) => {
    expect(() => parseEnvelope(value)).toThrow(PoisonMessageError);
  });
});

describe('toNotificationDto', () => {
  it('chuẩn hóa dòng từ row_to_json (timestamp dạng chuỗi)', () => {
    const dto = toNotificationDto({
      id: 'x',
      type: 'APPLICATION_RECEIVED',
      title: 't',
      body: null,
      entity_type: 'APPLICATION',
      entity_id: 'e',
      data: { a: 1 },
      read_at: null,
      created_at: '2026-11-24T10:00:00.123456+00:00',
    });
    expect(dto).toMatchObject({ read: false, readAt: null, createdAt: '2026-11-24T10:00:00.123Z' });
  });
});

describe('processMessage', () => {
  const emptyPool = { query: async () => ({ rows: [], rowCount: 0 }) };

  it('thử lại hết lượt rồi đẩy vào DLQ khi chưa có snapshot job', async () => {
    const sendToDlq = vi.fn(async () => {});
    const heartbeat = vi.fn(async () => {});
    const message = {
      offset: '0',
      value: envelopeBuffer('job_application.created', {
        applicationId: randomUUID(),
        jobId: randomUUID(),
        applicantId: randomUUID(),
      }),
    };
    const result = await processMessage({
      pool: emptyPool,
      topic: 'job.application.events',
      message,
      heartbeat,
      sendToDlq,
      backoffMs: [0, 0],
    });
    expect(result).toBe('dlq');
    expect(heartbeat).toHaveBeenCalledTimes(2);
    expect(sendToDlq).toHaveBeenCalledOnce();
  });

  it('đẩy thẳng vào DLQ, không thử lại, khi thiếu trường bắt buộc', async () => {
    const sendToDlq = vi.fn(async () => {});
    const heartbeat = vi.fn(async () => {});
    const result = await processMessage({
      pool: emptyPool,
      topic: 'job.application.events',
      message: { offset: '0', value: envelopeBuffer('job_application.created', { jobId: 'x' }) },
      heartbeat,
      sendToDlq,
      backoffMs: [0, 0],
    });
    expect(result).toBe('dlq');
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it('bỏ qua loại event không liên quan', async () => {
    const sendToDlq = vi.fn();
    const result = await processMessage({
      pool: emptyPool,
      topic: 'job.application.events',
      message: { offset: '0', value: envelopeBuffer('job_application.something_else', {}) },
      heartbeat: async () => {},
      sendToDlq,
      backoffMs: [0],
    });
    expect(result).toBe('ignored');
    expect(sendToDlq).not.toHaveBeenCalled();
  });
});

describe('toSocketMessage', () => {
  it('notification_read: một id hoặc tất cả', () => {
    expect(toSocketMessage('notification_read', { recipientId: 'u', ids: ['a'] })).toEqual({
      userId: 'u', message: { type: 'notification.read', data: { ids: ['a'] } },
    });
    expect(toSocketMessage('notification_read', { recipientId: 'u', all: true, readAt: 't' })).toEqual({
      userId: 'u', message: { type: 'notification.read_all', data: { readAt: 't' } },
    });
  });

  it('bỏ qua kênh lạ', () => {
    expect(toSocketMessage('other', {})).toBeNull();
  });
});

describe('routeLabel', () => {
  it('thay UUID bằng :id và gộp path lạ', () => {
    expect(routeLabel(`/api/v1/notifications/${randomUUID()}/read`)).toBe('/api/v1/notifications/:id/read');
    expect(routeLabel('/api/v1/notifications')).toBe('/api/v1/notifications');
    expect(routeLabel('/health')).toBe('/health');
    expect(routeLabel('/wp-admin/xyz')).toBe('other');
  });
});

describe('replayHeaders', () => {
  it('bỏ header x-dlq-*, giữ header gốc, tăng bộ đếm', () => {
    const headers = {
      'event-type': Buffer.from('job_application.created'),
      'x-dlq-error': Buffer.from('lỗi'),
      'x-dlq-original-offset': Buffer.from('3'),
    };
    expect(replayHeaders(headers)).toEqual({ 'event-type': headers['event-type'], 'x-dlq-replay-count': '1' });
    expect(replayHeaders({ 'x-dlq-replay-count': Buffer.from('2') })['x-dlq-replay-count']).toBe('3');
  });
});
