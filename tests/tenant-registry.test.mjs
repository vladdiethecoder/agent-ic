import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('tenant registry upserts lists and deactivates tenants', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-tenant-registry-${Date.now()}-${Math.random()}`;
  const registry = await import(`../lib/tenantRegistry.js?case=registry${Date.now()}`);
  const tenant = registry.upsertTenant({ tenantId: 'tenant_a', name: 'Tenant A', updatedBy: 'owner_1' });
  assert.equal(tenant.status, 'active');
  assert.equal(registry.getTenant({ tenantId: 'tenant_a' }).name, 'Tenant A');
  assert.equal(registry.listTenants().length, 1);
  const deactivated = registry.deactivateTenant({ tenantId: 'tenant_a', updatedBy: 'owner_1' });
  assert.equal(deactivated.ok, true);
  assert.equal(registry.getTenant({ tenantId: 'tenant_a' }).status, 'inactive');
});

test('tenants API is guarded by manage_users', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-tenant-api-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { POST, GET } = await import(`../app/api/tenants/route.js?case=tenantapi${Date.now()}`);
  const operator = authHeader({ sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' });
  const owner = authHeader({ sub: 'owner_1', tenantId: 'tenant_a', role: 'owner' });
  const denied = await POST(new Request('https://agent-ic.example.com/api/tenants', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: operator }, body: JSON.stringify({ tenantId: 'tenant_a', name: 'Tenant A' }),
  }));
  assert.equal(denied.status, 403);
  const upsert = await POST(new Request('https://agent-ic.example.com/api/tenants', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: owner }, body: JSON.stringify({ tenantId: 'tenant_a', name: 'Tenant A' }),
  }));
  assert.equal(upsert.status, 200);
  const list = await GET(new Request('https://agent-ic.example.com/api/tenants', { headers: { authorization: owner } }));
  assert.equal(list.status, 200);
  assert.equal((await list.json()).tenants.some((tenant) => tenant.tenantId === 'tenant_a'), true);
});
