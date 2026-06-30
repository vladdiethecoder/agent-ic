import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('telemetry export dry-run builds redacted metrics and alerts payload', async () => {
  const obs = await import(`../lib/observability.js?telemetrydry=${Date.now()}`);
  const telemetry = await import(`../lib/telemetryExport.js?telemetrydry=${Date.now()}`);
  obs.resetObservability();
  obs.incrementCounter('agent_ic_test_total', { tenantId: 'tenant_a', token: 'sk_test_secret_1234567890' });
  obs.recordEvent({ level: 'error', kind: 'error', action: 'bad', detail: 'apiKey=provider-secret-placeholder' });
  const result = await telemetry.exportTelemetry({ dryRun: true, endpoint: 'https://telemetry.example.com/ingest', snapshot: obs.getMetricsSnapshot() });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.payload.recordType, 'agent-ic-telemetry-export-v1');
  assert.equal(JSON.stringify(result).includes('sk_test_secret'), false);
  assert.equal(JSON.stringify(result).includes('provider-secret-placeholder'), false);
  assert.equal(result.payload.alerts.summary.triggered > 0, true);
});

test('telemetry export enforces HTTPS in production and posts with optional bearer token', async () => {
  const telemetry = await import(`../lib/telemetryExport.js?telemetrypost=${Date.now()}`);
  const insecure = await telemetry.exportTelemetry({ endpoint: 'http://telemetry.example.com/ingest', env: { AGENT_IC_DEPLOYMENT_MODE: 'production' } });
  assert.equal(insecure.ok, false);
  assert.equal(insecure.code, 'telemetry_endpoint_https_required');

  let posted = null;
  const ok = await telemetry.exportTelemetry({
    endpoint: 'https://telemetry.example.com/ingest?secret=sk_test_secret_1234567890',
    token: 'export-token-secret',
    env: { AGENT_IC_DEPLOYMENT_MODE: 'production' },
    fetchImpl: async (url, options) => {
      posted = { url, options, body: JSON.parse(options.body) };
      return new Response('accepted', { status: 202 });
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.status, 202);
  assert.equal(posted.options.headers.authorization, 'Bearer export-token-secret');
  assert.equal(JSON.stringify(ok).includes('sk_test_secret'), false);
});

test('telemetry export API is guarded and supports dry-run', async () => {
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { GET, POST } = await import(`../app/api/telemetry/export/route.js?case=${Date.now()}`);

  const unauth = await GET(new Request('https://agent-ic.example.com/api/telemetry/export'));
  assert.equal(unauth.status, 401);

  const authed = await GET(new Request('https://agent-ic.example.com/api/telemetry/export', {
    headers: { authorization: authHeader({ sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }) },
  }));
  assert.equal(authed.status, 200);
  assert.equal((await authed.json()).telemetry.dryRun, true);

  const post = await POST(new Request('https://agent-ic.example.com/api/telemetry/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: authHeader({ sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }) },
    body: JSON.stringify({ dryRun: true }),
  }));
  assert.equal(post.status, 200);
  assert.equal((await post.json()).telemetry.dryRun, true);
});
