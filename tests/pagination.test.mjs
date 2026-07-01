import test from 'node:test';
import assert from 'node:assert/strict';
import { paginationFromRequest, paginateArray, paginatedField } from '../lib/pagination.js';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('pagination helper returns deterministic metadata and clamps limit', () => {
  const req = new Request('https://agent-ic.example.com/api/items?limit=500&cursor=2');
  const opts = paginationFromRequest(req);
  assert.equal(opts.limit, 200);
  assert.equal(opts.cursor, 2);
  const page = paginateArray(['a', 'b', 'c', 'd'], { limit: 2, cursor: 1 });
  assert.deepEqual(page.items, ['b', 'c']);
  assert.equal(page.pagination.nextCursor, '3');
  assert.equal(page.pagination.total, 4);
  assert.deepEqual(Object.keys(paginatedField('items', ['x'], { limit: 1, cursor: 0 })).sort(), ['items', 'pagination']);
});

test('memberships API returns paginated list metadata while preserving memberships field', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-pagination-memberships-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { POST, GET } = await import(`../app/api/memberships/route.js?case=pagination${Date.now()}`);
  const owner = authHeader({ sub: 'owner_1', tenantId: 'tenant_a', role: 'owner' });
  for (const userId of ['user_a', 'user_b', 'user_c']) {
    const response = await POST(new Request('https://agent-ic.example.com/api/memberships', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: owner }, body: JSON.stringify({ action: 'upsert', tenantId: 'tenant_a', userId, role: 'operator' }),
    }));
    assert.equal(response.status, 200);
  }
  const page1 = await GET(new Request('https://agent-ic.example.com/api/memberships?tenantId=tenant_a&limit=2', { headers: { authorization: owner } }));
  const body1 = await page1.json();
  assert.equal(body1.memberships.length, 2);
  assert.equal(body1.pagination.total, 3);
  assert.equal(body1.pagination.nextCursor, '2');

  const page2 = await GET(new Request(`https://agent-ic.example.com/api/memberships?tenantId=tenant_a&limit=2&cursor=${body1.pagination.nextCursor}`, { headers: { authorization: owner } }));
  const body2 = await page2.json();
  assert.equal(body2.memberships.length, 1);
  assert.equal(body2.pagination.hasMore, false);
});
