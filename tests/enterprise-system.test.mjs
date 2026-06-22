import test from 'node:test';
import assert from 'node:assert/strict';

test('enterprise cases load with all 4 vendor products', async () => {
  const { enterpriseCases } = await import('../lib/enterpriseCases.js');
  assert.equal(enterpriseCases.length, 4);
  for (const c of enterpriseCases) {
    assert.ok(c.vendor.product, 'has vendor product name');
    assert.ok(c.vendor.pricingModel, 'has pricing');
    assert.ok(c.vendor.claims.length >= 3, 'has claims');
    assert.ok(c.policyEnvelope.blockedTool, 'has blocked tool');
    assert.ok(c.dataSource.url, 'has data source URL');
    assert.ok(c.roiMethodology.baseline.result.totalCost > 0, 'has baseline cost');
  }
});

test('worker agent processes NHTSA complaints', async () => {
  const { runWorkerTrial } = await import('../lib/workerAgent.js');
  const { getCaseById } = await import('../lib/enterpriseCases.js');
  const caseDef = getCaseById('safety-ops-complaint-triage');
  // Worker requires a Nemotron client — provide a mock that returns valid classifications
  const mockNemotronClient = {
    available: true,
    classify: async () => ({
      ok: true,
      requestId: 'test-chatcmpl-mock',
      text: JSON.stringify([
        { queue: 'technical', confidence: 0.95, rationale: 'test' },
      ]),
    }),
  };
  const result = await runWorkerTrial({ caseDef, nemotronClient: mockNemotronClient });
  assert.ok(result.evidence.casesProcessed > 0, 'processed complaints');
  assert.ok(result.evidence.autoRouted > 0, 'auto-routed');
  assert.ok(result.evidence.humanReviewQueue >= 0, 'has human review queue');
  assert.ok(result.evidence.dataHash, 'has data hash');
  assert.ok(result.evidence.accuracy > 0, 'has accuracy');
});

test('procurement decision engine produces verdict', async () => {
  const { evaluateTrial } = await import('../lib/procurementDecisionEngine.js');
  const { getCaseById } = await import('../lib/enterpriseCases.js');
  const caseDef = getCaseById('safety-ops-complaint-triage');
  const evidence = {
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
  };
  const decision = evaluateTrial(caseDef, evidence, {
    policyBlockResult: { blocked: true, status: 403 },
  });
  assert.ok(['CONTINUE', 'REVISE', 'KILL'].includes(decision.verdict));
  assert.ok(decision.metrics.profitability.netValue > 0);
  assert.ok(decision.claimValidation.results.length > 0);
});

test('renewal ledger records and retrieves cycles', async () => {
  const { recordTrialCycle, getRenewalHistory, clearLedger } = await import('../lib/renewalLedger.js');
  const { getCaseById } = await import('../lib/enterpriseCases.js');
  const caseDef = getCaseById('safety-ops-complaint-triage');

  clearLedger();

  // Simulate a trial result
  recordTrialCycle({
    runId: 'test-run-1',
    caseId: caseDef.id,
    domain: caseDef.domain,
    startedAt: new Date().toISOString(),
    vendor: caseDef.vendor,
    buyer: caseDef.buyer,
    spendEnvelope: { cap: 100 },
    workerResult: {
      evidence: {
        casesProcessed: 330,
        autoRouted: 301,
        humanReviewQueue: 29,
        falsePositives: 3,
        lowValueOutputs: 13,
        accuracy: 0.912,
        falsePositiveRate: 0.009,
        criticalIncidents: 0,
        serviceRuntimeMs: 28050,
        timeToFirstOutputMs: 850,
        blockedActionSeverity: 0.15,
      },
    },
    decision: {
      verdict: 'CONTINUE',
      confidence: 'medium',
      metrics: {
        profitability: { netValue: 2504, baselineCost: 3036, agentCost: 532 },
        wasteRatio: { ratio: 0.05 },
        riskAdjustedROI: { multiple: 4 },
        throughputUplift: { multiple: 7 },
        annualizedProjection: { annualValue: 30048, vendorAnnualAsk: 14400 },
        opportunityCost: { value: 3515, hoursSaved: 28.3 },
        timeToValue: { seconds: 0.9 },
        costPerUnit: { baseline: 9.2, agent: 1.61 },
      },
      claimValidation: {
        summary: { total: 4, validated: 1, partiallyMet: 0, failed: 0, informational: 3, anyCriticalFailure: false, overallVerdict: 'validated' },
        results: [],
      },
      evidence: { quality: 80, governance: 100, score: 90 },
      procurementRecommendation: { recommendation: 'Test recommendation', valueVsVendorAsk: 2.1 },
    },
    policyBlock: { result: { blocked: true, status: 403 } },
  });

  const history = getRenewalHistory(caseDef.id);
  assert.equal(history.cycles.length, 1);
  assert.equal(history.cycles[0].verdict, 'CONTINUE');
  assert.ok(history.renewal, 'has renewal recommendation');
});
