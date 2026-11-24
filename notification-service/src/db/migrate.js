import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
// Khóa advisory cố định: nhiều instance khởi động cùng lúc thì chỉ một instance chạy migration
const MIGRATION_LOCK_KEY = 74_210_001;
const FILE_PATTERN = /^V(\d+)__(.+)\.sql$/;

async function listMigrations(dir) {
  const files = await readdir(dir);
  return files
    .map((file) => {
      const match = FILE_PATTERN.exec(file);
      return match ? { version: Number(match[1]), name: match[2], file } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.version - b.version);
}

/**
 * Migration kiểu Flyway (giống các service Java): file migrations/V<n>__<mô_tả>.sql,
 * chạy theo thứ tự, mỗi file một transaction, ghi lại vào schema_migrations.
 */
export async function runMigrations(pool, dir = MIGRATIONS_DIR) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    int PRIMARY KEY,
        name       text        NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.version));

    for (const migration of await listMigrations(dir)) {
      if (applied.has(migration.version)) continue;
      const sql = await readFile(path.join(dir, migration.file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
          migration.version,
          migration.name,
        ]);
        await client.query('COMMIT');
        logger.info({ migration: migration.file }, 'Đã chạy migration');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${migration.file} lỗi: ${err.message}`, { cause: err });
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }
}
