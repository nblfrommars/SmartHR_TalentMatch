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
import { attachWebSocketServer } from '../src/realtime/ws-server.js';

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

  it('WebSocket: từ chối token sai, đẩy thông báo mới qua LISTEN/NOTIFY tới đúng người', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: 'RS256', kid: 'k1' }] });
    const sign = (sub) =>
      new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setSubject(sub).setIssuer(ISSUER).setExpirationTime('5m').sign(privateKey);

    const registry = new ConnectionRegistry();
    const server = http.createServer(app);
    const wsServer = attachWebSocketServer(server, {
      path: '/ws/notifications',
      heartbeatMs: 30000,
      verifyToken: createTokenVerifier({ issuer: ISSUER, jwks }),
      registry,
    });
    const stopListener = startPgListener({ connectionString: dbUrl, registry });
    await new Promise((resolve) => server.listen(0, resolve));
    const base = `ws://127.0.0.1:${server.address().port}/ws/notifications`;

    try {
      const rejected = await new Promise((resolve) => {
        const ws = new WebSocket(`${base}?access_token=not-a-jwt`);
        ws.on('unexpected-response', (_req, res) => resolve(res.statusCode));
        ws.on('error', () => {});
      });
      expect(rejected).toBe(401);

      const job = jobRes();
      await handleJobEvent(pool, envelope('job.created', job));

      const hrSocket = new WebSocket(`${base}?access_token=${await sign(job.createdBy)}`);
      await nextMessage(hrSocket, (m) => m.type === 'connected');
      const otherSocket = new WebSocket(`${base}?access_token=${await sign(randomUUID())}`);
      await nextMessage(otherSocket, (m) => m.type === 'connected');
      const otherReceived = [];
      otherSocket.on('message', (raw) => otherReceived.push(JSON.parse(raw.toString())));

      // pg-listener kết nối bất đồng bộ: chờ tới khi LISTEN sẵn sàng
      for (let i = 0; i < 50; i++) {
        const { rows } = await pool.query(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND query LIKE 'LISTEN%'",
          [dbName],
        );
        if (rows[0].n > 0) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      const pushed = nextMessage(hrSocket, (m) => m.type === 'notification.created');
      const applicationId = randomUUID();
      await handleApplicationEvent(pool, envelope('job_application.created', {
        applicationId, jobId: job.id, applicantId: randomUUID(),
      }));
      const msg = await pushed;
      expect(msg.data).toMatchObject({ type: 'APPLICATION_RECEIVED', entityId: applicationId, read: false });

      await new Promise((r) => setTimeout(r, 200));
      expect(otherReceived).toEqual([]);
      hrSocket.close();
      otherSocket.close();
    } finally {
      await wsServer.close();
      await new Promise((resolve) => server.close(resolve));
      await stopListener();
    }
  });
});
