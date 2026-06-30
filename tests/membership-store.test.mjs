import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { principalFromRequest, signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('membership store upserts lists and deactivates members', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-memberships-${Date.now()}-${Math.random()}`;
  const store = await import(`../lib/membershipStore.js?case=store${Date.now()}`);
  const member = store.upsertMembership({ tenantId: 'tenant_a', userId: 'user_1', role: 'operator', displayName: 'User One', updatedBy: 'owner_1' });
  assert.equal(member.status, 'active');
  assert.equal(store.getMembership({ tenantId: 'tenant_a', userId: 'user_1' }).role, 'operator');
  assert.equal(store.listMemberships({ tenantId: 'tenant_a' }).length, 1);
  const deactivated = store.deactivateMembership({ tenantId: 'tenant_a', userId: 'user_1', updatedBy: 'owner_1' });
  assert.equal(deactivated.ok, true);
  assert.equal(store.getMembership({ tenantId: 'tenant_a', userId: 'user_1' }).status, 'inactive');
});

test('production auth can require active stored membership', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-membership-auth-${Date.now()}-${Math.random()}`;
  const store = await import(`../lib/membershipStore.js?case=auth${Date.now()}`);
  const env = {
    AGENT_IC_DEPLOYMENT_MODE: 'production',
    AGENT_IC_AUTH_HS256_SECRET: AUTH_SECRET,
    AGENT_IC_AUTH_ISSUER: 'https://idp.example.com',
    AGENT_IC_AUTH_AUDIENCE: 'agent-ic',
    AGENT_IC_AUTH_REQUIRE_MEMBERSHIP: 'true',
  };
  const req = (role = 'operator') => new NextRequest('https://agent-ic.example.com/api/enterprise-trial', {
    headers: { authorization: authHeader({ sub: 'user_1', tenantId: 'tenant_a', role }) },
  });
  assert.equal(principalFromRequest(req(), { env }).ok, false);
  store.upsertMembership({ tenantId: 'tenant_a', userId: 'user_1', role: 'operator' });
  const ok = principalFromRequest(req(), { env });
  assert.equal(ok.ok, true);
  assert.equal(ok.principal.membership.status, 'active');
  const mismatch = principalFromRequest(req('auditor'), { env });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.response.status, 403);
});

test('memberships API is guarded and tenant-scoped', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-membership-api-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { POST, GET } = await import(`../app/api/memberships/route.js?case=api${Date.now()}`);
  const owner = authHeader({ sub: 'owner_1', tenantId: 'tenant_a', role: 'owner' });
  const upsert = await POST(new Request('https://agent-ic.example.com/api/memberships', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: owner },
    body: JSON.stringify({ action: 'upsert', tenantId: 'tenant_a', userId: 'operator_1', role: 'operator' }),
  }));
  assert.equal(upsert.status, 200);
  const list = await GET(new Request('https://agent-ic.example.com/api/memberships?tenantId=tenant_a', { headers: { authorization: owner } }));
  assert.equal(list.status, 200);
  assert.equal((await list.json()).memberships.length, 1);
  const cross = await GET(new Request('https://agent-ic.example.com/api/memberships?tenantId=tenant_b', { headers: { authorization: owner } }));
  assert.equal(cross.status, 403);
});
