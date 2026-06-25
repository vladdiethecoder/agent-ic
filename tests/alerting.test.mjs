import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('alert evaluator reports clear state and redacts on-call secrets', async () => {
  process.env.AGENT_IC_ONCALL_CHANNEL = 'pager-token=sk_test_secret_1234567890';
  process.env.AGENT_IC_ONCALL_TARGET = 'primary-platform-owner';
  const obs = await import(`../lib/observability.js?alertclear=${Date.now()}`);
  const alerts = await import(`../lib/alerting.js?alertclear=${Date.now()}`);
  obs.resetObservability();
  const result = alerts.evaluateAlerts({ snapshot: obs.getMetricsSnapshot() });
  assert.equal(result.ok, true);
  assert.equal(result.summary.triggered, 0);
  assert.equal(JSON.stringify(result).includes('sk_test_secret'), false);
  assert.equal(result.onCall.configured, true);
  delete process.env.AGENT_IC_ONCALL_CHANNEL;
  delete process.env.AGENT_IC_ONCALL_TARGET;
});

test('alert evaluator triggers threshold rules from counters and events', async () => {
  const obs = await import(`../lib/observability.js?alerttrigger=${Date.now()}`);
  const alerts = await import(`../lib/alerting.js?alerttrigger=${Date.now()}`);
  obs.resetObservability();
  obs.incrementCounter('agent_ic_audit_chain_failures_total', { tenantId: 'tenant_a' });
  obs.recordEvent({ level: 'error', kind: 'error', action: 'provider_failed', detail: 'bad provider' });
  const result = alerts.evaluateAlerts({ snapshot: obs.getMetricsSnapshot() });
  assert.equal(result.ok, false);
  assert.equal(result.triggered.some((alert) => alert.id === 'audit-chain-failure' && alert.severity === 'critical'), true);
  assert.equal(result.triggered.some((alert) => alert.id === 'recent-error-events'), true);
  assert.ok(result.triggered.every((alert) => alert.runbook.startsWith('docs/runbooks/')));
});

test('alerts API is guarded and returns alert summary', async () => {
  const obs = await import(`../lib/observability.js?alertroute=${Date.now()}`);
  obs.resetObservability();
  obs.incrementCounter('agent_ic_stripe_webhook_rejected_total', { reason: 'signature' });
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { GET } = await import(`../app/api/alerts/route.js?case=${Date.now()}`);

  const unauth = await GET(new Request('https://agent-ic.example.com/api/alerts'));
  assert.equal(unauth.status, 401);

  const authed = await GET(new Request('https://agent-ic.example.com/api/alerts', {
    headers: { authorization: authHeader({ sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }) },
  }));
  assert.equal(authed.status, 200);
  const body = await authed.json();
  assert.equal(body.ok, true);
  assert.equal(body.alerts.ok, false);
  assert.equal(body.alerts.triggered.some((alert) => alert.id === 'stripe-webhook-rejected'), true);
});
