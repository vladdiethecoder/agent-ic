import test from 'node:test';
import assert from 'node:assert/strict';
import { logKeyOperation, hashKeyId, hashKeyMaterial } from '../lib/keyAudit.js';
import { resetAudit, readAudit } from '../lib/auditStore.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';

test('logKeyOperation appends tamper-evident audit entry', () => {
  resetAudit();
  process.env.AGENT_IC_AUDIT_SIGNING_KEY = 'audit-signing-key-1234567890';
  process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID = 'test-key';

  const entry = logKeyOperation({ operation: 'generate', keyId: 'key-2026-06', actor: 'test-user', detail: 'priority=10' });
  assert.equal(entry.action, 'key_generate');
  assert.equal(entry.kind, 'key_operation');
  assert.equal(entry.userId, 'test-user');
  assert.equal(entry.metadata.operation, 'generate');
  assert.equal(entry.metadata.keyHash, hashKeyId('key-2026-06'));
  assert.ok(entry.hash);
  assert.ok(entry.signature);

  const entries = readAudit({});
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'key_operation');

  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY;
  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID;
});

test('logKeyOperation never leaks raw key material', () => {
  resetAudit();
  const entry = logKeyOperation({ operation: 'generate', keyId: 'secret-key-123', actor: 'test' });
  assert.equal(entry.detail.includes('secret-key-123'), false);
  assert.equal(entry.detail.includes('secret'), false);
  assert.equal(entry.metadata.keyHash, hashKeyId('secret-key-123'));
  assert.equal(entry.metadata.keyId, undefined);
});

test('hashKeyId produces deterministic SHA-256', () => {
  const h1 = hashKeyId('test-key');
  const h2 = hashKeyId('test-key');
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
});

test('hashKeyMaterial produces SHA-256 hash', () => {
  const h = hashKeyMaterial('super-secret-key');
  assert.equal(h.length, 64);
  assert.equal(h.includes('super-secret'), false);
});

test('rotation CLI logs key_generate and key_rotate operations', async () => {
  const auditFile = `.agent-ic/test-rotate-audit-${Date.now()}.jsonl`;
  process.env.AGENT_IC_AUDIT_FILE = auditFile;
  process.env.AGENT_IC_AUDIT_SIGNING_KEY = 'audit-signing-key-1234567890';
  process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID = 'test-key';
  process.env.AGENT_IC_EXPORT_SIGNING_KEY = 'old-key-1234567890';
  process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID = 'old';
  process.env.AGENT_IC_SIGNING_KEY_RING = '';

  try {
    execFileSync('node', ['scripts/rotate-key.mjs'], {
      env: { ...process.env, AGENT_IC_AUDIT_FILE: auditFile },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    // CLI may exit with code 2 for overdue rotation warning
  }

  // Read the audit file directly since CLI uses separate process
  const { readFileSync } = await import('node:fs');
  const lines = readFileSync(auditFile, 'utf8').split('\n').filter(Boolean);
  const entries = lines.map((line) => JSON.parse(line));
  const keyOps = entries.filter((e) => e.kind === 'key_operation');
  assert.ok(keyOps.length >= 2, `Expected >= 2 key ops, got ${keyOps.length}`);
  assert.ok(keyOps.some((e) => e.action === 'key_generate'));
  assert.ok(keyOps.some((e) => e.action === 'key_rotate'));

  delete process.env.AGENT_IC_AUDIT_FILE;
  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY;
  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID;
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID;
});

test('export bundle signing logs key_sign operation', async () => {
  resetAudit();
  process.env.AGENT_IC_EXPORT_SIGNING_KEY = 'export-signing-key-1234567890';
  process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID = 'test-key';

  const { buildExportBundle } = await import('../lib/exportBundle.js');
  buildExportBundle({ tenantId: 'tenant_a', generatedBy: 'auditor_1' });

  const entries = readAudit({});
  const signOps = entries.filter((e) => e.action === 'key_sign');
  assert.ok(signOps.length >= 1);
  assert.equal(signOps[0].metadata.keyHash, hashKeyId('test-key'));

  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID;
});

test('verification CLI logs key_verify operation', async () => {
  const auditFile = `.agent-ic/test-verify-audit-${Date.now()}.jsonl`;
  process.env.AGENT_IC_AUDIT_FILE = auditFile;
  process.env.AGENT_IC_EXPORT_SIGNING_KEY = 'export-signing-key-1234567890';
  process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID = 'test-key';

  const { buildExportBundle } = await import('../lib/exportBundle.js');
  const bundle = buildExportBundle({ tenantId: 'tenant_a', generatedBy: 'auditor_1' });
  const file = `.agent-ic/test-verify-bundle-${Date.now()}.json`;
  writeFileSync(file, JSON.stringify(bundle, null, 2));

  try {
    execFileSync('node', ['scripts/verify-evidence.mjs', file], {
      env: { ...process.env, AGENT_IC_AUDIT_FILE: auditFile, AGENT_IC_EXPORT_SIGNING_KEY: 'export-signing-key-1234567890' },
      encoding: 'utf8',
    });
  } finally {
    unlinkSync(file);
  }

  const { readFileSync } = await import('node:fs');
  const lines = readFileSync(auditFile, 'utf8').split('\n').filter(Boolean);
  const entries = lines.map((line) => JSON.parse(line));
  const verifyOps = entries.filter((e) => e.action === 'key_verify');
  assert.ok(verifyOps.length >= 1);

  delete process.env.AGENT_IC_AUDIT_FILE;
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID;
});

test('key-audit API is RBAC-guarded and returns key operations', async () => {
  resetAudit();
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = 'test-secret-1234567890';
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  process.env.AGENT_IC_AUDIT_SIGNING_KEY = 'audit-signing-key-1234567890';

  const { signTestJwt } = await import('../lib/authz.js');
  const auditorToken = `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }, 'test-secret-1234567890')}`;

  logKeyOperation({ operation: 'generate', keyId: 'key-1', actor: 'system', tenantId: 'tenant_a' });

  const { GET } = await import(`../app/api/key-audit/route.js?keyaudit=${Date.now()}`);
  const res = await GET(new Request('https://agent-ic.example.com/api/key-audit?tenantId=tenant_a', {
    headers: { authorization: auditorToken },
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.entries.length >= 1);
  assert.equal(body.entries[0].kind, 'key_operation');

  const operatorToken = `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }, 'test-secret-1234567890')}`;
  const denied = await GET(new Request('https://agent-ic.example.com/api/key-audit?tenantId=tenant_a', {
    headers: { authorization: operatorToken },
  }));
  assert.equal(denied.status, 403);

  delete process.env.AGENT_IC_DEPLOYMENT_MODE;
  delete process.env.AGENT_IC_AUTH_HS256_SECRET;
  delete process.env.AGENT_IC_AUTH_ISSUER;
  delete process.env.AGENT_IC_AUTH_AUDIENCE;
  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY;
});
