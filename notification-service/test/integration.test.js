/**
 * Chạy trên Postgres thật. Đặt TEST_DATABASE_URL trỏ tới một database quản trị (vd .../postgres);
 * test tự tạo database tạm notification_test_<ngẫu nhiên> rồi xóa khi xong. Không đặt thì bỏ qua.
 */
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createPool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { createApp } from '../src/http/app.js';
import { handleApplicationEvent } from '../src/kafka/handlers/application-events.js';
import { handleJobEvent } from '../src/kafka/handlers/job-events.js';
import { ConnectionRegistry } from '../src/realtime/connection-registry.js';
import { startPgListener } from '../src/realtime/pg-listener.js';
import { createTokenVerifier } from '../src/realtime/token-verifier.js';
import {
  attachWebSocketServer,
  CLOSE_AUTH_FAILED,
  CLOSE_TOKEN_EXPIRED,
} from '../src/realtime/ws-server.js';
import { deleteExpired } from '../src/notifications/notification-repo.js';
import { deleteOldDeletedJobs } from '../src/jobs/job-snapshot-repo.js';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const ISSUER = 'http://test-issuer/realms/smarthr';

function envelope(type, data) {
  return { eventId: randomUUID(), type, version: 1, occurredAt: new Date().toISOString(), data };
}

function jobRes(overrides = {}) {
  return {
    id: randomUUID(),
    createdBy: randomUUID(),
    companyName: 'ACME',
    title: 'Backend Developer',
    status: 'OPEN',
    version: 0,
    ...overrides,
  };
}

function nextMessage(ws, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Hết thời gian chờ message WebSocket')), 5000);
    ws.on('message', function onMessage(raw) {
      const msg = JSON.parse(raw.toString());
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(msg);
      }
    });
  });
}

describe.skipIf(!ADMIN_URL)('notification-service trên Postgres thật', () => {
  const dbName = `notification_test_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  let dbUrl;
  let pool;
  let app;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    await admin.end();
    const url = new URL(ADMIN_URL);
    url.pathname = `/${dbName}`;
    dbUrl = url.toString();
    pool = createPool(dbUrl);
    await runMigrations(pool);
    await runMigrations(pool); // chạy lại không lỗi, không chạy trùng
    app = createApp({ pool });
  });

  afterAll(async () => {
    await pool?.end();
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  });

  it('job.events: bỏ qua version cũ, job.deleted cùng version vẫn được ghi', async () => {
    const job = jobRes({ version: 2 });
    await handleJobEvent(pool, envelope('job.created', job));
    await handleJobEvent(pool, envelope('job.updated', { ...job, title: 'Cũ', version: 1 }));
    let { rows } = await pool.query('SELECT title, status FROM job_snapshots WHERE job_id = $1', [job.id]);
    expect(rows[0]).toEqual({ title: 'Backend Developer', status: 'OPEN' });

    await handleJobEvent(pool, envelope('job.deleted', job));
    ({ rows } = await pool.query('SELECT status FROM job_snapshots WHERE job_id = $1', [job.id]));
    expect(rows[0].status).toBe('DELETED');
  });

  it('job_application.created: tạo một thông báo cho HR, event gửi lại không tạo trùng', async () => {
    const job = jobRes();
    await handleJobEvent(pool, envelope('job.created', job));
    const event = envelope('job_application.created', {
      applicationId: randomUUID(),
      jobId: job.id,
      applicantId: randomUUID(),
      status: 'APPLIED',
    });
    await handleApplicationEvent(pool, event);
    await handleApplicationEvent(pool, event);

    const list = await request(app).get('/api/v1/notifications').set('X-User-Id', job.createdBy);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      type: 'APPLICATION_RECEIVED',
      entityType: 'APPLICATION',
      read: false,
      data: { jobTitle: 'Backend Developer' },
    });
  });

  it('REST: phân trang, đếm chưa đọc, đánh dấu đã đọc, không đụng được thông báo người khác', async () => {
    const job = jobRes();
    await handleJobEvent(pool, envelope('job.created', job));
    for (let i = 0; i < 5; i++) {
      await handleApplicationEvent(pool, envelope('job_application.created', {
        applicationId: randomUUID(), jobId: job.id, applicantId: randomUUID(),
      }));
    }
    const hr = job.createdBy;

    const page1 = await request(app).get('/api/v1/notifications?limit=3').set('X-User-Id', hr);
    expect(page1.body.items).toHaveLength(3);
    const page2 = await request(app)
      .get(`/api/v1/notifications?limit=3&cursor=${page1.body.nextCursor}`)
      .set('X-User-Id', hr);
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.nextCursor).toBeNull();
    const ids = [...page1.body.items, ...page2.body.items].map((n) => n.id);
    expect(new Set(ids).size).toBe(5);

    const target = ids[0];
    const other = await request(app).patch(`/api/v1/notifications/${target}/read`).set('X-User-Id', randomUUID());
    expect(other.status).toBe(404);

    const read = await request(app).patch(`/api/v1/notifications/${target}/read`).set('X-User-Id', hr);
    expect(read.body.read).toBe(true);
    expect((await request(app).get('/api/v1/notifications/unread-count').set('X-User-Id', hr)).body.count).toBe(4);

    const all = await request(app).patch('/api/v1/notifications/read-all').set('X-User-Id', hr);
    expect(all.body.updated).toBe(4);
    expect((await request(app).get('/api/v1/notifications/unread-count').set('X-User-Id', hr)).body.count).toBe(0);
  });

  it('REST: thiếu X-User-Id thì 401, cursor sai thì 400', async () => {
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
    const bad = await request(app).get('/api/v1/notifications?cursor=abc').set('X-User-Id', randomUUID());
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ status: 400, error: 'Bad Request', path: '/api/v1/notifications?cursor=abc' });
  });

  it('job_application.created: dùng applicantName nếu event có', async () => {
    const job = jobRes();
    await handleJobEvent(pool, envelope('job.created', job));
    await handleApplicationEvent(pool, envelope('job_application.created', {
      applicationId: randomUUID(), jobId: job.id, applicantId: randomUUID(), applicantName: '  Nguyễn Văn A ',
    }));
    const list = await request(app).get('/api/v1/notifications').set('X-User-Id', job.createdBy);
    expect(list.body.items[0].body).toBe('Nguyễn Văn A vừa ứng tuyển vào "Backend Developer".');
    expect(list.body.items[0].data.applicantName).toBe('Nguyễn Văn A');
  });

  it('job.expired: báo cho HR đã đăng job', async () => {
    const job = jobRes({ status: 'CLOSED', version: 3 });
    await handleJobEvent(pool, envelope('job.expired', job));
    const list = await request(app).get('/api/v1/notifications').set('X-User-Id', job.createdBy);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ type: 'JOB_EXPIRED', entityType: 'JOB', entityId: job.id });
  });

  it('/health: báo từng thành phần, có thành phần DOWN thì 503', async () => {
    expect((await request(app).get('/health')).body).toEqual({ status: 'UP', components: { db: 'UP' } });
    const degraded = createApp({ pool, checks: { kafka: () => false, listener: () => true } });
    const res = await request(degraded).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.components).toEqual({ db: 'UP', kafka: 'DOWN', listener: 'UP' });
  });

  it('retention: xóa đã đọc quá hạn và mọi thông báo quá hạn tối đa, giữ phần còn lại', async () => {
    const job = jobRes();
    await handleJobEvent(pool, envelope('job.created', job));
    for (let i = 0; i < 4; i++) {
      await handleApplicationEvent(pool, envelope('job_application.created', {
        applicationId: randomUUID(), jobId: job.id, applicantId: randomUUID(),
      }));
    }
    const { rows } = await pool.query(
      'SELECT id FROM notifications WHERE recipient_id = $1 ORDER BY id', [job.createdBy]);
    const [readOld, unreadOld, unreadVeryOld, fresh] = rows.map((r) => r.id);
    await pool.query("UPDATE notifications SET created_at = now() - interval '100 days', read_at = now() - interval '95 days' WHERE id = $1", [readOld]);
    await pool.query("UPDATE notifications SET created_at = now() - interval '100 days' WHERE id = $1", [unreadOld]);
    await pool.query("UPDATE notifications SET created_at = now() - interval '200 days' WHERE id = $1", [unreadVeryOld]);

    const deleted = await deleteExpired(pool, { readDays: 90, maxDays: 180, batchSize: 1 });
    expect(deleted).toBe(2);
    const left = await pool.query('SELECT id FROM notifications WHERE recipient_id = $1', [job.createdBy]);
    expect(left.rows.map((r) => r.id).sort()).toEqual([unreadOld, fresh].sort());
  });

  it('HTTP: trả lại X-Correlation-Id nhận được, thiếu thì tự sinh, giá trị lạ thì thay', async () => {
    const given = await request(app).get('/api/v1/notifications/unread-count')
      .set('X-User-Id', randomUUID()).set('X-Correlation-Id', 'abc-123');
    expect(given.headers['x-correlation-id']).toBe('abc-123');
    const generated = await request(app).get('/health');
    expect(generated.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    const unsafe = await request(app).get('/health').set('X-Correlation-Id', 'a b <script>');
    expect(unsafe.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('/metrics: có metrics HTTP, thông báo, Kafka, WebSocket', async () => {
    await request(app).get(`/api/v1/notifications/${randomUUID()}/read`).set('X-User-Id', randomUUID());
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/notification_http_request_duration_seconds_count\{method="GET",route="\/api\/v1\/notifications\/:id\/read",status="404"\} \d+/);
    expect(res.text).toMatch(/notification_created_total\{type="APPLICATION_RECEIVED"\} [1-9]/);
    expect(res.text).toContain('notification_ws_connections');
    expect(res.text).toContain('notification_kafka_consumer_lag');
    expect(res.text).toContain('notification_process_cpu_user_seconds_total');
  });

  it('retention: xóa snapshot DELETED quá hạn, giữ job còn sống và job mới xóa', async () => {
    const oldDeleted = jobRes();
    const recentDeleted = jobRes();
    const alive = jobRes();
    for (const job of [oldDeleted, recentDeleted, alive]) await handleJobEvent(pool, envelope('job.created', job));
    await handleJobEvent(pool, envelope('job.deleted', oldDeleted));
    await handleJobEvent(pool, envelope('job.deleted', recentDeleted));
    await pool.query("UPDATE job_snapshots SET updated_at = now() - interval '40 days' WHERE job_id = ANY($1)",
      [[oldDeleted.id, alive.id]]);

    expect(await deleteOldDeletedJobs(pool, 30)).toBe(1);
    const { rows } = await pool.query('SELECT job_id FROM job_snapshots WHERE job_id = ANY($1)',
      [[oldDeleted.id, recentDeleted.id, alive.id]]);
    expect(rows.map((r) => r.job_id).sort()).toEqual([recentDeleted.id, alive.id].sort());
  });

  describe('WebSocket', () => {
    const ORIGIN = 'http://localhost:5173';
    const AUTH_TIMEOUT_MS = 500;
    let sign;
    let server;
    let wsServer;
    let listener;
    let base;
    const sockets = [];

    beforeAll(async () => {
      const { publicKey, privateKey } = await generateKeyPair('RS256');
      const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: 'RS256', kid: 'k1' }] });
      sign = (sub, exp = '5m') =>
        new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
          .setSubject(sub).setIssuer(ISSUER).setExpirationTime(exp).sign(privateKey);

      const registry = new ConnectionRegistry();
      server = http.createServer(app);
      wsServer = attachWebSocketServer(server, {
        path: '/ws/notifications',
        heartbeatMs: 30000,
        authTimeoutMs: AUTH_TIMEOUT_MS,
        allowedOrigins: [ORIGIN],
        verifyToken: createTokenVerifier({ issuer: ISSUER, jwks }),
        registry,
      });
      listener = startPgListener({ connectionString: dbUrl, registry });
      await new Promise((resolve) => server.listen(0, resolve));
      base = `ws://127.0.0.1:${server.address().port}/ws/notifications`;
      for (let i = 0; i < 50 && !listener.isListening(); i++) await new Promise((r) => setTimeout(r, 100));
      expect(listener.isListening()).toBe(true);
    });

    afterAll(async () => {
      for (const s of sockets) s.terminate();
      await wsServer?.close();
      await new Promise((resolve) => server.close(resolve));
      await listener?.stop();
    });

    /** Mở kết nối (chưa xác thực). Ghi lại mọi message và mã đóng. */
    async function open(url = base, origin = ORIGIN) {
      const ws = new WebSocket(url, { headers: origin ? { Origin: origin } : {} });
      sockets.push(ws);
      ws.received = [];
      ws.on('message', (raw) => ws.received.push(JSON.parse(raw.toString())));
      ws.closed = new Promise((resolve) => ws.on('close', (code) => resolve(code)));
      await new Promise((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });
      return ws;
    }

    async function connect(userId, exp) {
      const ws = await open();
      const connected = nextMessage(ws, (m) => m.type === 'connected');
      ws.send(JSON.stringify({ type: 'auth', token: await sign(userId, exp) }));
      ws.connectedMsg = await connected;
      return ws;
    }

    it('Origin lạ bị từ chối ngay lúc bắt tay (403)', async () => {
      const status = await new Promise((resolve) => {
        const ws = new WebSocket(base, { headers: { Origin: 'https://evil.example' } });
        ws.on('unexpected-response', (_req, res) => resolve(res.statusCode));
        ws.on('error', () => {});
      });
      expect(status).toBe(403);
    });

    it('xác thực bằng message auth: trả connected kèm expiresAt', async () => {
      const ws = await connect(randomUUID());
      expect(Date.parse(ws.connectedMsg.data.expiresAt)).toBeGreaterThan(Date.now());
    });

    it('không gửi auth trong thời hạn thì đóng 4401', async () => {
      const ws = await open();
      expect(await ws.closed).toBe(CLOSE_AUTH_FAILED);
      const metrics = (await request(app).get('/metrics')).text;
      expect(metrics).toMatch(/notification_ws_auth_failures_total\{reason="timeout"\} [1-9]/);
    });

    it('token trên URL không còn được chấp nhận', async () => {
      const ws = await open(`${base}?access_token=${await sign(randomUUID())}`);
      expect(await ws.closed).toBe(CLOSE_AUTH_FAILED);
      expect(ws.received).toEqual([]);
    });

    it.each([
      ['token sai', JSON.stringify({ type: 'auth', token: 'not-a-jwt' })],
      ['message đầu không phải auth', JSON.stringify({ type: 'hello' })],
      ['message không phải JSON', 'abc'],
      ['auth thiếu token', JSON.stringify({ type: 'auth' })],
    ])('%s thì đóng 4401', async (_name, payload) => {
      const ws = await open();
      ws.send(payload);
      expect(await ws.closed).toBe(CLOSE_AUTH_FAILED);
      expect(ws.received).toEqual([]);
    });

    it('message quá lớn (trước khi xác thực) bị đóng 1009', async () => {
      const ws = await open();
      ws.send(JSON.stringify({ type: 'auth', token: 'x'.repeat(20 * 1024) }));
      expect(await ws.closed).toBe(1009);
    });

    it('chưa xác thực thì không nhận thông báo', async () => {
      const job = jobRes();
      await handleJobEvent(pool, envelope('job.created', job));
      const pending = await open(); // của HR nhưng chưa gửi auth
      const authed = await connect(job.createdBy);
      const pushed = nextMessage(authed, (m) => m.type === 'notification.created');
      await handleApplicationEvent(pool, envelope('job_application.created', {
        applicationId: randomUUID(), jobId: job.id, applicantId: randomUUID(),
      }));
      await pushed;
      expect(pending.received).toEqual([]);
    });

    it('đẩy thông báo mới tới đúng HR, người khác không nhận', async () => {
      const job = jobRes();
      await handleJobEvent(pool, envelope('job.created', job));
      const hrSocket = await connect(job.createdBy);
      const otherSocket = await connect(randomUUID());

      const pushed = nextMessage(hrSocket, (m) => m.type === 'notification.created');
      const applicationId = randomUUID();
      await handleApplicationEvent(pool, envelope('job_application.created', {
        applicationId, jobId: job.id, applicantId: randomUUID(),
      }));
      const msg = await pushed;
      expect(msg.data).toMatchObject({
        type: 'APPLICATION_RECEIVED', entityId: applicationId, read: false, data: { jobId: job.id },
      });

      await new Promise((r) => setTimeout(r, 200));
      expect(otherSocket.received.filter((m) => m.type !== 'connected')).toEqual([]);
    });

    it('đánh dấu đã đọc ở một tab thì tab khác của cùng HR nhận notification.read / read_all', async () => {
      const job = jobRes();
      await handleJobEvent(pool, envelope('job.created', job));
      const hr = job.createdBy;
      const tabA = await connect(hr);
      const tabB = await connect(hr);
      for (let i = 0; i < 2; i++) {
        const created = nextMessage(tabB, (m) => m.type === 'notification.created');
        await handleApplicationEvent(pool, envelope('job_application.created', {
          applicationId: randomUUID(), jobId: job.id, applicantId: randomUUID(),
        }));
        await created;
      }
      const { body } = await request(app).get('/api/v1/notifications').set('X-User-Id', hr);
      const [first] = body.items;

      const readMsg = nextMessage(tabB, (m) => m.type === 'notification.read');
      await request(app).patch(`/api/v1/notifications/${first.id}/read`).set('X-User-Id', hr);
      expect((await readMsg).data).toEqual({ ids: [first.id] });

      // Đọc lại thông báo đã đọc: không phát lại
      const before = tabA.received.length;
      await request(app).patch(`/api/v1/notifications/${first.id}/read`).set('X-User-Id', hr);

      const readAll = nextMessage(tabB, (m) => m.type === 'notification.read_all');
      await request(app).patch('/api/v1/notifications/read-all').set('X-User-Id', hr);
      expect(Date.parse((await readAll).data.readAt)).not.toBeNaN();
      await new Promise((r) => setTimeout(r, 100));
      expect(tabA.received.slice(before).map((m) => m.type)).toEqual(['notification.read_all']);
    });

    it('token hết hạn mà không gia hạn thì đóng 4001', async () => {
      const ws = await connect(randomUUID(), Math.floor(Date.now() / 1000) + 2);
      expect(await ws.closed).toBe(CLOSE_TOKEN_EXPIRED);
    }, 10000);

    it('gửi lại auth với token mới thì được gia hạn, không bị đóng', async () => {
      const user = randomUUID();
      const ws = await connect(user, Math.floor(Date.now() / 1000) + 2);
      const renewed = nextMessage(ws, (m) => m.type === 'auth.renewed');
      ws.send(JSON.stringify({ type: 'auth', token: await sign(user, '5m') }));
      expect(Date.parse((await renewed).data.expiresAt)).toBeGreaterThan(Date.now() + 60_000);
      await new Promise((r) => setTimeout(r, 3000));
      expect(ws.readyState).toBe(WebSocket.OPEN);
    }, 10000);

    it('gia hạn bằng token của user khác thì đóng 4401', async () => {
      const ws = await connect(randomUUID());
      ws.send(JSON.stringify({ type: 'auth', token: await sign(randomUUID()) }));
      expect(await ws.closed).toBe(CLOSE_AUTH_FAILED);
    });

    it('đã xác thực mà gửi message khác thì bỏ qua, không đóng', async () => {
      const ws = await connect(randomUUID());
      ws.send(JSON.stringify({ type: 'ping' }));
      ws.send('rác');
      await new Promise((r) => setTimeout(r, 200));
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });
  });
});
