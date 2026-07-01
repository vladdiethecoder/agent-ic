import { readFileSync } from 'node:fs';

const base = process.env.AGENT_IC_BASE_URL || 'http://localhost:3000';
const caseId = process.env.AGENT_IC_SMOKE_CASE_ID || 'safety-ops-complaint-triage';

async function main() {
  const openapi = await json('/api/openapi');
  assert(openapi.openapi === '3.1.0', 'openapi endpoint ok');
  assert(openapi.paths?.['/api/enterprise-trial'], 'openapi includes enterprise-trial path');
  assert(openapi['x-agent-ic-production-ready'] === false, 'openapi does not claim production ready');

  const health = await json('/api/health');
  assert(health.status === 'ok' || health.ok === true, 'health ok');
  assert(health.truthModel?.includes('per-run receipts'), 'health truth model avoids provider success overclaim');
  assert(health.providerStates?.stripe?.mode !== 'live', 'health does not claim Stripe live success');
  assert(!JSON.stringify(health).includes('sk_test_'), 'health does not expose Stripe keys');
  assert(!JSON.stringify(health).includes('nvapi-'), 'health does not expose NVIDIA keys');

  const healthResponse = await raw('/api/health');
  assert(healthResponse.headers.get('x-agent-ic-api-version') === '2026-06-23.foundation-v1', 'api version header');
  assert(healthResponse.headers.get('x-content-type-options') === 'nosniff', 'security header x-content-type-options');
  assert(healthResponse.headers.get('x-frame-options') === 'DENY', 'security header x-frame-options');

  const unsupportedVersion = await raw('/api/health', { headers: { 'x-agent-ic-api-version': '1999-01-01' } });
  assert(unsupportedVersion.status === 400, 'unsupported api version rejected');

  const ready = await json('/api/ready');
  assert(ready.status === 'ready', 'readiness endpoint ready in current environment');
  assert(ready.productionReady === false, 'development readiness does not claim production readiness');
  assert(/not a production-readiness claim/i.test(ready.truthModel || ''), 'readiness truth model avoids production overclaim');
  assert(Array.isArray(ready.checks), 'readiness exposes checks');
  assert(!JSON.stringify(ready).includes('sk_test_'), 'readiness masks Stripe keys');
  assert(!JSON.stringify(ready).includes('nvapi-'), 'readiness masks NVIDIA keys');

  const options = await raw('/api/enterprise-trial', { method: 'OPTIONS', headers: { origin: base } });
  assert(options.status === 204, 'CORS preflight returns 204');
  assert(options.headers.get('access-control-allow-methods')?.includes('POST'), 'CORS allows POST');

  await expectStatus('/api/enterprise-trial', '{', 400, 'malformed_json|invalid');
  await expectStatus('/api/enterprise-trial', { caseId: 'missing-case', missionStatement: 'test' }, 404, 'case_not_found');
  await expectStatus('/api/enterprise-trial', {}, 400, 'Either missionStatement or caseId is required|invalid_request');

  await expectStatus('/api/live-trace', { reset: true }, 403, 'reset requires');
  const reset = await json('/api/live-trace', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reset: true, confirmReset: 'AGENT_IC_TRACE_RESET' }),
  });
  assert(Array.isArray(reset.trace) && reset.trace.length === 0, 'live trace reset acknowledged');

  await expectStatus('/api/renewals', '{', 400, 'malformed_json|invalid');
  await expectStatus('/api/renewals', { action: 'invalid' }, 400, 'invalid_action');

  const catalogue = await json('/api/enterprise-trial');
  assert(catalogue.cases.some((c) => c.id === caseId), 'case catalogue includes smoke case');

  const member = await json('/api/memberships', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'upsert', tenantId: 'local-tenant', userId: 'operator-smoke', role: 'operator', displayName: 'Smoke Operator' }),
  });
  assert(member.membership?.status === 'active', 'membership upserted');
  const members = await json('/api/memberships');
  assert(members.memberships?.some((m) => m.userId === 'operator-smoke'), 'membership listed');

  const policyCreate = await json('/api/policies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', tenantId: 'local-tenant', caseId }),
  });
  assert(policyCreate.policy?.status === 'draft', 'policy version created');
  const policyActivate = await json('/api/policies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'activate', tenantId: 'local-tenant', policyId: policyCreate.policy.id }),
  });
  assert(policyActivate.policy?.status === 'active', 'policy version activated');
  const policySim = await json('/api/policies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'evaluate', tenantId: 'local-tenant', policyId: policyCreate.policy.id, attemptedAction: { name: 'CARFAX vehicle-history report', attemptedAmount: 150 } }),
  });
  assert(policySim.evaluation?.blocked === true, 'policy evaluation blocks over-cap action');

  const approvalRequest = await json('/api/approvals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'request', tenantId: 'local-tenant', caseId, spendCap: 100, reason: 'smoke approval' }),
  });
  assert(approvalRequest.approval?.status === 'pending', 'approval request created');
  const approvalDecision = await json('/api/approvals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'approve', tenantId: 'local-tenant', approvalId: approvalRequest.approval.id, reason: 'smoke approved' }),
  });
  assert(approvalDecision.approval?.status === 'approved', 'approval request approved');


  const stripePayload = JSON.stringify({
    id: `evt_smoke_${Date.now()}`,
    type: 'checkout.session.completed',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { object: 'checkout.session', id: 'cs_test_smoke_1234567890', payment_status: 'paid', status: 'complete', amount_total: 10000, currency: 'usd', metadata: { tenant_id: 'local-tenant', case_id: caseId } } },
  });
  const webhookSecret = loadLocalEnv('STRIPE_WEBHOOK_SECRET') || process.env.STRIPE_WEBHOOK_SECRET;
  let webhookChecked = false;
  if (webhookSecret) {
    const stripeSig = await signStripePayload(stripePayload, webhookSecret);
    const webhook = await json('/api/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': stripeSig }, body: stripePayload });
    assert(webhook.ok === true && webhook.event?.checkoutSession?.paymentStatus === 'paid', 'stripe webhook recorded paid session');
    const payment = await json(`/api/payments?eventId=${encodeURIComponent(webhook.event.eventId)}`);
    assert(payment.event?.eventId === webhook.event.eventId, 'payment event retrievable');
    webhookChecked = true;
  }

  const exportBundle = await json('/api/export');
  assert(exportBundle.bundle?.summary, 'export bundle summary');
  assert(/^[a-f0-9]{64}$/.test(exportBundle.bundle?.sha256 || ''), 'export bundle hash');

  const retention = await json('/api/retention');
  assert(retention.policy?.purgeMode === 'preview_only', 'retention policy is preview-only');
  assert(Array.isArray(retention.evaluation?.resources), 'retention evaluation resources array');

  const incidentsCreated = await json('/api/incidents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', tenantId: 'local-tenant', title: 'API smoke alert drill', severity: 'info', sourceAlertId: 'smoke-drill', runbook: 'docs/runbooks/slo-review.md', drill: true, evidence: { source: 'api-smoke' } }),
  });
  assert(incidentsCreated.incident?.status === 'drill_completed', 'incident drill recorded');
  const incidents = await json('/api/incidents');
  assert(incidents.summary?.drills >= 1, 'incident drill listed');

  const alerts = await json('/api/alerts');
  assert(alerts.ok === true, 'alerts endpoint ok');
  assert(Number.isInteger(alerts.alerts?.summary?.triggered), 'alerts summary includes triggered count');
  assert(Array.isArray(alerts.alerts?.rules), 'alerts rules array');

  const slo = await json('/api/slo');
  assert(slo.ok === true, 'slo endpoint ok');
  assert(Number.isInteger(slo.slo?.summary?.breached), 'slo summary includes breached count');
  assert(Array.isArray(slo.slo?.slos), 'slo list array');

  const metrics = await json('/api/metrics');
  assert(metrics.ok === true, 'metrics endpoint ok');
  assert(Array.isArray(metrics.metrics?.counters), 'metrics counters array');
  const prometheus = await raw('/api/metrics', { headers: { accept: 'text/plain' } });
  assert(prometheus.ok, 'metrics prometheus response ok');
  assert((await prometheus.text()).includes('agent_ic'), 'metrics prometheus text includes agent_ic metrics');

  const proof = await json('/api/proof-report');
  assert(proof.ok === true, 'proof report ok');
  assert(proof.proofSurfaces.primaryRoute === '/trial', 'proof report primary route');
  assert(proof.proofSurfaces.spend.includes('Stripe Checkout receipt'), 'honest Stripe non-production wording');
  assert(/^[a-f0-9]{64}$/.test(proof.workloadEvidence.sha256), 'proof report has SHA-256 workload hash');
  assert(proof.auditChain?.ok === true, 'proof report audit chain verifies');
  assert(!JSON.stringify(proof).includes('sk_test_'), 'proof report masks Stripe keys');
  assert(!JSON.stringify(proof).includes('nvapi-'), 'proof report masks NVIDIA keys');

  console.log(JSON.stringify({
    ok: true,
    checked: [
      'openapi-contract',
      'api-version-header',
      'api-version-reject',
      'health-secret-redaction',
      'enterprise-trial-json-errors',
      'unknown-case-404',
      'live-trace-reset-gate',
      'renewal-action-validation',
      'proof-report-contract',
      'audit-chain-proof',
      'approval-request-approve',
      'membership-upsert-list',
      'policy-create-activate-evaluate',
      webhookChecked ? 'stripe-webhook-payment-record' : 'stripe-webhook-skipped-no-secret',
      'evidence-export',
      'retention-preview',      'incident-review-drill',      'alerts-endpoint',      'slo-endpoint',      'metrics-endpoint',      'readiness-endpoint',
      'security-headers',
      'cors-preflight',
    ],
  }, null, 2));
}

async function expectStatus(path, body, status, errorPattern) {
  const response = await post(path, body);
  assert(response.status === status, `${path} expected ${status}, got ${response.status}`);
  const payload = await response.json();
  assert(new RegExp(errorPattern, 'i').test(`${payload.error || ''} ${payload.code || ''}`), `${path} error should match ${errorPattern}`);
}

async function raw(path, options = {}) {
  return fetch(`${base}${path}`, options);
}

async function post(path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function json(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${path} failed ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

function assert(condition, message) {
  if (!condition) throw new Error(`API edge smoke failed: ${message}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function signStripePayload(payload, secret) {
  const { createHmac } = await import('node:crypto');
  const timestamp = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

function loadLocalEnv(key) {
  try {
    const text = readFileSync('.env.local', 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const name = trimmed.slice(0, idx).trim();
      if (name !== key) continue;
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      return value;
    }
  } catch {}
  return '';
}
