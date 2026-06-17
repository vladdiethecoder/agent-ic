import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { POST as webhookPost } from '../app/api/stripe-webhook/route.js';
import { readAudit, resetAudit } from '../lib/auditStore.js';

function makeSignature(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function request(payload, signature) {
  return new Request('http://localhost:3000/api/stripe-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature || '',
    },
    body: payload,
  });
}

test('Stripe webhook and status routes', async (t) => {
  const oldWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const oldStripeKey = process.env.STRIPE_SECRET_KEY;
  const oldFetch = global.fetch;

  t.beforeEach(() => {
    resetAudit();
  });

  t.after(() => {
    if (oldWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = oldWebhookSecret;
    if (oldStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = oldStripeKey;
    global.fetch = oldFetch;
  });

  await t.test('returns 200 and warns when secret is unset', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1' } } });
    const response = await webhookPost(request(payload));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.match(body.warning, /not configured/i);
  });

  await t.test('verifies signature and appends audit row on checkout.session.completed', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    const payload = JSON.stringify({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_2', client_reference_id: 'atlas-freight-rma-copilot' } },
    });
    const response = await webhookPost(request(payload, makeSignature(payload, 'whsec_test_secret')));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.type, 'checkout.session.completed');
    assert.equal(body.sessionId, 'cs_test_2');

    const audit = readAudit();
    const confirmed = audit.find((a) => a.action === 'payment_confirmed');
    assert.ok(confirmed, 'payment_confirmed audit row must exist');
    assert.ok(confirmed.stripeSessionId, 'stripeSessionId must be present');
    assert.equal(confirmed.kind, 'stripe');
  });

  await t.test('appends audit row on payment_intent.succeeded', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    const payload = JSON.stringify({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_3', metadata: { proposal_id: 'atlas-freight-rma-copilot' } } },
    });
    const response = await webhookPost(request(payload, makeSignature(payload, 'whsec_test_secret')));
    assert.equal(response.status, 200);
    const audit = readAudit();
    assert.ok(audit.some((a) => a.action === 'payment_confirmed' && a.stripeSessionId === 'pi_test_3'));
  });

  await t.test('rejects invalid signature', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_4' } } });
    const response = await webhookPost(request(payload, 't=123,v1=deadbeef'));
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error, /signature/i);
    assert.ok(!readAudit().some((a) => a.stripeSessionId === 'cs_test_4'));
  });

  await t.test('stripe-session-status returns paid=false for unpaid session', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_redacted';
    global.fetch = async (url) => {
      assert.match(url, /api\.stripe\.com\/v1\/checkout\/sessions\/cs_test_status/);
      return Response.json({ id: 'cs_test_status', status: 'open', payment_status: 'unpaid' });
    };

    const { GET: statusGet } = await import('../app/api/stripe-session-status/route.js');
    const req = new Request('http://localhost:3000/api/stripe-session-status?sessionId=cs_test_status&timeoutMs=100');
    const response = await statusGet(req);
    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.paid, false);
    assert.equal(body.paymentStatus, 'unpaid');
  });

  await t.test('stripe-session-status returns paid=true when payment_status is paid', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_redacted';
    global.fetch = async (url) => {
      assert.match(url, /api\.stripe\.com\/v1\/checkout\/sessions\/cs_test_paid/);
      return Response.json({ id: 'cs_test_paid', status: 'complete', payment_status: 'paid' });
    };

    const { GET: statusGet } = await import('../app/api/stripe-session-status/route.js');
    const req = new Request('http://localhost:3000/api/stripe-session-status?sessionId=cs_test_paid');
    const response = await statusGet(req);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.paid, true);
    assert.equal(body.paymentStatus, 'paid');
  });
});
