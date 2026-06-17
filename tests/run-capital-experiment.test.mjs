import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as runPost } from '../app/api/run-capital-experiment/route.js';

const jsonHeaders = { 'content-type': 'application/json' };

function request(body) {
  return new Request('http://localhost:3000/api/run-capital-experiment', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
}

async function payload(response) {
  return response.json();
}

test('run-capital-experiment returns CONTINUE with default Atlas inputs', async () => {
  const response = await runPost(request({ proposalId: 'atlas-freight-rma-copilot' }));
  assert.equal(response.status, 200);
  const body = await payload(response);
  assert.equal(body.decision.verdict, 'CONTINUE');
  assert.equal(body.envelope.cap, 100);
  assert.equal(body.envelope.spent, 35);
  assert.equal(body.envelope.remaining, 65);
  assert.equal(body.evidence.casesProcessed, 100);
  assert.equal(body.evidence.qaAgreement, 91);
  assert.equal(body.evidence.criticalIncidents, 0);
  assert.equal(body.blocked.policyBreach, 'tool_scope_violation');
  assert.equal(body.stripe.mode, 'demo');
  assert.ok(body.stripe.sessionId.startsWith('cs_test_agent_ic_'));
  assert.ok(body.hermesPlaybook);
  assert.ok(body.boardPacket);
  assert.ok(Array.isArray(body.auditRows));
  assert.ok(body.auditRows.some((a) => a.action === 'envelope_created'));
  assert.ok(body.auditRows.some((a) => a.action === 'created Checkout Session'));
  assert.ok(body.auditRows.some((a) => a.action === 'DENIED'));
  assert.ok(body.auditRows.some((a) => a.action === 'evidence_imported'));
  assert.ok(body.auditRows.some((a) => a.action === 'decision_issued'));

  // v7 fields
  assert.ok(Array.isArray(body.stages));
  assert.deepEqual(
    body.stages.map((s) => s.id),
    ['mission', 'sandbox', 'envelope', 'stripe', 'stripeSkill', 'blocked', 'evidence', 'skills', 'decision']
  );
  assert.equal(body.sandbox?.status, 'ready');
  assert.equal(body.sandbox?.blockedCall?.status, 403);
  assert.equal(body.stripeSkill?.name, 'stripe-link-cli');
  assert.equal(body.stripeSkill?.status, 'approved');
  assert.ok(Array.isArray(body.skills));
  assert.equal(body.skills.length, 2);
  assert.ok(body.skills.some((s) => s.name === 'parts-order-cli'));
  assert.ok(body.skills.some((s) => s.name === 'slack-status-cli'));
  assert.ok(body.nemotron?.badge);
  assert.ok(['live', 'fallback'].includes(body.nemotron?.state));
});

test('run-capital-experiment flips to KILL when QA agreement drops below threshold', async () => {
  const response = await runPost(request({ proposalId: 'atlas-freight-rma-copilot', qaAgreement: 82 }));
  assert.equal(response.status, 200);
  const body = await payload(response);
  assert.equal(body.evidence.qaAgreement, 82);
  assert.equal(body.decision.verdict, 'KILL');
});

test('run-capital-experiment flips to REVISE when envelope cap is below spend', async () => {
  const response = await runPost(request({ proposalId: 'atlas-freight-rma-copilot', envelopeCap: 30 }));
  assert.equal(response.status, 200);
  const body = await payload(response);
  assert.equal(body.envelope.cap, 30);
  assert.equal(body.envelope.spent, 35);
  assert.equal(body.decision.verdict, 'REVISE');
});

test('run-capital-experiment rejects unknown proposal ids', async () => {
  const response = await runPost(request({ proposalId: 'missing-proposal' }));
  assert.equal(response.status, 404);
  const body = await payload(response);
  assert.match(body.error, /proposal/i);
});

test('run-capital-experiment rejects malformed JSON', async () => {
  const req = new Request('http://localhost:3000/api/run-capital-experiment', {
    method: 'POST',
    headers: jsonHeaders,
    body: '{',
  });
  const response = await runPost(req);
  assert.equal(response.status, 400);
});
