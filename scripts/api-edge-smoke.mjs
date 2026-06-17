const base = process.env.AGENT_IC_BASE_URL || 'http://localhost:3000';

async function main() {
  await expectStatus('/api/evaluate', '{', 400, 'malformed_json');
  await expectStatus('/api/evaluate', { proposalId: 'missing-proposal' }, 404, 'proposal_not_found');
  await expectStatus('/api/audit', '{', 400, 'malformed_json');
  await expectStatus('/api/audit', { reset: true }, 403, 'reset requires');

  const killStripe = await post('/api/stripe-session', {
    proposalId: 'atlas-freight-rma-copilot',
    evaluation: { decision: 'KILL', recommendedBudget: 185000, autonomousSpendCap: 35000 },
  });
  assert(killStripe.status === 409, 'KILL Stripe request returns 409');

  const stripe = await json('/api/stripe-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      proposalId: 'atlas-freight-rma-copilot',
      evaluation: { decision: 'CONTINUE', recommendedBudget: 185000, autonomousSpendCap: 35000 },
    }),
  });
  assert(stripe.mode === 'demo', 'Stripe is in safe demo mode by default');
  assert(stripe.checkout.amount_total === 3500000, 'Stripe amount_total is cents');
  assert(stripe.checkout.metadata.autonomous_spend_cap_dollars === '35000', 'Stripe cap metadata is dollars');

  console.log(JSON.stringify({ ok: true, checked: ['malformed-json', 'unknown-proposal', 'audit-reset-gate', 'kill-spend-block', 'stripe-cents'] }, null, 2));
}

async function expectStatus(path, body, status, errorPattern) {
  const response = await post(path, body);
  assert(response.status === status, `${path} expected ${status}, got ${response.status}`);
  const payload = await response.json();
  assert(new RegExp(errorPattern, 'i').test(`${payload.error || ''} ${payload.code || ''}`), `${path} error should match ${errorPattern}`);
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
