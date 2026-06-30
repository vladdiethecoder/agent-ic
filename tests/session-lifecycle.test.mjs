import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';

function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('session store creates authenticates and revokes browser sessions without exposing token hash', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-session-store-${Date.now()}-${Math.random()}`;
  const store = await import(`../lib/sessionStore.js?case=store${Date.now()}`);
  const { token, session } = store.createSession({ userId: 'owner_1', tenantId: 'tenant_a', role: 'owner', provider: 'oidc' });
  assert.ok(token.length > 32);
  assert.equal(session.tokenHash, undefined);
  const loaded = store.getSessionByToken(token);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.principal.source, 'session');
  assert.equal(loaded.principal.tenantId, 'tenant_a');
  const revoked = store.revokeSessionByToken(token, { revokedBy: 'owner_1' });
  assert.equal(revoked.ok, true);
  assert.equal(store.getSessionByToken(token).code, 'session_revoked');
});

test('production auth accepts durable HttpOnly session cookie', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-session-authz-${Date.now()}-${Math.random()}`;
  const store = await import(`../lib/sessionStore.js?case=authz${Date.now()}`);
  const authz = await import(`../lib/authz.js?case=sessionauth${Date.now()}`);
  const { token } = store.createSession({ userId: 'owner_1', tenantId: 'tenant_a', role: 'owner', provider: 'oidc' });
  const req = new NextRequest('https://agent-ic.example.com/api/proof-report', {
    headers: { cookie: `${store.SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` },
  });
  const result = authz.principalFromRequest(req, { env: { AGENT_IC_DEPLOYMENT_MODE: 'production' } });
  assert.equal(result.ok, true);
  assert.equal(result.principal.source, 'session');
  assert.equal(result.principal.userId, 'owner_1');
});

test('session API exchanges signed bearer token for cookie and logout revokes it', async () => {
  const original = snapshotEnv(['AGENT_IC_STORE_ROOT', 'AGENT_IC_DEPLOYMENT_MODE', 'AGENT_IC_AUTH_HS256_SECRET', 'AGENT_IC_AUTH_ISSUER', 'AGENT_IC_AUTH_AUDIENCE']);
  try {
    process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-session-api-${Date.now()}-${Math.random()}`;
    process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
    process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
    process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
    process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
    const route = await import(`../app/api/session/route.js?case=sessionapi${Date.now()}`);
    const create = await route.POST(new Request('https://agent-ic.example.com/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader({ sub: 'owner_1', tenantId: 'tenant_a', role: 'owner' }) },
      body: JSON.stringify({ provider: 'oidc-test', maxAgeSeconds: 600 }),
    }));
    assert.equal(create.status, 200);
    const createdBody = await create.json();
    assert.equal(createdBody.session.tokenHash, undefined);
    assert.equal(createdBody.auth.authSource, 'session');
    const cookie = create.headers.get('set-cookie');
    assert.match(cookie, /agent_ic_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);

    const current = await route.GET(new Request('https://agent-ic.example.com/api/session', { headers: { cookie } }));
    assert.equal(current.status, 200);
    assert.equal((await current.json()).auth.authSource, 'session');

    const logout = await route.DELETE(new Request('https://agent-ic.example.com/api/session', { method: 'DELETE', headers: { cookie } }));
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);

    const after = await route.GET(new Request('https://agent-ic.example.com/api/session', { headers: { cookie } }));
    assert.equal(after.status, 401);
    assert.equal((await after.json()).code, 'session_revoked');
  } finally {
    restoreEnv(original);
  }
});


test('session-authenticated mutations require matching CSRF token', async () => {
  const original = snapshotEnv(['AGENT_IC_STORE_ROOT', 'AGENT_IC_DEPLOYMENT_MODE', 'AGENT_IC_AUTH_HS256_SECRET', 'AGENT_IC_AUTH_ISSUER', 'AGENT_IC_AUTH_AUDIENCE']);
  try {
    process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-session-csrf-${Date.now()}-${Math.random()}`;
    process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
    process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
    process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
    process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
    const sessionRoute = await import(`../app/api/session/route.js?case=csrf_session${Date.now()}`);
    const approvalsRoute = await import(`../app/api/approvals/route.js?case=csrf_approval${Date.now()}`);
    const create = await sessionRoute.POST(new Request('https://agent-ic.example.com/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader({ sub: 'owner_1', tenantId: 'tenant_a', role: 'owner' }) },
      body: JSON.stringify({ provider: 'oidc-test', maxAgeSeconds: 600 }),
    }));
    const setCookie = create.headers.get('set-cookie') || '';
    const sessionPair = cookiePair(setCookie, 'agent_ic_session');
    const csrfPair = cookiePair(setCookie, 'agent_ic_csrf');
    assert.ok(sessionPair);
    assert.ok(csrfPair);
    const cookie = `${sessionPair}; ${csrfPair}`;
    const body = JSON.stringify({ action: 'request', tenantId: 'tenant_a', caseId: 'safety-ops-complaint-triage', spendCap: 100, reason: 'csrf test' });

    const denied = await approvalsRoute.POST(new Request('https://agent-ic.example.com/api/approvals', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie }, body,
    }));
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).code, 'csrf_required');

    const allowed = await approvalsRoute.POST(new Request('https://agent-ic.example.com/api/approvals', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie, 'x-agent-ic-csrf': decodeURIComponent(csrfPair.split('=')[1]) }, body,
    }));
    assert.equal(allowed.status, 201);
    assert.equal((await allowed.json()).approval.status, 'pending');
  } finally {
    restoreEnv(original);
  }
});


test('session API refuses unauthenticated session creation in production', async () => {
  const original = snapshotEnv(['AGENT_IC_STORE_ROOT', 'AGENT_IC_DEPLOYMENT_MODE', 'AGENT_IC_AUTH_HS256_SECRET']);
  try {
    process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-session-api-denied-${Date.now()}-${Math.random()}`;
    process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
    process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
    const { POST } = await import(`../app/api/session/route.js?case=sessiondenied${Date.now()}`);
    const response = await POST(new Request('https://agent-ic.example.com/api/session', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    }));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'authentication_required');
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


function cookiePair(setCookie, name) {
  const match = String(setCookie).match(new RegExp(`${name}=[^;,]+`));
  return match ? match[0] : '';
}
