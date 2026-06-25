import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

test('store backup verifies and restores tenant data', async () => {
  const root = `.agent-ic/test-backup-store-${Date.now()}-${Math.random()}`;
  const backupFile = `.agent-ic/test-backups/backup-${Date.now()}-${Math.random()}.json`;
  const restoreRoot = `.agent-ic/test-restore-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_STORE_ROOT = root;
  const { writeTenantCollection, readTenantCollection } = await import(`../lib/tenantStore.js?backup=${Date.now()}`);
  const backup = await import(`../lib/storeBackup.js?backup=${Date.now()}`);
  writeTenantCollection('tenant_a', 'approvals', { approvals: [{ id: 'appr_1', status: 'approved' }] });

  const created = backup.createStoreBackup({ outFile: backupFile, root });
  assert.equal(created.ok, true);
  assert.match(created.sha256, /^[a-f0-9]{64}$/);
  assert.equal(backup.verifyStoreBackup({ backupFile }).ok, true);

  const restored = backup.restoreStoreBackup({ backupFile, targetRoot: restoreRoot });
  assert.equal(restored.ok, true);
  process.env.AGENT_IC_STORE_ROOT = restoreRoot;
  const read = readTenantCollection('tenant_a', 'approvals', { approvals: [] });
  assert.equal(read.approvals[0].id, 'appr_1');
});

test('store backup verification detects tampering', async () => {
  const root = `.agent-ic/test-backup-tamper-${Date.now()}-${Math.random()}`;
  const backupFile = `.agent-ic/test-backups/tamper-${Date.now()}-${Math.random()}.json`;
  mkdirSync(join(root, 'tenants', 'tenant_a'), { recursive: true });
  writeFileSync(join(root, 'tenants', 'tenant_a', 'x.json'), JSON.stringify({ ok: true }));
  const backup = await import(`../lib/storeBackup.js?tamper=${Date.now()}`);
  backup.createStoreBackup({ outFile: backupFile, root });
  const raw = JSON.parse((await import('node:fs')).readFileSync(backupFile, 'utf8'));
  raw.files[0].contentBase64 = Buffer.from(JSON.stringify({ ok: false })).toString('base64');
  writeFileSync(backupFile, JSON.stringify(raw, null, 2));
  const verified = backup.verifyStoreBackup({ backupFile });
  assert.equal(verified.ok, false);
  assert.ok(verified.failures.length > 0);
});

