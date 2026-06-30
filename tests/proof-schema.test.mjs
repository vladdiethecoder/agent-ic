import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EnterpriseTrialResultSchema,
  parseSchema,
  ProductionAccessDecisionSchema,
  RenewalCycleRecordSchema,
  ProofReportSchema,
  SpendApprovalSchema,
  StrictProviderProofErrorSchema,
  TrialRunRecordSchema,
} from '../lib/schemas.js';

test('production-access proof schemas accept governed denial with blockers', () => {
  const spendApproval = {
    required: true,
    status: 'approved',
    idMasked: 'appr_123…7890',
    spendCap: 100,
    caseId: 'safety-ops-complaint-triage',
    decidedAt: new Date().toISOString(),
    decidedByRole: 'finance_approver',
    evidence: 'approved spend envelope matched before trial execution',
  };
  const productionAccessDecision = {
    approved: false,
    status: 'not_approved',
    scope: 'governed_trial_only',
    recommendedAction: 'keep vendor agent in governed trial state',
    blockers: ['live-mode spend receipt missing'],
    evidence: { stripeTestMode: true },
  };

  assert.equal(parseSchema(SpendApprovalSchema, spendApproval).ok, true);
  assert.equal(parseSchema(ProductionAccessDecisionSchema, productionAccessDecision).ok, true);
  assert.equal(parseSchema(TrialRunRecordSchema, {
    recordType: 'trial-run-v1',
    tenantId: 'tenant_a',
    userId: 'operator_1',
    runId: 'trial_schema_1',
    caseId: 'safety-ops-complaint-triage',
    spendApproval,
    productionAccessDecision,
    evidence: { casesProcessed: 330 },
    decision: { verdict: 'CONTINUE' },
    policyBlock: { blocked: true },
    evidenceArtifacts: [],
    storedAt: new Date().toISOString(),
  }).ok, true);
  assert.equal(parseSchema(TrialRunRecordSchema, {
    recordType: 'trial-run-v1',
    tenantId: 'tenant_a',
    userId: 'operator_1',
    runId: 'trial_schema_1',
    caseId: 'safety-ops-complaint-triage',
    evidence: { casesProcessed: 330 },
    decision: { verdict: 'CONTINUE' },
    policyBlock: { blocked: true },
    evidenceArtifacts: [],
    storedAt: new Date().toISOString(),
  }).ok, false);
});

test('production-access proof schemas reject malformed approval and blocker state', () => {
  assert.equal(parseSchema(SpendApprovalSchema, { required: true, status: 'rubber_stamped' }).ok, false);
  assert.equal(parseSchema(SpendApprovalSchema, { required: true, status: 'approved', spendCap: 100 }).ok, false);
  assert.equal(parseSchema(SpendApprovalSchema, { required: true, status: 'approved', id: 'appr_missing_cap' }).ok, false);
  assert.equal(parseSchema(ProductionAccessDecisionSchema, {
    approved: true,
    status: 'approved',
    scope: 'scoped_production_access',
    recommendedAction: 'grant access',
    blockers: 'none',
  }).ok, false);
  assert.equal(parseSchema(ProductionAccessDecisionSchema, {
    approved: false,
    status: 'not_approved',
    scope: 'governed_trial_only',
    recommendedAction: 'keep governed',
    blockers: [],
  }).ok, false);
  assert.equal(parseSchema(ProductionAccessDecisionSchema, {
    approved: true,
    status: 'not_approved',
    scope: 'governed_trial_only',
    recommendedAction: 'grant access',
    blockers: ['should not be here'],
  }).ok, false);
});

test('proof report schema includes latest trial production-access decision', () => {
  const report = {
    ok: true,
    product: 'Agent IC',
    proofSurfaces: { primaryRoute: '/trial' },
    workloadEvidence: { rowCount: 330 },
    latestTrial: {
      runId: 'trial_schema_latest',
      caseId: 'safety-ops-complaint-triage',
      spendApproval: { required: false, status: 'not_required_for_local_trial' },
      productionAccessDecision: {
        approved: false,
        status: 'not_approved',
        scope: 'governed_trial_only',
        recommendedAction: 'keep governed',
        blockers: ['production spend/access approval missing'],
      },
    },
  };
  assert.equal(parseSchema(ProofReportSchema, report).ok, true);
  assert.equal(parseSchema(ProofReportSchema, { ...report, latestTrial: { runId: '' } }).ok, false);
});


test('enterprise trial result schema requires production-access proof artifacts', () => {
  const base = {
    runId: 'trial_schema_result',
    tenantId: 'tenant_a',
    userId: 'operator_1',
    caseId: 'safety-ops-complaint-triage',
    stripe: { mode: 'non-production', testMode: true },
    spendApproval: { required: false, status: 'not_required_for_local_trial' },
    productionAccessDecision: {
      approved: false,
      status: 'not_approved',
      scope: 'governed_trial_only',
      recommendedAction: 'keep governed',
      blockers: ['production spend/access approval missing'],
    },
    workerResult: { evidence: { casesProcessed: 330 } },
    policyBlock: { result: { blocked: true, status: 403 } },
    decision: { verdict: 'CONTINUE', metrics: { profitability: { netValue: 2669 } } },
    evidenceArtifacts: [],
  };
  assert.equal(parseSchema(EnterpriseTrialResultSchema, base).ok, true);
  const missingProductionAccess = { ...base };
  delete missingProductionAccess.productionAccessDecision;
  assert.equal(parseSchema(EnterpriseTrialResultSchema, missingProductionAccess).ok, false);
  const missingSpendApproval = { ...base };
  delete missingSpendApproval.spendApproval;
  assert.equal(parseSchema(EnterpriseTrialResultSchema, missingSpendApproval).ok, false);
  assert.equal(parseSchema(EnterpriseTrialResultSchema, {
    ...base,
    productionAccessDecision: { approved: false, status: 'not_approved', scope: 'governed_trial_only', recommendedAction: 'keep governed', blockers: [] },
  }).ok, false);
});


test('strict provider proof error schema carries missing proof blockers', () => {
  const error = {
    error: 'Strict provider proof required but missing: Stripe Checkout receipt, Hermes dispatch receipt',
    code: 'strict_provider_proof_missing',
    decision: 'blocked',
    missingProof: ['Stripe Checkout receipt', 'Hermes dispatch receipt'],
  };
  assert.equal(parseSchema(StrictProviderProofErrorSchema, error).ok, true);
  assert.equal(parseSchema(StrictProviderProofErrorSchema, { ...error, decision: 'approved' }).ok, false);
  assert.equal(parseSchema(StrictProviderProofErrorSchema, { ...error, missingProof: [] }).ok, false);
});


test('renewal cycle schema requires approval and production-access proof artifacts', () => {
  const cycle = {
    cycleId: 'cycle_schema_1',
    tenantId: 'tenant_a',
    runId: 'trial_schema_1',
    caseId: 'safety-ops-complaint-triage',
    verdict: 'CONTINUE',
    spendCap: 100,
    metrics: { netValue: 2669 },
    policyBlock: { status: 403, enforced: true },
    spendApproval: { required: false, status: 'not_required_for_local_trial' },
    productionAccessDecision: {
      approved: false,
      status: 'not_approved',
      scope: 'governed_trial_only',
      recommendedAction: 'keep governed',
      blockers: ['production spend/access approval missing'],
    },
    evidenceHash: 'hash',
    provenance: { mode: 'observed_trial' },
  };
  assert.equal(parseSchema(RenewalCycleRecordSchema, cycle).ok, true);
  const missingApproval = { ...cycle };
  delete missingApproval.spendApproval;
  assert.equal(parseSchema(RenewalCycleRecordSchema, missingApproval).ok, false);
  const missingProductionAccess = { ...cycle };
  delete missingProductionAccess.productionAccessDecision;
  assert.equal(parseSchema(RenewalCycleRecordSchema, missingProductionAccess).ok, false);
});
