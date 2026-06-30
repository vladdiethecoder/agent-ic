import test from 'node:test';
import assert from 'node:assert/strict';

function baseEvidence(overrides = {}) {
  return {
    casesProcessed: 330,
    autoRouted: 301,
    humanReviewQueue: 29,
    falsePositives: 3,
    lowValueOutputs: 13,
    accuracy: 0.912,
    falsePositiveRate: 0.009,
    criticalIncidents: 0,
    blockedActionEnforced: true,
    blockedActionBypassed: false,
    blockedActionSeverity: 0.15,
    serviceRuntimeMs: 28050,
    timeToFirstOutputMs: 850,
    ...overrides,
  };
}

function trialResult({ tenantId, caseDef, verdict, runId, cap = 100, netValue = 1000, policyEnforced = true }) {
  return {
    tenantId,
    runId,
    caseId: caseDef.id,
    domain: caseDef.domain,
    startedAt: new Date().toISOString(),
    vendor: caseDef.vendor,
    buyer: caseDef.buyer,
    spendEnvelope: { cap },
    workerResult: {
      evidence: {
        casesProcessed: 100,
        accuracy: verdict === 'KILL' ? 0.5 : 0.9,
        falsePositiveRate: verdict === 'KILL' ? 0.2 : 0.02,
        dataHash: `${runId}-hash`,
      },
    },
    decision: {
      verdict,
      confidence: 'medium',
      metrics: {
        profitability: { netValue, baselineCost: 1200, agentCost: 200 },
        wasteRatio: { ratio: verdict === 'KILL' ? 0.32 : 0.08 },
        riskAdjustedROI: { multiple: verdict === 'KILL' ? 0.5 : 2.5 },
        throughputUplift: { multiple: 3 },
        annualizedProjection: { annualValue: netValue * 12, vendorAnnualAsk: 14400 },
        opportunityCost: { value: 500, hoursSaved: 4 },
        timeToValue: { seconds: 1 },
        costPerUnit: { baseline: 12, agent: 2 },
      },
      claimValidation: {
        summary: { total: 1, validated: verdict === 'CONTINUE' ? 1 : 0, partiallyMet: verdict === 'REVISE' ? 1 : 0, failed: verdict === 'KILL' ? 1 : 0, informational: 0, anyCriticalFailure: verdict === 'KILL', overallVerdict: verdict === 'KILL' ? 'failed' : 'validated' },
        results: [],
      },
      evidence: { quality: 80, governance: policyEnforced ? 100 : 20, score: policyEnforced ? 90 : 50 },
      procurementRecommendation: { recommendation: verdict, valueVsVendorAsk: 1.2 },
    },
    policyBlock: { result: { status: policyEnforced ? 403 : 0, blocked: policyEnforced } },
  };
}

test('enterprise metrics keep ROI and waste thresholds exact at procurement boundaries', async () => {
  const { computeEnterpriseMetrics, aggregateMetricVerdicts } = await import('../lib/enterpriseMetrics.js');
  const { getCaseById } = await import('../lib/enterpriseCases.js');
  const caseDef = getCaseById('safety-ops-complaint-triage');
  const baselineMetrics = computeEnterpriseMetrics(baseEvidence(), caseDef);
  const baseRoi = baselineMetrics.riskAdjustedROI.netValue / baselineMetrics.riskAdjustedROI.governedCost;
  const severityAtThreshold = 1 - (1.5 / baseRoi);

  const thresholdMetrics = computeEnterpriseMetrics(
    baseEvidence({ blockedActionSeverity: severityAtThreshold, falsePositives: 99, lowValueOutputs: 0 }),
    caseDef
  );
  assert.equal(thresholdMetrics.riskAdjustedROI.multiple, 1.5);
  assert.equal(thresholdMetrics.riskAdjustedROI.decisionFlag, null);
  assert.equal(thresholdMetrics.wasteRatio.ratio, 0.3);
  assert.equal(thresholdMetrics.wasteRatio.decisionFlag, null);
  assert.equal(aggregateMetricVerdicts(thresholdMetrics), 'CONTINUE');

  const failingMetrics = computeEnterpriseMetrics(
    baseEvidence({ blockedActionSeverity: severityAtThreshold + 0.001, falsePositives: 100, lowValueOutputs: 0 }),
    caseDef
  );
  assert.equal(failingMetrics.riskAdjustedROI.decisionFlag, 'REVISE');
  assert.equal(failingMetrics.wasteRatio.decisionFlag, 'KILL');
  assert.equal(aggregateMetricVerdicts(failingMetrics), 'KILL');
});

test('inverse measurable vendor claims fail critically when overrun exceeds 15 points', async () => {
  const { validateVendorClaims, summarizeClaimValidation } = await import('../lib/vendorClaimValidator.js');
  const [result] = validateVendorClaims(['Keeps false-positive rate below 15%'], { falsePositiveRate: 0.4 });
  const summary = summarizeClaimValidation([result]);

  assert.equal(result.verdict, 'failed');
  assert.equal(result.passed, false);
  assert.equal(result.overrun, 25);
  assert.equal(result.decisionImpact, 'KILL');
  assert.equal(summary.failed, 1);
  assert.equal(summary.anyCriticalFailure, true);
});

test('procurement decision kills contracts when inverse critical claims miss by more than 15 points', async () => {
  const { evaluateTrial } = await import('../lib/procurementDecisionEngine.js');
  const { getCaseById } = await import('../lib/enterpriseCases.js');
  const original = getCaseById('safety-ops-complaint-triage');
  const caseDef = {
    ...original,
    vendor: {
      ...original.vendor,
      claims: ['Keeps false-positive rate below 15%'],
    },
  };

  const decision = evaluateTrial(
    caseDef,
    baseEvidence({ falsePositiveRate: 0.4, falsePositives: 0, lowValueOutputs: 0 }),
    { policyBlockResult: { blocked: true, status: 403 } }
  );

  assert.equal(decision.metrics.wasteRatio.decisionFlag, null);
  assert.equal(decision.claimValidation.summary.anyCriticalFailure, true);
  assert.equal(decision.verdict, 'KILL');
  assert.equal(decision.procurementRecommendation.signContract, false);
});

test('procurement decision holds expansion when model evidence falls back locally', async () => {
  const { evaluateTrial } = await import('../lib/procurementDecisionEngine.js');
  const { getCaseById } = await import('../lib/enterpriseCases.js');
  const caseDef = getCaseById('safety-ops-complaint-triage');
  const policyBlockResult = { blocked: true, status: 403 };

  const liveDecision = evaluateTrial(
    caseDef,
    baseEvidence({
      classificationMethod: {
        mode: 'nemotron-sample-plus-pattern-extension',
        nemotronClassified: 12,
        patternExtended: 318,
        deterministicClassified: 0,
        nemotronRequestId: 'chatcmpl-unit-live-classification',
        unavailableReason: null,
      },
    }),
    { policyBlockResult }
  );
  assert.equal(liveDecision.verdict, 'CONTINUE');
  assert.equal(liveDecision.procurementRecommendation.signContract, false);
  assert.equal(liveDecision.procurementRecommendation.productionAccessApproved, false);
  assert.equal(liveDecision.procurementRecommendation.authorizedNextStep, 'continue_governed_pilot');
  assert.match(liveDecision.procurementRecommendation.recommendation, /Continue the governed pilot/);
  assert.equal(liveDecision.evidence.completeness.blocking, false);

  const fallbackDecision = evaluateTrial(
    caseDef,
    baseEvidence({
      classificationMethod: {
        mode: 'deterministic-fallback',
        nemotronClassified: 0,
        patternExtended: 0,
        deterministicClassified: 330,
        nemotronRequestId: null,
        unavailableReason: 'Nemotron returned 0/3 classifications',
      },
    }),
    { policyBlockResult }
  );

  assert.equal(fallbackDecision.verdict, 'REVISE');
  assert.equal(fallbackDecision.procurementRecommendation.signContract, false);
  assert.equal(fallbackDecision.evidence.completeness.blocking, true);
  assert.match(fallbackDecision.evidence.completeness.reasons[0], /Nemotron sample-classification receipt missing/);
  assert.match(fallbackDecision.procurementRecommendation.recommendation, /Do not sign or expand yet/);
  assert.ok(fallbackDecision.evidence.quality <= 65);
});

test('single-cycle renewal recommendation holds REVISE vendors and cancels KILL vendors', async () => {
  const { recordTrialCycle, getRenewalHistory, clearLedger } = await import('../lib/renewalLedger.js');
  const { getCaseById } = await import('../lib/enterpriseCases.js');
  const caseDef = getCaseById('safety-ops-complaint-triage');

  const reviseTenant = `unit-renewal-revise-${Date.now()}`;
  clearLedger({ tenantId: reviseTenant });
  recordTrialCycle(trialResult({ tenantId: reviseTenant, caseDef, verdict: 'REVISE', runId: 'revise-run', cap: 250 }));
  const reviseHistory = getRenewalHistory(caseDef.id, { tenantId: reviseTenant });
  assert.equal(reviseHistory.renewal.action, 'hold');
  assert.equal(reviseHistory.renewal.nextCap, 250);

  const killTenant = `unit-renewal-kill-${Date.now()}`;
  clearLedger({ tenantId: killTenant });
  recordTrialCycle(trialResult({ tenantId: killTenant, caseDef, verdict: 'KILL', runId: 'kill-run', cap: 250, netValue: -100 }));
  const killHistory = getRenewalHistory(caseDef.id, { tenantId: killTenant });
  assert.equal(killHistory.renewal.action, 'cancel');
  assert.equal(killHistory.renewal.nextCap, 250);
});
