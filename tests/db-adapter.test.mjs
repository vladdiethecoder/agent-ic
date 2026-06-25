import test from 'node:test';
import assert from 'node:assert/strict';
import { isDbAvailable, dbConfig, dbHealth, initDbPool, closeDbPool, resetDbPool, tenantTableName, hashTenantId } from '../lib/dbAdapter.js';
import { applyMigrations, migrationStatus, pendingMigrations } from '../lib/dbMigrations.js';
import { validateProductionConfig } from '../lib/productionConfig.js';

test('db adapter reports unavailable when DATABASE_URL is absent', () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.AGENT_IC_DATA_STORE_URL;
  resetDbPool();
  assert.equal(isDbAvailable(), false);
  const config = dbConfig();
  assert.equal(config.url, '');
  if (original) process.env.DATABASE_URL = original;
});

test('db adapter reports available for postgres URL', () => {
  const original = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/agentic';
  resetDbPool();
  assert.equal(isDbAvailable(), true);
  const config = dbConfig();
  assert.equal(config.url, 'postgres://user:pass@localhost:5432/agentic');
  assert.equal(config.maxConnections, 10);
  assert.equal(config.idleTimeoutMs, 30000);
  assert.equal(config.connectionTimeoutMs, 5000);
  if (original) process.env.DATABASE_URL = original;
  else delete process.env.DATABASE_URL;
});

test('db adapter respects custom pool config', () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalMax = process.env.AGENT_IC_DB_MAX_CONNECTIONS;
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/agentic';
  process.env.AGENT_IC_DB_MAX_CONNECTIONS = '5';
  process.env.AGENT_IC_DB_IDLE_TIMEOUT_MS = '10000';
  process.env.AGENT_IC_DB_CONNECTION_TIMEOUT_MS = '2000';
  const config = dbConfig();
  assert.equal(config.maxConnections, 5);
  assert.equal(config.idleTimeoutMs, 10000);
  assert.equal(config.connectionTimeoutMs, 2000);
  if (originalUrl) process.env.DATABASE_URL = originalUrl;
  else delete process.env.DATABASE_URL;
  if (originalMax !== undefined) process.env.AGENT_IC_DB_MAX_CONNECTIONS = originalMax;
  else delete process.env.AGENT_IC_DB_MAX_CONNECTIONS;
  delete process.env.AGENT_IC_DB_IDLE_TIMEOUT_MS;
  delete process.env.AGENT_IC_DB_CONNECTION_TIMEOUT_MS;
});

test('db health returns unavailable when no DATABASE_URL', async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.AGENT_IC_DATA_STORE_URL;
  resetDbPool();
  const health = await dbHealth();
  assert.equal(health.ok, false);
  assert.equal(health.code, 'db_unavailable');
  if (original) process.env.DATABASE_URL = original;
});

test('db health returns unavailable when pg driver is missing', async () => {
  const original = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://invalid:***@localhost/agentic';
  resetDbPool();
  const health = await dbHealth();
  assert.equal(health.ok, false);
  // When pg driver is not installed, initDbPool returns null => db_unavailable
  assert.ok(health.code === 'db_unavailable' || health.code === 'db_query_failed');
  if (original) process.env.DATABASE_URL = original;
  else delete process.env.DATABASE_URL;
});

test('tenant table name is sanitized and deterministic', () => {
  const name = tenantTableName('trials', 'tenant-a');
  assert.match(name, /^agentic_tenant-a_trials$/);
  const hashed = hashTenantId('tenant-a');
  assert.equal(hashed.length, 16);
  assert.match(hashed, /^[a-f0-9]{16}$/);
});

test('tenant table name sanitizes unsafe characters', () => {
  const name = tenantTableName('evidence', 'tenant/../bad');
  assert.equal(name.includes('/'), false);
  assert.equal(name.includes('\\'), false);
});

test('migration runner reports unavailable when no DATABASE_URL', async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.AGENT_IC_DATA_STORE_URL;
  resetDbPool();
  const result = await applyMigrations();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'db_unavailable');
  if (original) process.env.DATABASE_URL = original;
});

