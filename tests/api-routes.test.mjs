import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as evaluatePost } from '../app/api/evaluate/route.js';
import { POST as stripePost } from '../app/api/stripe-session/route.js';
import { POST as auditPost } from '../app/api/audit/route.js';

const jsonHeaders = { 'content-type': 'application/json' };

function request(path, body, init = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: jsonHeaders,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });
}

async function payload(response) {
  return response.json();
}

test('evaluate route rejects malformed JSON with structured 400', async () => {
  const response = await evaluatePost(request('/api/evaluate', '{'));
  assert.equal(response.status, 400);
  assert.match((await payload(response)).error, /malformed json/i);
});

test('evaluate route rejects unknown proposal ids instead of silently falling back', async () => {
  const response = await evaluatePost(request('/api/evaluate', { proposalId: 'missing-proposal' }));
  assert.equal(response.status, 404);
  assert.match((await payload(response)).error, /proposal/i);
});

test('evaluate route returns capital-experiment fields', async () => {
  const response = await evaluatePost(request('/api/evaluate', { proposalId: 'atlas-freight-rma-copilot' }));
  assert.equal(response.status, 200);
  const body = await payload(response);
  assert.ok(body.spendEnvelope, 'spendEnvelope must be returned');
  assert.equal(body.spendEnvelope.cap, 100);
  assert.ok(body.blockedAction, 'blockedAction must be returned');
  assert.equal(body.blockedAction.kind, 'blocked');
  assert.ok(body.evidenceReceipts, 'evidenceReceipts must be returned');
  assert.ok(body.hermesPlaybook, 'hermesPlaybook must be returned');
  assert.ok(body.providerReceipts, 'providerReceipts must be returned');
});

test('evaluate route falls back when Nemotron returns malformed content', async (t) => {
  const oldKey = process.env.NEMOTRON_API_KEY;
  const oldDemo = process.env.AGENT_IC_DEMO_MODE;
  const oldFetch = global.fetch;
  process.env.NEMOTRON_API_KEY = 'test-redacted-key';
  process.env.AGENT_IC_DEMO_MODE = 'false';
  global.fetch = async () => Response.json({ choices: [{ message: { content: 'not-json' } }] });
  t.after(() => {
    if (oldKey === undefined) delete process.env.NEMOTRON_API_KEY;
    else process.env.NEMOTRON_API_KEY = oldKey;
    if (oldDemo === undefined) delete process.env.AGENT_IC_DEMO_MODE;
    else process.env.AGENT_IC_DEMO_MODE = oldDemo;
    global.fetch = oldFetch;
  });

  const response = await evaluatePost(request('/api/evaluate', { proposalId: 'atlas-freight-rma-copilot' }));
  assert.equal(response.status, 200);
  const body = await payload(response);
  assert.match(body.evaluation.evaluator, /fallback/i);
  assert.ok(!('rawModelSummary' in body.evaluation));
});

test('stripe route blocks KILL decisions before any spend path', async () => {
  let called = false;
  const oldFetch = global.fetch;
  global.fetch = async () => {
    called = true;
    return Response.json({});
  };
  try {
    const response = await stripePost(
      request('/api/stripe-session', {
        proposalId: 'atlas-freight-rma-copilot',
        evaluation: { decision: 'KILL', recommendedBudget: 185000, autonomousSpendCap: 35000 },
      })
    );
    assert.equal(response.status, 409);
    assert.equal(called, false, 'KILL decision must not call live Stripe');
  } finally {
    global.fetch = oldFetch;
  }
});

test('stripe route encodes Stripe amounts in cents and metadata caps in dollars', async () => {
  const response = await stripePost(
    request('/api/stripe-session', {
      proposalId: 'atlas-freight-rma-copilot',
      evaluation: { decision: 'CONTINUE', recommendedBudget: 185000, autonomousSpendCap: 35000 },
    })
  );
  assert.equal(response.status, 200);
  const body = await payload(response);
  assert.equal(body.mode, 'demo');
  assert.equal(body.checkout.amount_total, 3500000);
  assert.equal(body.checkout.metadata.autonomous_spend_cap_dollars, '35000');
});

test('audit route rejects reset without explicit confirmation', async () => {
  const response = await auditPost(request('/api/audit', { reset: true }));
  assert.equal(response.status, 403);
});

test('audit route rejects malformed JSON with structured 400', async () => {
  const response = await auditPost(request('/api/audit', '{'));
  assert.equal(response.status, 400);
  assert.match((await payload(response)).error, /malformed json/i);
});

test('live Stripe dry-run sends cents, metadata, auth, and idempotency key', async (t) => {
  const oldKey = process.env.STRIPE_SECRET_KEY;
  const oldDemo = process.env.AGENT_IC_DEMO_MODE;
  const oldFetch = global.fetch;
  let captured;
  process.env.STRIPE_SECRET_KEY = 'sk_test_redacted';
  process.env.AGENT_IC_DEMO_MODE = 'false';
  global.fetch = async (url, options) => {
    captured = { url, options };
    return Response.json({ id: 'cs_test_live_dry_run', url: 'https://checkout.stripe.test/session', status: 'open' });
  };
  t.after(() => {
    if (oldKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = oldKey;
    if (oldDemo === undefined) delete process.env.AGENT_IC_DEMO_MODE;
    else process.env.AGENT_IC_DEMO_MODE = oldDemo;
    global.fetch = oldFetch;
  });

  const response = await stripePost(
    request('/api/stripe-session', {
      proposalId: 'atlas-freight-rma-copilot',
      idempotencyKey: 'agent-ic-test-key',
      evaluation: { decision: 'CONTINUE', recommendedBudget: 185000, autonomousSpendCap: 35000 },
    })
  );
  assert.equal(response.status, 200);
  const body = await payload(response);
  assert.equal(body.mode, 'live');
  assert.equal(captured.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(captured.options.headers.authorization, 'Bearer sk_test_redacted');
  assert.equal(captured.options.headers['idempotency-key'], 'agent-ic-test-key');
  const params = captured.options.body;
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '3500000');
  assert.equal(params.get('metadata[autonomous_spend_cap_dollars]'), '35000');
});

test('live Stripe non-JSON provider failure is sanitized 502', async (t) => {
  const oldKey = process.env.STRIPE_SECRET_KEY;
  const oldDemo = process.env.AGENT_IC_DEMO_MODE;
  const oldFetch = global.fetch;
  process.env.STRIPE_SECRET_KEY = 'sk_test_redacted';
  process.env.AGENT_IC_DEMO_MODE = 'false';
  global.fetch = async () => new Response('not json sk_test_should_not_leak', { status: 500 });
  t.after(() => {
    if (oldKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = oldKey;
    if (oldDemo === undefined) delete process.env.AGENT_IC_DEMO_MODE;
    else process.env.AGENT_IC_DEMO_MODE = oldDemo;
    global.fetch = oldFetch;
  });

  const response = await stripePost(
    request('/api/stripe-session', {
      proposalId: 'atlas-freight-rma-copilot',
      evaluation: { decision: 'CONTINUE', recommendedBudget: 185000, autonomousSpendCap: 35000 },
    })
  );
  assert.equal(response.status, 502);
  const body = await payload(response);
  assert.match(body.error.message, /non-json/i);
  assert.ok(!JSON.stringify(body).includes('sk_test_should_not_leak'));
});
