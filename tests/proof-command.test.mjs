import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyNemotronProof, classifyPolicyProof, classifyProductionAccessProof, classifyStripeProof } from '../scripts/agent-ic-proof.mjs';

test('Stripe proof helper distinguishes live and non-production receipts', () => {
  const nonProduction = classifyStripeProof({ mode: 'non-production', testMode: true, sessionId: 'cs_test_1234567890' });
  assert.equal(nonProduction.hasCheckoutSession, true);
  assert.equal(nonProduction.nonProductionReceipt, true);
  assert.equal(nonProduction.liveReceipt, false);
  assert.equal(nonProduction.state, 'non-production-session-recorded');
  assert.match(nonProduction.limitation, /not live money movement/);

  const live = classifyStripeProof({
    mode: 'live',
    testMode: false,
    sessionId: 'cs_live_1234567890',
    amountDollars: 100,
    retrieval: { id: 'cs_live_1234567890', livemode: true, amount_total: 10000, status: 'open' },
  });
  assert.equal(live.hasCheckoutSession, true);
  assert.equal(live.nonProductionReceipt, false);
  assert.equal(live.retrievalCorrelated, true);
  assert.equal(live.liveReceipt, true);
  assert.equal(live.state, 'live-session-retrieved');
  assert.equal(live.limitation, null);

  const unverifiedLive = classifyStripeProof({
    mode: 'live',
    testMode: false,
    sessionId: 'cs_live_1234567890',
    amountDollars: 100,
    retrieval: { id: 'cs_live_other', livemode: true, amount_total: 10000 },
  });
  assert.equal(unverifiedLive.hasCheckoutSession, true);
  assert.equal(unverifiedLive.retrievalCorrelated, false);
  assert.equal(unverifiedLive.liveReceipt, false);
  assert.equal(unverifiedLive.state, 'unverified-live-session');
  assert.match(unverifiedLive.limitation, /retrieve\/status metadata/);

  const missing = classifyStripeProof({ mode: 'unavailable', testMode: false });
  assert.equal(missing.hasCheckoutSession, false);
  assert.equal(missing.liveReceipt, false);
  assert.equal(missing.state, 'unavailable-or-local-envelope');
});

test('production-access proof helper rejects approvals missing receipt evidence', () => {
  const denial = classifyProductionAccessProof({
    approved: false,
    status: 'not_approved',
    scope: 'governed_trial_only',
    blockers: ['live-mode spend receipt missing'],
    evidence: { stripeLiveReceiptVerified: false },
  });
  assert.equal(denial.valid, true);

  const weakApproval = classifyProductionAccessProof({
    approved: true,
    status: 'approved',
    scope: 'scoped_production_access',
    blockers: [],
    evidence: {
      approvalVerified: true,
      evidenceArtifactsVerified: true,
      stripeLiveReceiptVerified: true,
      nemotronClassificationReceipt: true,
      openShellVerified403: true,
      hermesReceiptVerified: false,
      policyBypass: false,
    },
  });
  assert.equal(weakApproval.valid, false);
  assert.match(weakApproval.error, /hermesReceiptVerified/);

  const validApproval = classifyProductionAccessProof({
    approved: true,
    status: 'approved',
    scope: 'scoped_production_access',
    blockers: [],
    evidence: {
      approvalVerified: true,
      evidenceArtifactsVerified: true,
      stripeLiveReceiptVerified: true,
      nemotronClassificationReceipt: true,
      openShellVerified403: true,
      hermesReceiptVerified: true,
      policyBypass: false,
    },
  });
  assert.equal(validApproval.valid, true);
});

test('policy proof helper distinguishes local policy from verified OpenShell', () => {
  const allowed = { status: 200, tool: 'NHTSA evidence read' };
  const localPolicy = classifyPolicyProof({
    blocked: true,
    status: 403,
    enforcementEngine: 'policy-gate',
    verificationStatus: 'verified',
  }, allowed);
  assert.equal(localPolicy.hasAllowedAndDenied, true);
  assert.equal(localPolicy.openShellVerified, false);
  assert.equal(localPolicy.state, 'local-policy-enforced');

  const weakOpenShell = classifyPolicyProof({
    blocked: true,
    status: 403,
    enforcementEngine: 'NVIDIA OpenShell',
    verificationStatus: 'verified',
  }, allowed);
  assert.equal(weakOpenShell.hasAllowedAndDenied, true);
  assert.equal(weakOpenShell.openShellVerified, false);

  const verifiedOpenShell = classifyPolicyProof({
    blocked: true,
    status: 403,
    enforcementEngine: 'NVIDIA OpenShell',
    verificationStatus: 'verified',
    enforcementType: 'container-network-policy',
    sandbox: 'agent-ic-sandbox',
    receipt: 'openshell-block-1234567890',
    proof: {
      engine: 'NVIDIA OpenShell',
      enforcementLevel: 'container network interception',
      genuineExternal: true,
    },
  }, allowed);
  assert.equal(verifiedOpenShell.hasAllowedAndDenied, true);
  assert.equal(verifiedOpenShell.openShellVerified, true);
  assert.equal(verifiedOpenShell.state, 'openshell-verified');
});

test('Nemotron proof helper requires classification receipt for strict proof', () => {
  const verified = classifyNemotronProof({
    casesProcessed: 330,
    classificationMethod: {
      mode: 'nemotron-sample-plus-pattern-extension',
      nemotronClassified: 3,
      patternExtended: 327,
      deterministicClassified: 0,
      nemotronRequestId: 'chatcmpl-proof-classification-1234567890',
    },
  }, {});
  assert.equal(verified.classificationVerified, true);
  assert.equal(verified.state, 'classification-receipt-recorded');

  const synthesisOnly = classifyNemotronProof({
    casesProcessed: 330,
    classificationMethod: {
      mode: 'deterministic-fallback',
      nemotronClassified: 0,
      patternExtended: 0,
      deterministicClassified: 330,
      nemotronRequestId: null,
    },
  }, {
    nemotronSynthesis: { mode: 'live', requestId: 'chatcmpl-proof-synth-1234567890' },
  });
  assert.equal(synthesisOnly.classificationVerified, false);
  assert.equal(synthesisOnly.synthesisVerified, true);
  assert.equal(synthesisOnly.state, 'synthesis-only-receipt');
  assert.match(synthesisOnly.proof, /classification receipt missing/);
});
