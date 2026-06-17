const base = process.env.AGENT_IC_BASE_URL || 'http://localhost:3000';

async function main() {
  const health = await json(`${base}/api/health`);
  assert(health.ok, 'health ok');
  assert(health.proposalCount >= 3, 'seeded proposals');

  const evaluation = await json(`${base}/api/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposalId: 'atlas-freight-rma-copilot' }),
  });
  assert(evaluation.evaluation?.decision, 'evaluation decision');
  assert(evaluation.evaluation?.recommendedBudget > 0, 'budget positive');
  assert(Array.isArray(evaluation.evaluation?.budget), 'budget lines');
  assert(Array.isArray(evaluation.evaluation?.evidenceTimeline), 'evidence timeline');

  const stripe = await json(`${base}/api/stripe-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposalId: 'atlas-freight-rma-copilot', evaluation: evaluation.evaluation }),
  });
  assert(stripe.checkout?.id, 'stripe checkout id');
  assert(stripe.checkout?.metadata?.proposal_id === 'atlas-freight-rma-copilot', 'stripe metadata proposal id');
  assert(stripe.checkout?.metadata?.autonomous_spend_cap_dollars, 'stripe cap dollars metadata');

  const audit = await json(`${base}/api/audit`);
  assert(Array.isArray(audit.audit), 'audit array');
  console.log(JSON.stringify({ ok: true, health, decision: evaluation.evaluation.decision, stripeMode: stripe.mode, auditRows: audit.audit.length }, null, 2));
}

async function json(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${url} failed ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Smoke assertion failed: ${message}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
