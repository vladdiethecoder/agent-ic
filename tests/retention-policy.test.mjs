import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('retention policy evaluates expired resources and legal holds prevent review eligibility', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-retention-${Date.now()}-${Math.random()}`;
  const retention = await import(`../lib/retentionPolicy.js?case=retention${Date.now()}`);
  retention.updateRetentionPolicy({ tenantId: 'tenant_a', updates: { evidenceDays: 1 }, updatedBy: 'owner_1' });
  const hold = retention.createLegalHold({ tenantId: 'tenant_a', resourceType: 'evidence', resourceId: 'artifact_held', reason: 'investigation', createdBy: 'owner_1' });
  const result = retention.evaluateRetention({
    tenantId: 'tenant_a',
    now: new Date('2026-01-10T00:00:00Z'),
    resources: [
      { resourceType: 'evidence', resourceId: 'artifact_old', createdAt: '2026-01-01T00:00:00Z' },
      { resourceType: 'evidence', resourceId: 'artifact_held', createdAt: '2026-01-01T00:00:00Z' },
      { resourceType: 'trials', resourceId: 'trial_new', createdAt: '2026-01-09T00:00:00Z' },
    ],
  });
  assert.equal(result.eligibleForReview, 1);
  assert.equal(result.held, 1);
  assert.equal(result.resources.find((r) => r.resourceId === 'artifact_held').action, 'retain_legal_hold');
  const released = retention.releaseLegalHold({ tenantId: 'tenant_a', holdId: hold.id, releasedBy: 'owner_1' });
  assert.equal(released.ok, true);
});

test('retention API is RBAC guarded and tenant-scoped', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-retention-api-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-retention-audit-${Date.now()}-${Math.random()}.jsonl`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { POST, GET } = await import(`../app/api/retention/route.js?case=api${Date.now()}`);

  const auditorToken = authHeader({ sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' });
  const ownerToken = authHeader({ sub: 'owner_1', tenantId: 'tenant_a', role: 'owner' });

  const read = await GET(new Request('https://agent-ic.example.com/api/retention', { headers: { authorization: auditorToken } }));
  assert.equal(read.status, 200);

  const denied = await POST(new Request('https://agent-ic.example.com/api/retention', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auditorToken },
    body: JSON.stringify({ action: 'update_policy', tenantId: 'tenant_a', policy: { evidenceDays: 30 } }),
  }));
  assert.equal(denied.status, 403);

  const updated = await POST(new Request('https://agent-ic.example.com/api/retention', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: ownerToken },
    body: JSON.stringify({ action: 'update_policy', tenantId: 'tenant_a', policy: { evidenceDays: 30 } }),
  }));
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).policy.evidenceDays, 30);

  const crossTenant = await GET(new Request('https://agent-ic.example.com/api/retention?tenantId=tenant_b', { headers: { authorization: ownerToken } }));
  assert.equal(crossTenant.status, 403);
});
