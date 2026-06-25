import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('policy store creates diffs activates and simulates policy versions', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-policy-${Date.now()}-${Math.random()}`;
  const policyStore = await import(`../lib/policyStore.js?case=store${Date.now()}`);
  const base = {
    spendCap: 100,
    currency: 'USD',
    allowedTools: ['NHTSA public complaint snapshot', 'Nemotron complaint classifier'],
    networkPolicy: 'Allow NHTSA only',
    blockedTool: { name: 'CARFAX vehicle-history report', category: 'Paid enrichment', attemptedAmount: 150, policyRule: 'spend_cap_exceeded' },
  };
  const created = policyStore.createPolicyVersion({ tenantId: 'tenant_a', caseId: 'case-a', envelope: base, createdBy: 'sec_1' });
  assert.equal(created.version, 1);
  assert.match(created.policyHash, /^[a-f0-9]{64}$/);

  const active = policyStore.activatePolicyVersion({ tenantId: 'tenant_a', policyId: created.id, activatedBy: 'sec_1' });
  assert.equal(active.ok, true);
  assert.equal(policyStore.getActivePolicyVersion({ tenantId: 'tenant_a', caseId: 'case-a' }).id, created.id);

  const changed = { ...base, spendCap: 250, allowedTools: [...base.allowedTools, 'Evidence packet writer'] };
  const diff = policyStore.diffPolicyVersions({ fromPolicy: base, toPolicy: changed });
  assert.deepEqual(diff.spendCap, { from: 100, to: 250 });
  assert.deepEqual(diff.allowedTools.added, ['Evidence packet writer']);

  const sim = policyStore.simulatePolicy({ policy: base, attemptedAction: { name: 'CARFAX vehicle-history report', attemptedAmount: 150 } });
  assert.equal(sim.blocked, true);
  assert.equal(sim.status, 403);
});

test('policies API enforces RBAC and tenant-scoped lifecycle', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-policy-api-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-policy-audit-${Date.now()}-${Math.random()}.jsonl`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { POST, GET } = await import(`../app/api/policies/route.js?case=api${Date.now()}`);

  const wrongRole = await POST(new Request('https://agent-ic.example.com/api/policies', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: authHeader({ sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }) },
    body: JSON.stringify({ action: 'create', tenantId: 'tenant_a', caseId: 'safety-ops-complaint-triage' }),
  }));
  assert.equal(wrongRole.status, 403);

  const create = await POST(new Request('https://agent-ic.example.com/api/policies', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: authHeader({ sub: 'sec_1', tenantId: 'tenant_a', role: 'security_reviewer' }) },
    body: JSON.stringify({ action: 'create', tenantId: 'tenant_a', caseId: 'safety-ops-complaint-triage' }),
  }));
  assert.equal(create.status, 201);
  const created = await create.json();
  assert.equal(created.policy.status, 'draft');

  const activate = await POST(new Request('https://agent-ic.example.com/api/policies', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: authHeader({ sub: 'sec_1', tenantId: 'tenant_a', role: 'security_reviewer' }) },
    body: JSON.stringify({ action: 'activate', tenantId: 'tenant_a', policyId: created.policy.id }),
  }));
  assert.equal(activate.status, 200);
  const activated = await activate.json();
  assert.equal(activated.policy.status, 'active');

  const list = await GET(new Request('https://agent-ic.example.com/api/policies?caseId=safety-ops-complaint-triage', {
    headers: { authorization: authHeader({ sub: 'sec_1', tenantId: 'tenant_a', role: 'security_reviewer' }) },
  }));
  assert.equal(list.status, 200);
  const listed = await list.json();
  assert.equal(listed.activePolicy.id, created.policy.id);

  const crossTenant = await GET(new Request('https://agent-ic.example.com/api/policies?caseId=safety-ops-complaint-triage&tenantId=tenant_b', {
    headers: { authorization: authHeader({ sub: 'sec_1', tenantId: 'tenant_a', role: 'security_reviewer' }) },
  }));
  assert.equal(crossTenant.status, 403);
});
