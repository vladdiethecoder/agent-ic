import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('idempotency store replays identical payloads and rejects conflicts', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-idem-${Date.now()}-${Math.random()}`;
  const idem = await import(`../lib/idempotencyStore.js?case=store${Date.now()}`);
  const fingerprint = idem.fingerprintPayload({ a: 1 });
  assert.equal(idem.checkIdempotency({ tenantId: 'tenant_a', key: 'k1', scope: 's', fingerprint }).status, 'new');
  assert.equal(idem.beginIdempotentRequest({ tenantId: 'tenant_a', key: 'k1', scope: 's', fingerprint }).status, 'new');
  assert.equal(idem.checkIdempotency({ tenantId: 'tenant_a', key: 'k1', scope: 's', fingerprint }).status, 'in_progress');
  idem.completeIdempotentRequest({ tenantId: 'tenant_a', key: 'k1', scope: 's', fingerprint, responseBody: { ok: true }, status: 201 });
  const replay = idem.checkIdempotency({ tenantId: 'tenant_a', key: 'k1', scope: 's', fingerprint });
  assert.equal(replay.status, 'replay');
  assert.deepEqual(replay.record.responseBody, { ok: true });
  assert.equal(idem.checkIdempotency({ tenantId: 'tenant_a', key: 'k1', scope: 's', fingerprint: idem.fingerprintPayload({ a: 2 }) }).status, 'conflict');
});

test('approvals API replays idempotent request without duplicating approval', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-idem-approval-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-idem-approval-audit-${Date.now()}-${Math.random()}.jsonl`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { POST } = await import(`../app/api/approvals/route.js?idem=${Date.now()}`);
  const request = () => new Request('https://agent-ic.example.com/api/approvals', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': 'approval-key-1',
      authorization: authHeader({ sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }),
    },
    body: JSON.stringify({ action: 'request', tenantId: 'tenant_a', caseId: 'safety-ops-complaint-triage', spendCap: 100 }),
  });

  const first = await POST(request());
  const firstBody = await first.json();
  const second = await POST(request());
  const secondBody = await second.json();

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(second.headers.get('x-agent-ic-idempotency'), 'replay');
  assert.equal(secondBody.approval.id, firstBody.approval.id);
});

test('enterprise trial missing approval response is idempotent and conflicts on changed payload', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-idem-trial-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-idem-trial-audit-${Date.now()}-${Math.random()}.jsonl`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { POST } = await import(`../app/api/enterprise-trial/route.js?idem=${Date.now()}`);
  const headers = {
    'content-type': 'application/json',
    'idempotency-key': 'trial-key-1',
    authorization: authHeader({ sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }),
  };
  const first = await POST(new Request('https://agent-ic.example.com/api/enterprise-trial', {
    method: 'POST',
    headers,
    body: JSON.stringify({ tenantId: 'tenant_a', caseId: 'safety-ops-complaint-triage' }),
  }));
  const second = await POST(new Request('https://agent-ic.example.com/api/enterprise-trial', {
    method: 'POST',
    headers,
    body: JSON.stringify({ tenantId: 'tenant_a', caseId: 'safety-ops-complaint-triage' }),
  }));
  const conflict = await POST(new Request('https://agent-ic.example.com/api/enterprise-trial', {
    method: 'POST',
    headers,
    body: JSON.stringify({ tenantId: 'tenant_a', caseId: 'engineering-code-review' }),
  }));

  assert.equal(first.status, 409);
  assert.equal(second.status, 409);
  assert.equal(second.headers.get('x-agent-ic-idempotency'), 'replay');
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, 'idempotency_conflict');
});
