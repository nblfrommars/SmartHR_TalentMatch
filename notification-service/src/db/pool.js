import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../logger.js';

export function createPool(connectionString = config.databaseUrl) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  pool.on('error', (err) => logger.error({ err }, 'Lỗi trên kết nối rảnh của pool Postgres'));
  return pool;
}

/** Chạy fn trong một transaction; fn nhận client đã BEGIN. */
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
