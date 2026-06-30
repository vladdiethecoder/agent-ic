import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

test('migration runner reports pending migrations then applies idempotently', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-migrations-${Date.now()}-${Math.random()}`;
  const runner = await import(`../lib/migrationRunner.js?case=apply${Date.now()}`);
  const initial = runner.migrationStatus();
  assert.equal(initial.ok, false);
  assert.ok(initial.pending.some((migration) => migration.id === '002_domain_schema_registry'));

  const applied = runner.applyMigrations();
  assert.equal(applied.ok, true);
  assert.ok(applied.applied.length >= 2);

  const current = runner.assertMigrationsCurrent();
  assert.equal(current.ok, true);
  assert.equal(current.status.pending.length, 0);

  const again = runner.applyMigrations();
  assert.equal(again.ok, true);
  assert.equal(again.applied.length, 0);
});

test('migration runner detects checksum tampering', async () => {
  const root = `.agent-ic/test-migration-tamper-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_STORE_ROOT = root;
  const runner = await import(`../lib/migrationRunner.js?case=tamper${Date.now()}`);
  assert.equal(runner.applyMigrations().ok, true);

  const manifestPath = join(process.cwd(), root, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.migrations.find((migration) => migration.id === '002_domain_schema_registry').checksum = 'bad-checksum';
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const check = runner.assertMigrationsCurrent();
  assert.equal(check.ok, false);
  assert.equal(check.code, 'migration_checksum_mismatch');
});

test('migration CLI check fails before apply and passes after apply', async () => {
  const root = `.agent-ic/test-migration-cli-${Date.now()}-${Math.random()}`;
  const { spawnSync } = await import('node:child_process');
  const env = { ...process.env, AGENT_IC_STORE_ROOT: root };
  const before = spawnSync(process.execPath, ['scripts/migrate-store.mjs', 'check'], { cwd: process.cwd(), env, encoding: 'utf8' });
  assert.equal(before.status, 1);
  assert.match(before.stdout, /migration_pending/);

  const apply = spawnSync(process.execPath, ['scripts/migrate-store.mjs', 'apply'], { cwd: process.cwd(), env, encoding: 'utf8' });
  assert.equal(apply.status, 0);

  const after = spawnSync(process.execPath, ['scripts/migrate-store.mjs', 'check'], { cwd: process.cwd(), env, encoding: 'utf8' });
  assert.equal(after.status, 0);
  assert.match(after.stdout, /"ok": true/);
});
