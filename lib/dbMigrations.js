import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dbQuery, initDbPool, isDbAvailable } from './dbAdapter.js';

/**
 * SQL migration runner for the database adapter foundation.
 *
 * Migrations are SQL files in `migrations/` ordered by filename.
 * A `schema_migrations` table tracks applied migrations with checksums.
 * This is a foundation, not a full production migration framework.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');
const MIGRATIONS_TABLE = 'schema_migrations';

export async function ensureMigrationsTable() {
  if (!isDbAvailable()) return { ok: false, code: 'db_unavailable' };
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id VARCHAR(255) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return { ok: true };
}

export async function listMigrationFiles() {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function appliedMigrations() {
  if (!isDbAvailable()) return [];
  await ensureMigrationsTable();
  const result = await dbQuery(`SELECT id, checksum FROM ${MIGRATIONS_TABLE} ORDER BY id`);
  return result.rows || [];
}

export async function pendingMigrations() {
  const files = await listMigrationFiles();
  const applied = await appliedMigrations();
  const appliedMap = new Map(applied.map((row) => [row.id, row.checksum]));
  const pending = [];
  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const checksum = hashString(sql);
    const existing = appliedMap.get(id);
    if (existing === undefined) {
      pending.push({ id, file, sql, checksum, status: 'pending' });
    } else if (existing !== checksum) {
      pending.push({ id, file, sql, checksum, status: 'checksum_mismatch', expected: existing });
    }
  }
  return pending;
}

export async function applyMigrations({ dryRun = false } = {}) {
  if (!isDbAvailable()) return { ok: false, code: 'db_unavailable', applied: [] };
  await initDbPool();
  const pending = await pendingMigrations();
  const applied = [];
  for (const migration of pending) {
    if (migration.status === 'checksum_mismatch') {
      return { ok: false, code: 'checksum_mismatch', migration: migration.id, applied };
    }
    if (!dryRun) {
      await dbQuery(migration.sql);
      await dbQuery(
        `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET checksum = EXCLUDED.checksum`,
        [migration.id, migration.checksum]
      );
    }
    applied.push({ id: migration.id, checksum: migration.checksum, dryRun });
  }
  return { ok: true, applied };
}

export async function migrationStatus() {
  const files = await listMigrationFiles();
  const applied = await appliedMigrations();
  const appliedMap = new Map(applied.map((row) => [row.id, row.checksum]));
  const statuses = [];
  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const checksum = hashString(sql);
    const existing = appliedMap.get(id);
    statuses.push({
      id,
      applied: existing !== undefined,
      checksum,
      checksumMatch: existing === checksum,
      status: existing === undefined ? 'pending' : existing === checksum ? 'applied' : 'checksum_mismatch',
    });
  }
  return { ok: true, migrations: statuses, pendingCount: statuses.filter((s) => s.status === 'pending').length };
}

function hashString(value) {
  return createHash('sha256').update(value).digest('hex');
}
