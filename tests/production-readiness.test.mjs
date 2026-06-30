import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { signTestJwt } from '../lib/authz.js';
import { validateProductionConfig } from '../lib/productionConfig.js';
import { middleware } from '../middleware.js';

test('production config validates DATABASE_URL format in production-readiness', () => {
  const bad = validateProductionConfig({
    NODE_ENV: 'production',
    AGENT_IC_DEPLOYMENT_MODE: 'production',
    DATABASE_URL: 'mysql://localhost/agentic',
  });
  assert.ok(bad.blockers.find((b) => b.id === 'database_url_valid_format'));

  const good = validateProductionConfig({
    NODE_ENV: 'production',
    AGENT_IC_DEPLOYMENT_MODE: 'production',
    DATABASE_URL: 'postgres://user:pass@localhost/agentic',
  });
  assert.equal(good.blockers.find((b) => b.id === 'database_url_valid_format'), undefined);
});

test('production config fails closed for missing enterprise controls', () => {
  const result = validateProductionConfig({
    NODE_ENV: 'production',
    AGENT_IC_DEPLOYMENT_MODE: 'production',
    AGENT_IC_KMS_REQUIRED: 'true',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEMOTRON_API_KEY: 'nvapi-...',
    STRIPE_SECRET_KEY: 'sk_test_...',
    AGENT_IC_LOCAL_MODE: 'true',
  });

  assert.equal(result.ok, false);
  const blockerIds = result.blockers.map((b) => b.id);
  assert.ok(blockerIds.includes('public_app_url_not_local_in_production'));
  assert.ok(blockerIds.includes('public_app_url_https_in_production'));
  assert.ok(blockerIds.includes('auth_config_present_in_production'));
  assert.ok(blockerIds.includes('durable_store_present_in_production'));
  assert.ok(blockerIds.includes('audit_signing_key_present_in_production'));
  assert.ok(blockerIds.includes('audit_signatures_required_in_production'));
  assert.ok(blockerIds.includes('export_signatures_required_in_production'));
  assert.ok(blockerIds.includes('immutable_export_store_configured_in_production'));
  assert.ok(blockerIds.includes('key_rotation_policy_configured_in_production'));
  assert.ok(blockerIds.includes('kms_backend_configured_in_production'));
  assert.ok(blockerIds.includes('key_access_policy_configured_in_production'));
  assert.ok(blockerIds.includes('key_approval_workflow_configured_in_production'));
  assert.ok(blockerIds.includes('shared_rate_limiter_configured_in_production'));
  assert.ok(blockerIds.includes('telemetry_export_configured_in_production'));
  assert.ok(blockerIds.includes('telemetry_export_https_in_production'));
  assert.ok(blockerIds.includes('scim_bearer_token_present'));
  assert.ok(blockerIds.includes('scim_tenant_configured_in_production'));
  assert.ok(blockerIds.includes('nemotron_api_key_not_placeholder'));
  assert.ok(blockerIds.includes('stripe_secret_key_not_placeholder'));
  assert.ok(blockerIds.includes('strict_live_proof_required_in_production'));
  assert.ok(blockerIds.includes('local_provider_mode_disabled_in_production'));
  assert.ok(blockerIds.includes('stripe_secret_is_live_in_production'));
  assert.ok(blockerIds.includes('stripe_webhook_secret_live_in_production'));
});

test('production config accepts complete production baseline', () => {
  const result = validateProductionConfig({
    NODE_ENV: 'production',
    AGENT_IC_DEPLOYMENT_MODE: 'production',
    NEXT_PUBLIC_APP_URL: 'https://agent-ic.example.com',
    NEMOTRON_API_KEY: 'nemotron-test-key-123',
    STRIPE_SECRET_KEY: ['sk', 'live', '1234567890abcdef'].join('_'),
    STRIPE_WEBHOOK_SECRET: 'whsec_1234567890abcdef',
    STRIPE_PUBLISHABLE_KEY: ['pk', 'live', '1234567890abcdef'].join('_'),
    AGENT_IC_REQUIRE_LIVE_PROOF: 'true',
    AGENT_IC_LOCAL_MODE: 'false',
    AGENT_IC_AUTH_ISSUER: 'https://idp.example.com',
    AGENT_IC_AUTH_AUDIENCE: 'agent-ic',
    AGENT_IC_AUTH_JWKS_URL: 'https://idp.example.com/.well-known/jwks.json',
    AGENT_IC_AUTH_REQUIRE_MEMBERSHIP: 'true',
    AGENT_IC_SCIM_BEARER_TOKEN: 'scim-token-1234567890abcdef',
    AGENT_IC_SCIM_TENANT_ID: 'tenant_a',
    DATABASE_URL: 'postgres://agentic@example.com/agentic',
    AGENT_IC_AUDIT_SIGNING_KEY: 'audit-signing-key-1234567890',
    AGENT_IC_AUDIT_REQUIRE_SIGNATURES: 'true',
    AGENT_IC_EXPORT_SIGNING_KEY: 'export-signing-key-1234567890',
    AGENT_IC_EXPORT_REQUIRE_SIGNATURES: 'true',
    AGENT_IC_EXPORT_ARCHIVE_URL: 'https://archive.example.com/agent-ic',
    AGENT_IC_KEY_MAX_AGE_DAYS: '90',
    AGENT_IC_KMS_BACKEND: 'local',
    AGENT_IC_KEY_ACCESS_POLICY_REQUIRED: 'true',
    AGENT_IC_KEY_APPROVAL_WORKFLOW_REQUIRED: 'true',
    AGENT_IC_TELEMETRY_EXPORT_URL: 'https://telemetry.example.com/agent-ic',
    AGENT_IC_RATE_LIMIT_MAX: '20',
    AGENT_IC_RATE_LIMIT_WINDOW_MS: '60000',
    AGENT_IC_RATE_LIMIT_BACKEND_URL: 'https://ratelimit.example.com/agent-ic',
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
});

test('ready route reports not_ready with production blockers', async () => {
  const original = snapshotEnv([
    'NODE_ENV',
    'AGENT_IC_DEPLOYMENT_MODE',
    'NEXT_PUBLIC_APP_URL',
    'NEMOTRON_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'AGENT_IC_REQUIRE_LIVE_PROOF',
    'AGENT_IC_LOCAL_MODE',
    'AGENT_IC_AUTH_ISSUER',
    'AGENT_IC_AUTH_AUDIENCE',
    'AGENT_IC_AUTH_JWKS_URL',
    'AGENT_IC_AUTH_REQUIRE_MEMBERSHIP',
    'AGENT_IC_SCIM_BEARER_TOKEN',
    'AGENT_IC_SCIM_TENANT_ID',
    'DATABASE_URL',
    'AGENT_IC_DATA_STORE_URL',
    'AGENT_IC_AUDIT_SIGNING_KEY',
    'AGENT_IC_AUDIT_REQUIRE_SIGNATURES',
    'AGENT_IC_EXPORT_SIGNING_KEY',
    'AGENT_IC_EXPORT_REQUIRE_SIGNATURES',
    'AGENT_IC_EXPORT_ARCHIVE_URL',
    'AGENT_IC_KEY_MAX_AGE_DAYS',
    'AGENT_IC_KMS_BACKEND',
    'AGENT_IC_KEY_ACCESS_POLICY_REQUIRED',
    'AGENT_IC_KEY_APPROVAL_WORKFLOW_REQUIRED',
    'AGENT_IC_TELEMETRY_EXPORT_URL',
  ]);
  try {
    process.env.NODE_ENV = 'production';
    process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    process.env.NEMOTRON_API_KEY = 'nvapi-...';
    process.env.STRIPE_SECRET_KEY = 'sk_test_...';
    delete process.env.AGENT_IC_AUTH_ISSUER;
    delete process.env.AGENT_IC_AUTH_AUDIENCE;
    delete process.env.AGENT_IC_AUTH_JWKS_URL;
    delete process.env.AGENT_IC_AUTH_REQUIRE_MEMBERSHIP;
    delete process.env.AGENT_IC_SCIM_BEARER_TOKEN;
    delete process.env.AGENT_IC_SCIM_TENANT_ID;
    delete process.env.DATABASE_URL;
    delete process.env.AGENT_IC_DATA_STORE_URL;
    delete process.env.AGENT_IC_AUDIT_SIGNING_KEY;
    delete process.env.AGENT_IC_AUDIT_REQUIRE_SIGNATURES;
    delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
    delete process.env.AGENT_IC_EXPORT_REQUIRE_SIGNATURES;
    delete process.env.AGENT_IC_EXPORT_ARCHIVE_URL;
    delete process.env.AGENT_IC_KEY_MAX_AGE_DAYS;
    delete process.env.AGENT_IC_KMS_BACKEND;
    delete process.env.AGENT_IC_KEY_ACCESS_POLICY_REQUIRED;
    delete process.env.AGENT_IC_KEY_APPROVAL_WORKFLOW_REQUIRED;
    delete process.env.AGENT_IC_TELEMETRY_EXPORT_URL;

    const { GET } = await import('../app/api/ready/route.js?case=prod_blockers');
    const response = await GET();
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.status, 'not_ready');
    assert.equal(body.productionReady, false);
    assert.equal(body.readinessScope, 'production');
    assert.match(body.truthModel, /Production readiness requires/);
    assert.ok(body.blockers.length >= 4);
    assert.equal(JSON.stringify(body).includes('sk_test_'), false);
    assert.equal(JSON.stringify(body).includes('nvapi-'), false);
  } finally {
    restoreEnv(original);
  }
});

test('middleware adds security and CORS headers', () => {
  const request = new NextRequest('https://agent-ic.example.com/api/enterprise-trial', {
    method: 'GET',
    headers: { origin: 'https://agent-ic.example.com' },
  });
  const response = middleware(request);

  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://agent-ic.example.com');
  assert.match(response.headers.get('content-security-policy-report-only') || '', /default-src 'self'/);
  assert.match(response.headers.get('content-security-policy-report-only') || '', /frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-agent-ic-csp-mode'), 'report-only');
  assert.equal(response.headers.get('x-agent-ic-api-version'), '2026-06-23.foundation-v1');
  assert.equal(response.headers.get('x-agent-ic-api-deprecation-policy'), 'no-removal-without-documented-successor');
});

test('middleware rejects unsupported explicit API version', async () => {
  const request = new NextRequest('https://agent-ic.example.com/api/health', {
    method: 'GET',
    headers: { 'x-agent-ic-api-version': '1999-01-01' },
  });
  const response = middleware(request);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, 'unsupported_api_version');
  assert.equal(body.supportedVersion, '2026-06-23.foundation-v1');
});

test('middleware adds HSTS in production mode', () => {
  const original = snapshotEnv(['AGENT_IC_DEPLOYMENT_MODE']);
  try {
    process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
    const request = new NextRequest('https://agent-ic.example.com/api/health', { method: 'GET' });
    const response = middleware(request);
    assert.match(response.headers.get('strict-transport-security') || '', /max-age=31536000/);
  } finally {
    restoreEnv(original);
  }
});


test('middleware rate limit key includes tenant principal context', () => {
  const original = snapshotEnv(['AGENT_IC_RATE_LIMIT_MAX', 'AGENT_IC_RATE_LIMIT_WINDOW_MS']);
  try {
    process.env.AGENT_IC_RATE_LIMIT_MAX = '1';
    process.env.AGENT_IC_RATE_LIMIT_WINDOW_MS = '60000';
    const tokenA = signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'user_1', tenantId: 'tenant_a', role: 'operator' }, 'test-secret');
    const tokenB = signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'user_1', tenantId: 'tenant_b', role: 'operator' }, 'test-secret');
    const request = (token) => new NextRequest('https://agent-ic.example.com/api/enterprise-trial', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '203.0.113.55', origin: 'https://agent-ic.example.com' },
    });
    const firstA = middleware(request(tokenA));
    const secondA = middleware(request(tokenA));
    const firstB = middleware(request(tokenB));
    assert.notEqual(firstA.status, 429);
    assert.equal(firstA.headers.get('x-ratelimit-scope'), 'tenant_a:operator');
    assert.equal(secondA.status, 429);
    assert.notEqual(firstB.status, 429);
    assert.equal(firstB.headers.get('x-ratelimit-scope'), 'tenant_b:operator');
  } finally {
    restoreEnv(original);
  }
});


test('middleware rate limits mutation routes', () => {
  const original = snapshotEnv(['AGENT_IC_RATE_LIMIT_MAX', 'AGENT_IC_RATE_LIMIT_WINDOW_MS']);
  try {
    process.env.AGENT_IC_RATE_LIMIT_MAX = '1';
    process.env.AGENT_IC_RATE_LIMIT_WINDOW_MS = '60000';
    const request = () => new NextRequest('https://agent-ic.example.com/api/enterprise-trial', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.42', origin: 'https://agent-ic.example.com' },
    });

    const first = middleware(request());
    const second = middleware(request());

    assert.notEqual(first.status, 429);
    assert.equal(second.status, 429);
    assert.equal(second.headers.get('retry-after'), '60');
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
