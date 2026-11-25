import { createPool } from './pool.js';
import { runMigrations } from './migrate.js';
import { logger } from '../logger.js';

const pool = createPool();
try {
  await runMigrations(pool);
  logger.info('Migration xong');
} catch (err) {
  logger.error({ err }, 'Migration thất bại');
  process.exitCode = 1;
} finally {
  await pool.end();
}
