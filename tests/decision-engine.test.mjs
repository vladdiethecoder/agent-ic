import test from 'node:test';
import assert from 'node:assert/strict';
import { seededProposals } from '../lib/demoData.js';
import { scoreProposal, updateDecisionWithEvidence } from '../lib/decisionEngine.js';

test('decision engine keeps budget lines balanced and caps bounded', () => {
  for (const proposal of seededProposals) {
    const evaluation = scoreProposal(proposal);
    const lineTotal = evaluation.budget.reduce((sum, line) => sum + line.amount, 0);
    assert.equal(lineTotal, evaluation.recommendedBudget, `${proposal.id} budget lines must sum to recommendation`);
    assert.ok(evaluation.autonomousSpendCap >= 0, `${proposal.id} cap must be non-negative`);
    assert.ok(
      evaluation.autonomousSpendCap <= evaluation.recommendedBudget,
      `${proposal.id} cap must never exceed recommended budget`
    );
    for (const line of evaluation.budget) {
      assert.ok(Number.isInteger(line.amount), `${proposal.id}/${line.name} amount must be integer dollars`);
      assert.ok(line.amount >= 0, `${proposal.id}/${line.name} amount must be non-negative`);
      assert.ok(line.cap <= evaluation.recommendedBudget, `${proposal.id}/${line.name} cap must be bounded`);
    }
  }
});

test('evidence gates observe before week four and continue when week-four evidence is B+', () => {
  const evaluation = scoreProposal(seededProposals[0]);
  assert.equal(updateDecisionWithEvidence(evaluation, 0).decision, 'OBSERVE');
  assert.equal(updateDecisionWithEvidence(evaluation, 1).decision, 'OBSERVE');
  assert.equal(updateDecisionWithEvidence(evaluation, 2).decision, 'CONTINUE');
});

test('evidence gates kill week-four evidence below B+', () => {
  const evaluation = scoreProposal(seededProposals[0]);
  const weak = {
    ...evaluation,
    evidenceTimeline: evaluation.evidenceTimeline.map((event) =>
      event.week === 4 ? { ...event, grade: 'B', cumulativeImpact: 5000 } : event
    ),
  };
  assert.equal(updateDecisionWithEvidence(weak, 2).decision, 'KILL');
});

test('decision engine exposes micro-pilot spend envelope, blocked action, and evidence receipts', () => {
  const evaluation = scoreProposal(seededProposals[0]);
  assert.ok(evaluation.spendEnvelope, 'spendEnvelope must be present');
  assert.equal(evaluation.spendEnvelope.cap, 100, 'Atlas Freight envelope is $100');
  assert.ok(evaluation.spendEnvelope.allowedTools.length > 0, 'allowedTools must not be empty');
  assert.ok(evaluation.spendEnvelope.blockedTool, 'blockedTool must be present');
  assert.ok(evaluation.blockedAction, 'blockedAction must be present');
  assert.equal(evaluation.blockedAction.kind, 'blocked');
  assert.ok(evaluation.blockedAction.policyBreach, 'blockedAction must name a policy breach');
  assert.ok(evaluation.evidenceReceipts, 'evidenceReceipts must be present');
  assert.ok(evaluation.evidenceReceipts.some((r) => r.metric === 'cases_processed'));
  assert.ok(evaluation.evidenceReceipts.some((r) => r.metric === 'net_value'));
});

test('decision engine rejects non-finite or negative proposal economics before spend math', () => {
  const proposal = {
    ...seededProposals[0],
    ask: -100,
    baseline: { ...seededProposals[0].baseline, monthlyCases: Number.POSITIVE_INFINITY },
  };
  assert.throws(() => scoreProposal(proposal), /invalid proposal/i);
});
