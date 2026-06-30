import { createHash } from 'node:crypto';

/**
 * Database adapter foundation for Agent IC.
 *
 * This module provides a minimal connection-pool and tenant-scoped query
 * interface over PostgreSQL (via the `pg` driver). If the driver is not
 * installed or `DATABASE_URL` is absent, the adapter reports itself as
 * unavailable and the application continues using the file-based store.
 *
 * Production boundary: this is a foundation adapter, not a full migration
 * program or ORM. Schema migrations, connection tuning, and failover are
 * out of scope for this unit.
 */

const globalForDb = globalThis;
if (!globalForDb.__agentIcDbPool) {
  globalForDb.__agentIcDbPool = null;
}

export function dbConfig(env = process.env) {
  const url = env.DATABASE_URL || env.AGENT_IC_DATA_STORE_URL || '';
  const maxConnections = Number(env.AGENT_IC_DB_MAX_CONNECTIONS || '10');
  const idleTimeoutMs = Number(env.AGENT_IC_DB_IDLE_TIMEOUT_MS || '30000');
  const connectionTimeoutMs = Number(env.AGENT_IC_DB_CONNECTION_TIMEOUT_MS || '5000');
  return { url, maxConnections, idleTimeoutMs, connectionTimeoutMs };
}

export function isDbAvailable(env = process.env) {
  const { url } = dbConfig(env);
  return Boolean(url && url.startsWith('postgres'));
}

export async function initDbPool(env = process.env) {
  if (globalForDb.__agentIcDbPool) return globalForDb.__agentIcDbPool;
  if (!isDbAvailable(env)) return null;

  try {
    const { Pool } = await import('pg');
    const config = dbConfig(env);
    const pool = new Pool({
      connectionString: config.url,
      max: config.maxConnections,
      idleTimeoutMillis: config.idleTimeoutMs,
      connectionTimeoutMillis: config.connectionTimeoutMs,
    });
    pool.on('error', (err) => {
      console.error('Unexpected DB pool error', err.message);
    });
    globalForDb.__agentIcDbPool = pool;
    return pool;
  } catch {
    return null;
  }
}

export async function closeDbPool() {
  const pool = globalForDb.__agentIcDbPool;
  if (!pool) return;
  await pool.end();
  globalForDb.__agentIcDbPool = null;
}

export async function dbQuery(text, params = [], { tenantId } = {}) {
  const pool = await initDbPool();
  if (!pool) throw new Error('db_unavailable');
  const client = await pool.connect();
  try {
    if (tenantId) {
      await client.query('SET LOCAL agentic.current_tenant = $1', [String(tenantId).slice(0, 120)]);
    }
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

export async function dbTransaction(fn, { tenantId } = {}) {
  const pool = await initDbPool();
  if (!pool) throw new Error('db_unavailable');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await client.query('SET LOCAL agentic.current_tenant = $1', [String(tenantId).slice(0, 120)]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function dbHealth() {
  const pool = await initDbPool();
  if (!pool) return { ok: false, code: 'db_unavailable' };
  try {
    const start = Date.now();
    const result = await pool.query('SELECT NOW() as now');
    return { ok: true, latencyMs: Date.now() - start, now: result.rows[0]?.now };
  } catch (error) {
    return { ok: false, code: 'db_query_failed', message: error.message };
  }
}

export function tenantTableName(baseName, tenantId) {
  const safeTenant = String(tenantId || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120);
  const safeBase = String(baseName).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120);
  return `agentic_${safeTenant}_${safeBase}`;
}

export function hashTenantId(tenantId) {
  return createHash('sha256').update(String(tenantId)).digest('hex').slice(0, 16);
}

export function resetDbPool() {
  globalForDb.__agentIcDbPool = null;
}
