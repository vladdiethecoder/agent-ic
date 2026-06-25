import test from 'node:test';
import assert from 'node:assert/strict';

const SCIM_TOKEN = 'scim-token-1234567890abcdef';
const TENANT = 'tenant_scim';
const EXT = 'urn:agentic:params:scim:schemas:extension:membership:2.0:User';

function scimHeaders(token = SCIM_TOKEN) {
  return { 'content-type': 'application/scim+json', authorization: `Bearer ${token}` };
}

function params(userId) {
  return { params: { userId: encodeURIComponent(userId) } };
}

test('SCIM users route fails closed when unconfigured or unauthenticated', async () => {
  const original = snapshotEnv(['AGENT_IC_STORE_ROOT', 'AGENT_IC_SCIM_BEARER_TOKEN', 'AGENT_IC_SCIM_TENANT_ID']);
  try {
    process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-scim-denied-${Date.now()}-${Math.random()}`;
    delete process.env.AGENT_IC_SCIM_BEARER_TOKEN;
    delete process.env.AGENT_IC_SCIM_TENANT_ID;
    const { GET } = await import(`../app/api/scim/v2/Users/route.js?case=denied${Date.now()}`);
    const unconfigured = await GET(new Request('https://agent-ic.example.com/api/scim/v2/Users'));
    assert.equal(unconfigured.status, 503);
    assert.equal((await unconfigured.json()).scimType, 'invalidValue');

    process.env.AGENT_IC_SCIM_BEARER_TOKEN = SCIM_TOKEN;
    process.env.AGENT_IC_SCIM_TENANT_ID = TENANT;
    const unauthorized = await GET(new Request('https://agent-ic.example.com/api/scim/v2/Users'));
    assert.equal(unauthorized.status, 401);
  } finally {
    restoreEnv(original);
  }
});

test('SCIM creates lists gets patches and deletes tenant memberships', async () => {
  const original = snapshotEnv(['AGENT_IC_STORE_ROOT', 'AGENT_IC_SCIM_BEARER_TOKEN', 'AGENT_IC_SCIM_TENANT_ID']);
  try {
    process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-scim-users-${Date.now()}-${Math.random()}`;
    process.env.AGENT_IC_SCIM_BEARER_TOKEN = SCIM_TOKEN;
    process.env.AGENT_IC_SCIM_TENANT_ID = TENANT;
    const collection = await import(`../app/api/scim/v2/Users/route.js?case=users${Date.now()}`);
    const item = await import(`../app/api/scim/v2/Users/[userId]/route.js?case=user${Date.now()}`);

    const create = await collection.POST(new Request('https://agent-ic.example.com/api/scim/v2/Users', {
      method: 'POST', headers: scimHeaders(), body: JSON.stringify({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User', EXT],
        userName: 'operator@example.com',
        externalId: 'idp-123',
        displayName: 'Operator Example',
        active: true,
        emails: [{ value: 'operator@example.com', primary: true }],
        [EXT]: { role: 'operator' },
      }),
    }));
    assert.equal(create.status, 201);
    const created = await create.json();
    assert.equal(created.id, 'operator@example.com');
    assert.equal(created[EXT].role, 'operator');
    assert.equal(created.active, true);
    assert.equal(JSON.stringify(created).includes('scim-token'), false);

    const list = await collection.GET(new Request('https://agent-ic.example.com/api/scim/v2/Users?filter=userName%20eq%20%22operator%40example.com%22', { headers: scimHeaders() }));
    const listed = await list.json();
    assert.equal(listed.totalResults, 1);
    assert.equal(listed.Resources[0].displayName, 'Operator Example');

    const get = await item.GET(new Request('https://agent-ic.example.com/api/scim/v2/Users/operator%40example.com', { headers: scimHeaders() }), params('operator@example.com'));
    assert.equal(get.status, 200);
    assert.equal((await get.json()).externalId, 'idp-123');

    const patch = await item.PATCH(new Request('https://agent-ic.example.com/api/scim/v2/Users/operator%40example.com', {
      method: 'PATCH', headers: scimHeaders(), body: JSON.stringify({ schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'replace', path: `${EXT}:role`, value: 'auditor' }] }),
    }), params('operator@example.com'));
    assert.equal(patch.status, 200);
    const patched = await patch.json();
    assert.equal(patched[EXT].role, 'auditor');

    const del = await item.DELETE(new Request('https://agent-ic.example.com/api/scim/v2/Users/operator%40example.com', { method: 'DELETE', headers: scimHeaders() }), params('operator@example.com'));
    assert.equal(del.status, 204);
    const afterDelete = await item.GET(new Request('https://agent-ic.example.com/api/scim/v2/Users/operator%40example.com', { headers: scimHeaders() }), params('operator@example.com'));
    assert.equal((await afterDelete.json()).active, false);
  } finally {
    restoreEnv(original);
  }
});

test('SCIM rejects unknown Agent IC roles', async () => {
  const original = snapshotEnv(['AGENT_IC_STORE_ROOT', 'AGENT_IC_SCIM_BEARER_TOKEN', 'AGENT_IC_SCIM_TENANT_ID']);
  try {
    process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-scim-role-${Date.now()}-${Math.random()}`;
    process.env.AGENT_IC_SCIM_BEARER_TOKEN = SCIM_TOKEN;
    process.env.AGENT_IC_SCIM_TENANT_ID = TENANT;
    const { POST } = await import(`../app/api/scim/v2/Users/route.js?case=role${Date.now()}`);
    const response = await POST(new Request('https://agent-ic.example.com/api/scim/v2/Users', {
      method: 'POST', headers: scimHeaders(), body: JSON.stringify({ userName: 'bad-role@example.com', [EXT]: { role: 'super_admin' } }),
    }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).detail, /Unknown Agent IC role/);
  } finally {
    restoreEnv(original);
  }
});

function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
