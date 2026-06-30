import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('SLO evaluator reports healthy state with no traffic', async () => {
  const obs = await import(`../lib/observability.js?slohealthy=${Date.now()}`);
  const slo = await import(`../lib/slo.js?slohealthy=${Date.now()}`);
  obs.resetObservability();
  const result = slo.evaluateSLOs({ snapshot: obs.getMetricsSnapshot() });
  assert.equal(result.ok, true);
  assert.equal(result.summary.breached, 0);
  assert.ok(result.slos.every((item) => item.errorBudgetRemaining >= 0));
});

test('SLO evaluator reports breached and at-risk states from metrics', async () => {
  const obs = await import(`../lib/observability.js?slobreach=${Date.now()}`);
  const slo = await import(`../lib/slo.js?slobreach=${Date.now()}`);
  obs.resetObservability();
  obs.incrementCounter('agent_ic_trials_completed_total', {}, 90);
  obs.incrementCounter('agent_ic_trials_failed_total', {}, 10);
  obs.incrementCounter('agent_ic_stripe_webhooks_total', {}, 995);
  obs.incrementCounter('agent_ic_stripe_webhook_rejected_total', {}, 5);
  const result = slo.evaluateSLOs({ snapshot: obs.getMetricsSnapshot() });
  const trial = result.slos.find((item) => item.id === 'trial-success-ratio');
  const stripe = result.slos.find((item) => item.id === 'stripe-webhook-acceptance');
  assert.equal(result.ok, false);
  assert.equal(trial.status, 'breached');
  assert.equal(stripe.status, 'at_risk');
});

test('SLO API is guarded and returns summary', async () => {
  const obs = await import(`../lib/observability.js?sloroute=${Date.now()}`);
  obs.resetObservability();
  obs.incrementCounter('agent_ic_trials_completed_total', {}, 100);
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { GET } = await import(`../app/api/slo/route.js?case=${Date.now()}`);

  const unauth = await GET(new Request('https://agent-ic.example.com/api/slo'));
  assert.equal(unauth.status, 401);

  const authed = await GET(new Request('https://agent-ic.example.com/api/slo', {
    headers: { authorization: authHeader({ sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }) },
  }));
  assert.equal(authed.status, 200);
  const body = await authed.json();
  assert.equal(body.ok, true);
  assert.equal(body.slo.summary.total > 0, true);
});
