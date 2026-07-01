import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseKeyRing,
  selectSigningKey,
  findVerifyingKey,
  verifyWithKeyRing,
  generateKey,
  addKeyToRing,
  keyRingHealth,
} from '../lib/keyRotation.js';
import { verifyExportBundle, verifyBundleSignature } from '../lib/verifyExportBundle.js';
import { verifyAuditChain, verifyAuditEntrySignature } from '../lib/verifyAuditChain.js';
import { buildExportBundle } from '../lib/exportBundle.js';
import { appendAudit, resetAudit } from '../lib/auditStore.js';

test('parseKeyRing reads single key from env', () => {
  const env = {
    AGENT_IC_EXPORT_SIGNING_KEY: 'key1-1234567890',
    AGENT_IC_EXPORT_SIGNING_KEY_ID: 'primary',
  };
  const ring = parseKeyRing(env);
  assert.equal(ring.length, 1);
  assert.equal(ring[0].key, 'key1-1234567890');
  assert.equal(ring[0].keyId, 'primary');
  assert.equal(ring[0].priority, 1);
});

test('parseKeyRing reads key ring JSON from env', () => {
  const env = {
    AGENT_IC_EXPORT_SIGNING_KEY: 'key1-1234567890',
    AGENT_IC_EXPORT_SIGNING_KEY_ID: 'primary',
    AGENT_IC_SIGNING_KEY_RING: JSON.stringify([
      { key: 'key2-1234567890', keyId: 'secondary', priority: 2 },
      { key: 'key3-1234567890', keyId: 'tertiary', priority: 0 },
    ]),
  };
  const ring = parseKeyRing(env);
  assert.equal(ring.length, 3);
  assert.equal(ring[0].keyId, 'secondary'); // highest priority first
  assert.equal(ring[1].keyId, 'primary');
  assert.equal(ring[2].keyId, 'tertiary');
});

test('selectSigningKey picks highest priority non-expired key', () => {
  const ring = [
    { key: 'expired', keyId: 'old', expiresAt: '2020-01-01T00:00:00Z', priority: 10 },
    { key: 'active', keyId: 'new', expiresAt: '2099-01-01T00:00:00Z', priority: 5 },
    { key: 'noexp', keyId: 'default', priority: 1 },
  ];
  const selected = selectSigningKey(ring, new Date('2025-01-01'));
  assert.equal(selected.keyId, 'new');
});

test('selectSigningKey returns null when all expired', () => {
  const ring = [
    { key: 'expired', keyId: 'old', expiresAt: '2020-01-01T00:00:00Z', priority: 10 },
  ];
  const selected = selectSigningKey(ring, new Date('2025-01-01'));
  assert.equal(selected, null);
});

test('verifyWithKeyRing tries all active keys', () => {
  const ring = [
    { key: 'wrong', keyId: 'wrong', priority: 2 },
    { key: 'right', keyId: 'right', priority: 1 },
  ];
  const signatureFn = (key) => key === 'right' ? 'expected-sig' : 'wrong-sig';
  const result = verifyWithKeyRing(ring, signatureFn, 'expected-sig');
  assert.equal(result.ok, true);
  assert.equal(result.keyId, 'right');
});

test('verifyWithKeyRing returns mismatch when none match', () => {
  const ring = [
    { key: 'wrong1', keyId: 'w1', priority: 2 },
    { key: 'wrong2', keyId: 'w2', priority: 1 },
  ];
  const signatureFn = () => ({ ok: false });
  const result = verifyWithKeyRing(ring, signatureFn, 'dummy');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'signature_mismatch');
});

test('generateKey produces valid key structure', () => {
  const key = generateKey({ keyId: 'test', priority: 5 });
  assert.equal(typeof key.key, 'string');
  assert.equal(key.key.length, 64); // 32 bytes hex
  assert.equal(key.keyId, 'test');
  assert.equal(key.priority, 5);
});

test('addKeyToRing demotes existing and adds new', () => {
  const ring = [
    { key: 'old', keyId: 'old', priority: 5 },
  ];
  const updated = addKeyToRing(ring, { key: 'new', keyId: 'new', priority: 10 });
  assert.equal(updated.length, 2);
  assert.equal(updated[0].keyId, 'new');
  assert.equal(updated[0].priority, 10);
  assert.equal(updated[1].priority, 4); // demoted
});

test('keyRingHealth reports needsRotation when no active keys', () => {
  const ring = [
    { key: 'expired', keyId: 'old', expiresAt: '2020-01-01T00:00:00Z', priority: 1 },
  ];
  const health = keyRingHealth(ring);
  assert.equal(health.activeKeys, 0);
  assert.equal(health.needsRotation, true);
});

test('keyRingHealth reports needsRotation when key expires within 7 days', () => {
  const ring = [
    { key: 'active', keyId: 'old', expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), priority: 1 },
  ];
  const health = keyRingHealth(ring);
  assert.equal(health.needsRotation, true);
});

test('export bundle signs with highest priority key from ring', async () => {
  process.env.AGENT_IC_SIGNING_KEY_RING = JSON.stringify([
    { key: 'secondary-1234567890', keyId: 'secondary', priority: 2 },
    { key: 'primary-1234567890', keyId: 'primary', priority: 5 },
  ]);
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  const { buildExportBundle } = await import('../lib/exportBundle.js');
  const bundle = buildExportBundle({ tenantId: 'tenant_a', generatedBy: 'auditor_1' });
  assert.equal(bundle.signatureKeyId, 'primary');

  // Verify with full ring
  const { verifyExportBundle } = await import('../lib/verifyExportBundle.js');
  const ring = [
    { key: 'secondary-1234567890', keyId: 'secondary', priority: 2 },
    { key: 'primary-1234567890', keyId: 'primary', priority: 5 },
  ];
  const result = verifyExportBundle(bundle, { keyRing: ring });
  assert.equal(result.ok, true);
  assert.equal(result.signature.keyId, 'primary');

  delete process.env.AGENT_IC_SIGNING_KEY_RING;
});

test('audit entry signs with highest priority key from ring', async () => {
  resetAudit();
  process.env.AGENT_IC_SIGNING_KEY_RING = JSON.stringify([
    { key: 'secondary-1234567890', keyId: 'secondary', priority: 2 },
    { key: 'primary-1234567890', keyId: 'primary', priority: 5 },
  ]);
  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY;
  appendAudit({ tenantId: 'tenant_a', userId: 'u', role: 'r', action: 'test', kind: 'test' });
  const { readAudit } = await import('../lib/auditStore.js');
  const entries = readAudit({ tenantId: 'tenant_a' });
  assert.equal(entries[0].signatureKeyId, 'primary');

  const ring = [
    { key: 'secondary-1234567890', keyId: 'secondary', priority: 2 },
    { key: 'primary-1234567890', keyId: 'primary', priority: 5 },
  ];
  const { verifyAuditChain } = await import('../lib/verifyAuditChain.js');
  const result = verifyAuditChain(entries, { keyRing: ring });
  assert.equal(result.ok, true);

  delete process.env.AGENT_IC_SIGNING_KEY_RING;
});

test('verification fails with expired key but succeeds with active key', async () => {
  process.env.AGENT_IC_EXPORT_SIGNING_KEY = 'primary-1234567890';
  process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID = 'primary';
  const { buildExportBundle } = await import('../lib/exportBundle.js');
  const bundle = buildExportBundle({ tenantId: 'tenant_a', generatedBy: 'auditor_1' });

  const expiredRing = [
    { key: 'primary-1234567890', keyId: 'primary', expiresAt: '2020-01-01T00:00:00Z', priority: 1 },
  ];
  const { verifyExportBundle } = await import('../lib/verifyExportBundle.js');
  const bad = verifyExportBundle(bundle, { keyRing: expiredRing, requireSignature: true });
  assert.equal(bad.ok, false);

  const activeRing = [
    { key: 'primary-1234567890', keyId: 'primary', expiresAt: '2099-01-01T00:00:00Z', priority: 1 },
  ];
  const good = verifyExportBundle(bundle, { keyRing: activeRing, requireSignature: true });
  assert.equal(good.ok, true);

  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID;
});

test('CLI rotation script generates new key and demotes old', async () => {
  const { execFileSync } = await import('node:child_process');
  const env = {
    ...process.env,
    AGENT_IC_EXPORT_SIGNING_KEY: 'old-key-1234567890',
    AGENT_IC_EXPORT_SIGNING_KEY_ID: 'old',
    AGENT_IC_SIGNING_KEY_RING: '',
    AGENT_IC_AUDIT_SIGNING_KEY: '',
  };
  const output = execFileSync('node', ['scripts/rotate-key.mjs'], { env, encoding: 'utf8' });
  const ring = JSON.parse(output);
  assert.equal(ring.length, 2);
  assert.equal(ring[0].priority, 10); // new key
  assert.equal(ring[1].keyId, 'old');
  assert.equal(ring[1].priority, 0); // demoted
  assert.equal(typeof ring[0].key, 'string');
  assert.equal(ring[0].key.length, 64);
});
