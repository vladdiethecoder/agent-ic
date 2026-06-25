import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyExportBundle, verifyBundleHash, verifyBundleSignature } from '../lib/verifyExportBundle.js';
import { verifyAuditChain, verifyAuditEntryHash, verifyAuditEntrySignature } from '../lib/verifyAuditChain.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';

test('verifyBundleHash detects content tampering', async () => {
  const { hashBundle } = await import('../lib/exportBundle.js');
  const bundle = {
    bundleType: 'agent-ic-export-v1',
    tenantId: 'tenant_a',
    generatedBy: 'system',
    generatedAt: '2026-06-23T00:00:00.000Z',
    contents: { trials: [] },
    summary: { trialCount: 0 },
  };
  bundle.sha256 = hashBundle(bundle);
  const hashCheck = verifyBundleHash(bundle);
  assert.equal(hashCheck.ok, true);

  bundle.summary.trialCount = 999;
  const tampered = verifyBundleHash(bundle);
  assert.equal(tampered.ok, false);
});

test('verifyBundleSignature detects signature tampering', async () => {
  const { hashBundle, signExportBundle } = await import('../lib/exportBundle.js');
  const bundle = {
    bundleType: 'agent-ic-export-v1',
    tenantId: 'tenant_a',
    generatedBy: 'system',
    generatedAt: '2026-06-23T00:00:00.000Z',
    contents: { trials: [] },
    summary: { trialCount: 0 },
  };
  bundle.sha256 = hashBundle(bundle);
  const key = 'test-signing-key-1234567890';
  signExportBundle(bundle, { AGENT_IC_EXPORT_SIGNING_KEY: key, AGENT_IC_EXPORT_SIGNING_KEY_ID: 'test-key' });

  const good = verifyBundleSignature(bundle, key);
  assert.equal(good.ok, true);

  const bad = verifyBundleSignature(bundle, 'wrong-key');
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'signature_mismatch');
});

test('verifyExportBundle full check with requireSignature', async () => {
  const { buildExportBundle } = await import('../lib/exportBundle.js');
  process.env.AGENT_IC_EXPORT_SIGNING_KEY = 'export-signing-key-1234567890';
  process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID = 'test-key';
  const bundle = buildExportBundle({ tenantId: 'tenant_a', generatedBy: 'auditor_1' });

  const result = verifyExportBundle(bundle, { key: 'export-signing-key-1234567890', requireSignature: true });
  assert.equal(result.ok, true);
  assert.equal(result.hash.ok, true);
  assert.equal(result.signature.ok, true);

  const missingKey = verifyExportBundle(bundle, { key: '', requireSignature: true });
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.signature.code, 'signature_key_missing');

  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID;
});

test('verifyAuditEntryHash detects tampering', async () => {
  const { hashAuditEntry } = await import('../lib/auditStore.js');
  const entry = {
    id: 'AUD-000001',
    seq: 1,
    ts: '2026-06-23T00:00:00.000Z',
    actor: 'system',
    action: 'test',
    detail: 'test',
    kind: 'test',
    tenantId: 'tenant_a',
    userId: 'system',
    role: 'system',
    previousHash: '0'.repeat(64),
  };
  entry.hash = hashAuditEntry(entry);
  const check = verifyAuditEntryHash(entry);
  assert.equal(check.ok, true);

  entry.detail = 'tampered';
  const bad = verifyAuditEntryHash(entry);
  assert.equal(bad.ok, false);
});

test('verifyAuditChain detects hash link breaks', () => {
  const entries = [
    { id: 'AUD-000001', seq: 1, ts: '2026-06-23T00:00:00.000Z', actor: 'a', action: 'a', detail: 'a', kind: 'a', tenantId: 't', userId: 'u', role: 'r', previousHash: '0'.repeat(64), hash: 'hash1' },
    { id: 'AUD-000002', seq: 2, ts: '2026-06-23T00:00:00.000Z', actor: 'a', action: 'a', detail: 'a', kind: 'a', tenantId: 't', userId: 'u', role: 'r', previousHash: 'wrong', hash: 'hash2' },
  ];
  const result = verifyAuditChain(entries);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f.code === 'previous_hash_mismatch'));
});

test('verifyAuditChain detects signature mismatch when key provided', async () => {
  const { appendAudit, resetAudit } = await import('../lib/auditStore.js');
  resetAudit();
  process.env.AGENT_IC_AUDIT_SIGNING_KEY = 'audit-signing-key-1234567890';
  process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID = 'test-key';
  appendAudit({ tenantId: 'tenant_a', userId: 'u', role: 'r', action: 'test', kind: 'test' });
  const { readAudit } = await import('../lib/auditStore.js');
  const entries = readAudit({ tenantId: 'tenant_a' });

  const good = verifyAuditChain(entries, { key: 'audit-signing-key-1234567890' });
  assert.equal(good.ok, true);

  const bad = verifyAuditChain(entries, { key: 'wrong-key' });
  assert.equal(bad.ok, false);
  assert.ok(bad.failures.some((f) => f.code === 'signature_mismatch'));

  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY;
  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID;
});

test('CLI verification script produces structured report', async () => {
  const { buildExportBundle } = await import('../lib/exportBundle.js');
  process.env.AGENT_IC_EXPORT_SIGNING_KEY = 'export-signing-key-1234567890';
  const bundle = buildExportBundle({ tenantId: 'tenant_a', generatedBy: 'auditor_1' });
  const file = `.agent-ic/test-verify-${Date.now()}.json`;
  writeFileSync(file, JSON.stringify(bundle, null, 2));

  try {
    const output = execFileSync('node', ['scripts/verify-evidence.mjs', file], {
      env: { ...process.env, AGENT_IC_EXPORT_SIGNING_KEY: 'export-signing-key-1234567890' },
      encoding: 'utf8',
    });
    const report = JSON.parse(output);
    assert.equal(report.ok, true);
    assert.equal(report.bundle.ok, true);
    assert.equal(report.bundle.hash.ok, true);
    assert.equal(report.bundle.signature.ok, true);
    assert.equal(JSON.stringify(report).includes('export-signing-key'), false);
  } finally {
    unlinkSync(file);
    delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  }
});
