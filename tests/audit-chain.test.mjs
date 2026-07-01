import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('audit store appends tenant-scoped hash-chain entries', async () => {
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-audit-chain-${Date.now()}-${Math.random()}.jsonl`;
  const mod = await import(`../lib/auditStore.js?chain=${Date.now()}`);
  mod.resetAudit();

  const first = mod.appendAudit({ tenantId: 'tenant_a', userId: 'u1', role: 'operator', action: 'trial_started', detail: 'start sk_test_secret nvapi-secret' });
  const second = mod.appendAudit({ tenantId: 'tenant_a', userId: 'u1', role: 'operator', action: 'trial_completed', detail: 'done' });
  const other = mod.appendAudit({ tenantId: 'tenant_b', userId: 'u2', role: 'auditor', action: 'audit_read', detail: 'read' });

  assert.match(first.hash, /^[a-f0-9]{64}$/);
  assert.equal(second.previousHash, first.hash);
  assert.equal(other.previousHash, second.hash);
  assert.equal(first.detail.includes('sk_test_secret'), false);
  assert.equal(first.detail.includes('nvapi-secret'), false);

  const tenantA = mod.readAudit({ tenantId: 'tenant_a' });
  assert.equal(tenantA.length, 2);
  assert.ok(tenantA.every((entry) => entry.tenantId === 'tenant_a'));

  const verification = mod.verifyAuditChain();
  assert.equal(verification.ok, true);
  assert.equal(verification.checked, 3);
});

test('audit chain verification detects tampering', async () => {
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-audit-tamper-${Date.now()}-${Math.random()}.jsonl`;
  const mod = await import(`../lib/auditStore.js?tamper=${Date.now()}`);
  mod.resetAudit();

  const entry = mod.appendAudit({ tenantId: 'tenant_a', userId: 'u1', role: 'operator', action: 'trial_completed', verdict: 'CONTINUE' });
  entry.verdict = 'KILL';

  const verification = mod.verifyAuditChain();
  assert.equal(verification.ok, false);
  assert.equal(verification.failures.some((failure) => failure.code === 'hash_mismatch'), true);
});


test('audit rows are signed and signature tampering is detected when signing key is configured', async () => {
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-audit-signature-${Date.now()}-${Math.random()}.jsonl`;
  process.env.AGENT_IC_AUDIT_SIGNING_KEY = 'audit-signing-key-1234567890';
  process.env.AGENT_IC_AUDIT_REQUIRE_SIGNATURES = 'true';
  process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID = 'test-key-1';
  const mod = await import(`../lib/auditStore.js?signature=${Date.now()}`);
  mod.resetAudit();

  const entry = mod.appendAudit({ tenantId: 'tenant_a', userId: 'u1', role: 'operator', action: 'signed_event', detail: 'signed' });
  assert.equal(entry.signatureAlg, 'HMAC-SHA256');
  assert.equal(entry.signatureKeyId, 'test-key-1');
  assert.match(entry.signature, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(entry).includes('audit-signing-key'), false);

  const ok = mod.verifyAuditChain({ tenantId: 'tenant_a' });
  assert.equal(ok.ok, true);
  assert.equal(ok.signatures.signed, 1);

  entry.signature = '0'.repeat(64);
  const bad = mod.verifyAuditChain({ tenantId: 'tenant_a' });
  assert.equal(bad.ok, false);
  assert.equal(bad.failures.some((failure) => failure.code === 'signature_mismatch'), true);

  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY;
  delete process.env.AGENT_IC_AUDIT_REQUIRE_SIGNATURES;
  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID;
});


test('renewal mutation appends tenant-scoped audit row', async () => {
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-audit-renewal-${Date.now()}-${Math.random()}.jsonl`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const audit = await import(`../lib/auditStore.js?renewal=${Date.now()}`);
  audit.resetAudit();
  const { POST } = await import(`../app/api/renewals/route.js?audit=${Date.now()}`);

  const response = await POST(new Request('https://agent-ic.example.com/api/renewals', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader({ sub: 'owner_1', tenantId: 'tenant_a', role: 'owner' }),
    },
    body: JSON.stringify({ action: 'seedIllustrative', tenantId: 'tenant_a' }),
  }));

  assert.equal(response.status, 200);
  const rows = audit.readAudit({ tenantId: 'tenant_a' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, 'renewals_illustrative_seeded');
  assert.equal(rows[0].userId, 'owner_1');
  assert.equal(audit.verifyAuditChain({ tenantId: 'tenant_a' }).ok, true);
});
