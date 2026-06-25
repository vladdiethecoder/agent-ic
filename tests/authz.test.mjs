import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { hasPermission } from '../lib/rbac.js';
import { principalFromRequest, requireApiAccess, requireTenantScope, signTestJwt, signTestRs256Jwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';

function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('production mode requires authenticated user tenant and role', () => {
  const req = new NextRequest('https://agent-ic.example.com/api/enterprise-trial', { method: 'POST' });
  const result = principalFromRequest(req, { env: { AGENT_IC_DEPLOYMENT_MODE: 'production', AGENT_IC_AUTH_HS256_SECRET: AUTH_SECRET } });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
});

test('development mode supplies demo principal for hackathon flow', () => {
  const req = new NextRequest('http://localhost:3000/api/enterprise-trial', { method: 'POST' });
  const result = principalFromRequest(req, { env: { AGENT_IC_DEPLOYMENT_MODE: 'development' } });
  assert.equal(result.ok, true);
  assert.equal(result.principal.tenantId, 'demo-tenant');
  assert.equal(result.principal.role, 'owner');
});

test('roles enforce production permissions', () => {
  assert.equal(hasPermission('operator', 'create_trial'), true);
  assert.equal(hasPermission('operator', 'clear_renewals'), false);
  assert.equal(hasPermission('auditor', 'view_proof_report'), true);
  assert.equal(hasPermission('auditor', 'create_trial'), false);
});

test('wrong role is rejected by API access guard', () => {
  const req = new NextRequest('https://agent-ic.example.com/api/enterprise-trial', {
    method: 'POST',
    headers: {
      authorization: authHeader({ sub: 'user_1', tenantId: 'tenant_a', role: 'auditor' }),
    },
  });
  const result = requireApiAccess(req, 'create_trial', { env: { AGENT_IC_DEPLOYMENT_MODE: 'production', AGENT_IC_AUTH_HS256_SECRET: AUTH_SECRET, AGENT_IC_AUTH_ISSUER: 'https://idp.example.com', AGENT_IC_AUTH_AUDIENCE: 'agent-ic' } });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
});

test('production mode rejects spoofable headers by default', () => {
  const req = new NextRequest('https://agent-ic.example.com/api/enterprise-trial', {
    method: 'POST',
    headers: {
      'x-agent-ic-user': 'user_1',
      'x-agent-ic-tenant': 'tenant_a',
      'x-agent-ic-role': 'operator',
    },
  });
  const result = principalFromRequest(req, { env: { AGENT_IC_DEPLOYMENT_MODE: 'production', AGENT_IC_AUTH_HS256_SECRET: AUTH_SECRET } });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
});

test('production trusted-header mode is explicit', () => {
  const req = new NextRequest('https://agent-ic.example.com/api/enterprise-trial', {
    method: 'POST',
    headers: {
      'x-agent-ic-user': 'user_1',
      'x-agent-ic-tenant': 'tenant_a',
      'x-agent-ic-role': 'operator',
    },
  });
  const result = principalFromRequest(req, { env: { AGENT_IC_DEPLOYMENT_MODE: 'production', AGENT_IC_AUTH_ALLOW_TRUSTED_HEADERS: 'true' } });
  assert.equal(result.ok, true);
  assert.equal(result.principal.source, 'trusted-headers');
});

test('tenant scope rejects cross-tenant requests', () => {
  const result = requireTenantScope({ tenantId: 'tenant_a' }, 'tenant_b');
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
});

test('enterprise trial route fails closed without auth in production', async () => {
  const original = snapshotEnv(['AGENT_IC_DEPLOYMENT_MODE', 'AGENT_IC_AUTH_HS256_SECRET', 'AGENT_IC_AUTH_ISSUER', 'AGENT_IC_AUTH_AUDIENCE']);
  try {
    process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
    process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
    process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
    process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
    const { POST } = await import('../app/api/enterprise-trial/route.js?authz=unauth');
    const req = new Request('https://agent-ic.example.com/api/enterprise-trial', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseId: 'safety-ops-complaint-triage' }),
    });
    const response = await POST(req);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.code, 'authentication_required');
  } finally {
    restoreEnv(original);
  }
});

test('enterprise trial route rejects wrong production role', async () => {
  const original = snapshotEnv(['AGENT_IC_DEPLOYMENT_MODE', 'AGENT_IC_AUTH_HS256_SECRET', 'AGENT_IC_AUTH_ISSUER', 'AGENT_IC_AUTH_AUDIENCE']);
  try {
    process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
    process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
    process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
    process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
    const { POST } = await import('../app/api/enterprise-trial/route.js?authz=wrongrole');
    const req = new Request('https://agent-ic.example.com/api/enterprise-trial', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: authHeader({ sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }),
      },
      body: JSON.stringify({ caseId: 'safety-ops-complaint-triage', tenantId: 'tenant_a' }),
    });
    const response = await POST(req);
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.code, 'permission_denied');
  } finally {
    restoreEnv(original);
  }
});

test('enterprise trial route rejects cross-tenant body in production', async () => {
  const original = snapshotEnv(['AGENT_IC_DEPLOYMENT_MODE', 'AGENT_IC_AUTH_HS256_SECRET', 'AGENT_IC_AUTH_ISSUER', 'AGENT_IC_AUTH_AUDIENCE']);
  try {
    process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
    process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
    process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
    process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
    const { POST } = await import('../app/api/enterprise-trial/route.js?authz=tenant');
    const req = new Request('https://agent-ic.example.com/api/enterprise-trial', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: authHeader({ sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }),
      },
      body: JSON.stringify({ caseId: 'safety-ops-complaint-triage', tenantId: 'tenant_b' }),
    });
    const response = await POST(req);
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.code, 'tenant_scope_violation');
  } finally {
    restoreEnv(original);
  }
});


test('production mode accepts RS256 JWT verified by configured JWKS JSON', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = 'rsa-test-1';
  jwk.use = 'sig';
  jwk.alg = 'RS256';
  const token = signTestRs256Jwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'rs_user', tenantId: 'tenant_rs', role: 'operator' }, privateKey, { kid: 'rsa-test-1' });
  const req = new NextRequest('https://agent-ic.example.com/api/enterprise-trial', { headers: { authorization: `Bearer ${token}` } });
  const result = principalFromRequest(req, {
    env: {
      AGENT_IC_DEPLOYMENT_MODE: 'production',
      AGENT_IC_AUTH_ISSUER: 'https://idp.example.com',
      AGENT_IC_AUTH_AUDIENCE: 'agent-ic',
      AGENT_IC_AUTH_JWKS_JSON: JSON.stringify({ keys: [jwk] }),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.principal.userId, 'rs_user');
  assert.equal(result.principal.source, 'jwt');
});

test('production mode rejects RS256 JWT when JWKS key does not match', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { publicKey: wrongPublicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const wrongJwk = wrongPublicKey.export({ format: 'jwk' });
  wrongJwk.kid = 'rsa-test-1';
  const token = signTestRs256Jwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'rs_user', tenantId: 'tenant_rs', role: 'operator' }, privateKey, { kid: 'rsa-test-1' });
  const req = new NextRequest('https://agent-ic.example.com/api/enterprise-trial', { headers: { authorization: `Bearer ${token}` } });
  const result = principalFromRequest(req, {
    env: {
      AGENT_IC_DEPLOYMENT_MODE: 'production',
      AGENT_IC_AUTH_ISSUER: 'https://idp.example.com',
      AGENT_IC_AUTH_AUDIENCE: 'agent-ic',
      AGENT_IC_AUTH_JWKS_JSON: JSON.stringify({ keys: [wrongJwk] }),
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
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

test('async production auth fetches JWKS URL and caches key material', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = 'remote-rsa-1';
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return Response.json({ keys: [jwk] });
  };
  try {
    const token = signTestRs256Jwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'remote_user', tenantId: 'tenant_remote', role: 'operator' }, privateKey, { kid: 'remote-rsa-1' });
    const req = new NextRequest('https://agent-ic.example.com/api/enterprise-trial', { headers: { authorization: `Bearer ${token}` } });
    const env = {
      AGENT_IC_DEPLOYMENT_MODE: 'production',
      AGENT_IC_AUTH_ISSUER: 'https://idp.example.com',
      AGENT_IC_AUTH_AUDIENCE: 'agent-ic',
      AGENT_IC_AUTH_JWKS_URL: 'https://idp.example.com/.well-known/jwks.json',
      AGENT_IC_AUTH_JWKS_CACHE_MS: '60000',
    };
    const { principalFromRequestAsync } = await import('../lib/authz.js');
    const first = await principalFromRequestAsync(req, { env });
    const second = await principalFromRequestAsync(req, { env });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(first.principal.userId, 'remote_user');
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('async production auth rejects non-https JWKS URL in production', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const token = signTestRs256Jwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'remote_user', tenantId: 'tenant_remote', role: 'operator' }, privateKey, { kid: 'remote-rsa-2' });
  const req = new NextRequest('https://agent-ic.example.com/api/enterprise-trial', { headers: { authorization: `Bearer ${token}` } });
  const { principalFromRequestAsync } = await import('../lib/authz.js?nonhttps=1');
  const result = await principalFromRequestAsync(req, {
    env: {
      AGENT_IC_DEPLOYMENT_MODE: 'production',
      AGENT_IC_AUTH_ISSUER: 'https://idp.example.com',
      AGENT_IC_AUTH_AUDIENCE: 'agent-ic',
      AGENT_IC_AUTH_JWKS_URL: 'http://idp.example.com/jwks.json',
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
});
