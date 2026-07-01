import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('observability counters and events redact secrets', async () => {
  const obs = await import(`../lib/observability.js?case=redact${Date.now()}`);
  obs.resetObservability();
  obs.incrementCounter('agent_ic_test_total', { tenantId: 'tenant_a', token: 'sk_test_secret' });
  obs.recordEvent({ level: 'info', kind: 'test', action: 'secret_event', detail: 'key=sk_test_secret nvapi-secret', apiKey: 'nvapi-secret' });
  const snapshot = obs.getMetricsSnapshot();
  assert.equal(snapshot.counters.length, 2); // explicit counter + event counter
  assert.equal(JSON.stringify(snapshot).includes('sk_test_secret'), false);
  assert.equal(JSON.stringify(snapshot).includes('nvapi-secret'), false);
  assert.match(obs.metricsAsPrometheus(snapshot), /agent_ic_test_total/);
});

test('metrics route is guarded and returns json/prometheus', async () => {
  const obs = await import(`../lib/observability.js?case=route${Date.now()}`);
  obs.resetObservability();
  obs.incrementCounter('agent_ic_route_test_total', { tenantId: 'tenant_a' });
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { GET } = await import(`../app/api/metrics/route.js?case=${Date.now()}`);

  const unauth = await GET(new Request('https://agent-ic.example.com/api/metrics'));
  assert.equal(unauth.status, 401);

  const json = await GET(new Request('https://agent-ic.example.com/api/metrics', {
    headers: {
      authorization: authHeader({ sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }),
    },
  }));
  assert.equal(json.status, 200);
  const body = await json.json();
  assert.equal(body.ok, true);
  assert.ok(body.metrics.counters.some((metric) => metric.name === 'agent_ic_route_test_total'));

  const text = await GET(new Request('https://agent-ic.example.com/api/metrics', {
    headers: {
      accept: 'text/plain',
      authorization: authHeader({ sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }),
    },
  }));
  assert.equal(text.status, 200);
  assert.match(await text.text(), /agent_ic_route_test_total/);
});
