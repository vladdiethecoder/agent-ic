import { createHmac } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

function stripeSig(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

test('stripe webhook verifies signature records and replays payment event', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-stripe-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-stripe-audit-${Date.now()}-${Math.random()}.jsonl`;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_123';
  const { POST } = await import(`../app/api/stripe-webhook/route.js?case=${Date.now()}`);
  const payload = JSON.stringify({
    id: 'evt_test_1',
    type: 'checkout.session.completed',
    livemode: false,
    created: 123,
    data: {
      object: {
        object: 'checkout.session',
        id: 'cs_test_1234567890abcdefghijklmnopqrstuvwxyz',
        payment_status: 'paid',
        status: 'complete',
        client_reference_id: 'safety-ops-complaint-triage',
        amount_total: 10000,
        currency: 'usd',
        metadata: { tenant_id: 'tenant_a', case_id: 'safety-ops-complaint-triage' },
      },
    },
  });
  const request = () => new Request('https://agent-ic.example.com/api/stripe-webhook', {
    method: 'POST',
    headers: { 'stripe-signature': stripeSig(payload, process.env.STRIPE_WEBHOOK_SECRET) },
    body: payload,
  });
  const first = await POST(request());
  const second = await POST(request());
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const firstBody = await first.json();
  const secondBody = await second.json();
  assert.equal(firstBody.replay, false);
  assert.equal(secondBody.replay, true);
  assert.equal(firstBody.event.checkoutSession.paymentStatus, 'paid');
  assert.equal(JSON.stringify(firstBody).includes('cs_test_1234567890'), false);
});

test('stripe webhook rejects invalid signatures', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_123';
  const { POST } = await import(`../app/api/stripe-webhook/route.js?invalid=${Date.now()}`);
  const response = await POST(new Request('https://agent-ic.example.com/api/stripe-webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 't=123,v1=bad' },
    body: JSON.stringify({ id: 'evt_bad' }),
  }));
  assert.equal(response.status, 400);
});

test('payments API returns tenant-scoped payment events', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-payments-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const payments = await import(`../lib/paymentEvents.js?payments=${Date.now()}`);
  const { GET } = await import(`../app/api/payments/route.js?payments=${Date.now()}`);
  payments.recordPaymentEvent({ tenantId: 'tenant_a', event: { id: 'evt_pay_1', type: 'checkout.session.completed', data: { object: { object: 'checkout.session', id: 'cs_test_abc', payment_status: 'paid' } } } });

  const response = await GET(new Request('https://agent-ic.example.com/api/payments?eventId=evt_pay_1', {
    headers: { authorization: authHeader({ sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }) },
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.event.eventId, 'evt_pay_1');

  const other = await GET(new Request('https://agent-ic.example.com/api/payments?eventId=evt_pay_1', {
    headers: { authorization: authHeader({ sub: 'auditor_2', tenantId: 'tenant_b', role: 'auditor' }) },
  }));
  assert.equal(other.status, 404);
});

test('payments API reconciles Stripe Checkout Session state against retrieve response', async () => {
  const originalFetch = global.fetch;
  const original = snapshotEnv(['AGENT_IC_STORE_ROOT', 'AGENT_IC_DEPLOYMENT_MODE', 'AGENT_IC_AUTH_HS256_SECRET', 'AGENT_IC_AUTH_ISSUER', 'AGENT_IC_AUTH_AUDIENCE', 'STRIPE_SECRET_KEY']);
  try {
    process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-payment-reconcile-${Date.now()}-${Math.random()}`;
    process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
    process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
    process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
    process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
    process.env.STRIPE_SECRET_KEY = 'sk_test_reconcile_1234567890';
    const payments = await import(`../lib/paymentEvents.js?reconcile=${Date.now()}`);
    const { POST, GET } = await import(`../app/api/payments/route.js?reconcile=${Date.now()}`);
    const sessionId = 'cs_test_reconcile_1234567890abcdefghijklmnopqrstuvwxyz';
    payments.recordPaymentEvent({ tenantId: 'tenant_a', event: { id: 'evt_reconcile_1', type: 'checkout.session.completed', data: { object: { object: 'checkout.session', id: sessionId, payment_status: 'paid', status: 'complete', amount_total: 10000, currency: 'usd', metadata: { tenant_id: 'tenant_a' } } } } });
    global.fetch = async (url, options) => {
      assert.equal(String(url).endsWith(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`), true);
      assert.equal(options.headers.authorization, `Bearer ${process.env.STRIPE_SECRET_KEY}`);
      return Response.json({ id: sessionId, object: 'checkout.session', payment_status: 'paid', status: 'complete', amount_total: 10000, currency: 'usd', metadata: { tenant_id: 'tenant_a' } });
    };
    const response = await POST(new Request('https://agent-ic.example.com/api/payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader({ sub: 'owner_1', tenantId: 'tenant_a', role: 'owner' }) },
      body: JSON.stringify({ action: 'reconcile', tenantId: 'tenant_a', eventId: 'evt_reconcile_1', sessionId }),
    }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.reconciliation.ok, true);
    assert.equal(body.reconciliation.matchesWebhook.paymentStatus, true);
    assert.equal(JSON.stringify(body).includes(sessionId), false);
    assert.equal(JSON.stringify(body).includes('sk_test_reconcile'), false);

    const get = await GET(new Request('https://agent-ic.example.com/api/payments?eventId=evt_reconcile_1', {
      headers: { authorization: authHeader({ sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }) },
    }));
    assert.equal((await get.json()).event.reconciliation.ok, true);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(original);
  }
});

test('payment reconciliation records mismatch and sanitizes provider failures', async () => {
  const originalFetch = global.fetch;
  const original = snapshotEnv(['AGENT_IC_STORE_ROOT', 'AGENT_IC_DEPLOYMENT_MODE', 'AGENT_IC_AUTH_HS256_SECRET', 'AGENT_IC_AUTH_ISSUER', 'AGENT_IC_AUTH_AUDIENCE', 'STRIPE_SECRET_KEY']);
  try {
    process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-payment-mismatch-${Date.now()}-${Math.random()}`;
    process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
    process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
    process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
    process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
    process.env.STRIPE_SECRET_KEY = 'sk_test_failure_1234567890';
    const payments = await import(`../lib/paymentEvents.js?mismatch=${Date.now()}`);
    const { POST } = await import(`../app/api/payments/route.js?mismatch=${Date.now()}`);
    const sessionId = 'cs_test_mismatch_1234567890abcdefghijklmnopqrstuvwxyz';
    payments.recordPaymentEvent({ tenantId: 'tenant_a', event: { id: 'evt_mismatch_1', type: 'checkout.session.completed', data: { object: { object: 'checkout.session', id: sessionId, payment_status: 'paid', status: 'complete', amount_total: 10000, currency: 'usd' } } } });
    global.fetch = async () => Response.json({ id: sessionId, payment_status: 'unpaid', status: 'open', amount_total: 10000, currency: 'usd' });
    const mismatch = await POST(new Request('https://agent-ic.example.com/api/payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader({ sub: 'owner_1', tenantId: 'tenant_a', role: 'owner' }) },
      body: JSON.stringify({ action: 'reconcile', tenantId: 'tenant_a', eventId: 'evt_mismatch_1', sessionId }),
    }));
    assert.equal(mismatch.status, 200);
    assert.equal((await mismatch.json()).reconciliation.ok, false);

    global.fetch = async () => Response.json({ error: { message: 'bad key sk_test_failure_1234567890' } }, { status: 401 });
    const failed = await POST(new Request('https://agent-ic.example.com/api/payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader({ sub: 'owner_1', tenantId: 'tenant_a', role: 'owner' }) },
      body: JSON.stringify({ action: 'reconcile', tenantId: 'tenant_a', eventId: 'evt_mismatch_1', sessionId }),
    }));
    assert.equal(failed.status, 502);
    const failedBody = await failed.json();
    assert.equal(failedBody.code, 'stripe_reconciliation_failed');
    assert.equal(JSON.stringify(failedBody).includes('sk_test_failure'), false);
  } finally {
    global.fetch = originalFetch;
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
