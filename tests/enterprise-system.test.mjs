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
  // Worker requires a Nemotron client — provide a fixture that returns the full requested sample.
  const sampleNemotronClient = {
    available: true,
    classify: async () => ({
      ok: true,
      requestId: 'chatcmpl-unit-sample',
      text: JSON.stringify(Array.from({ length: 12 }, () => (
        { queue: 'technical', confidence: 0.95, rationale: 'sample classification' }
      ))),
    }),
  };
  const result = await runWorkerTrial({ caseDef, nemotronClient: sampleNemotronClient });
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

test('enterprise trial records live Hermes receipt when configured', async () => {
  const { runEnterpriseTrial } = await import('../lib/trialOrchestrator.js');
  const integrations = {
    openShell: { skip: true },
    stripe: {
      available: true,
      create: async () => ({
        mode: 'live',
        checkout: { id: 'cs_test_enterprise_hermes_receipt', status: 'open' },
        retrieval: { id: 'cs_test_enterprise_hermes_receipt', status: 'open' },
      }),
    },
    nemotron: {
      available: true,
      classify: async () => ({
        ok: true,
        requestId: 'chatcmpl-enterprise-hermes-worker',
        text: JSON.stringify(Array.from({ length: 12 }, () => (
          { queue: 'technical', confidence: 0.95, rationale: 'sample classification' }
        ))),
      }),
      synthesize: async () => ({
        requestId: 'chatcmpl-enterprise-hermes',
        latencyMs: 12,
        verdict: 'CONTINUE',
        businessCase: 'Measured evidence supports expansion.',
      }),
    },
    policyGate: {
      available: true,
      evaluate: async ({ caseDef }) => ({
        blocked: true,
        status: 403,
        enforced: true,
        enforcementEngine: 'policy-gate',
        attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
        cap: caseDef.policyEnvelope.spendCap,
        policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
      }),
    },
    hermes: {
      available: true,
      dispatch: async () => ({
        ok: true,
        taskId: 'hermes-session-unit-live-receipt-1234567890',
        hermesSessionId: 'unit-live-receipt-1234567890',
        skillSource: 'nemohermes-sandbox',
        provider: 'nemohermes',
        sandboxId: 'agent-ic-hermes',
        skillPlan: ['official/payments/stripe-link-cli'],
        outputSha256: 'a'.repeat(64),
        outputSummary: 'Hermes selected payment and policy skills for the governed trial.',
        latencyMs: 34,
      }),
    },
  };

  const result = await runEnterpriseTrial({
    missionStatement: 'Evaluate RouteGuard AI for complaint triage before signing',
    caseId: 'safety-ops-complaint-triage',
    integrations,
    requireLiveProof: true,
    tenantId: 'unit-hermes-tenant',
    userId: 'unit-test',
  });

  assert.equal(result.hermesExecutionReceipt.state, 'recorded');
  assert.equal(result.hermesExecutionReceipt.skillSource, 'nemohermes-sandbox');
  assert.equal(result.hermesExecutionReceipt.sandboxId, 'agent-ic-hermes');
  assert.match(result.hermesExecutionReceipt.taskIdMasked, /^hermes-sessi.*1234567890$|^hermes-sessi.*7890$/);
  assert.equal(result.playbook.hermesNative, true);
});

test('enterprise trial fails closed when live Hermes proof is required but unavailable', async () => {
  const { runEnterpriseTrial } = await import('../lib/trialOrchestrator.js');
  await assert.rejects(
    runEnterpriseTrial({
      missionStatement: 'Evaluate RouteGuard AI for complaint triage before signing',
      caseId: 'safety-ops-complaint-triage',
      integrations: {
        openShell: { skip: true },
        nemotron: {
          available: true,
          classify: async () => ({
            ok: true,
            requestId: 'chatcmpl-enterprise-no-hermes-worker',
            text: JSON.stringify(Array.from({ length: 12 }, () => (
              { queue: 'technical', confidence: 0.95, rationale: 'sample classification' }
            ))),
          }),
          synthesize: async () => ({
            requestId: 'chatcmpl-enterprise-no-hermes',
            latencyMs: 12,
            verdict: 'CONTINUE',
            businessCase: 'Measured evidence supports expansion.',
          }),
        },
        policyGate: {
          available: true,
          evaluate: async ({ caseDef }) => ({
            blocked: true,
            status: 403,
            enforced: true,
            enforcementEngine: 'policy-gate',
            attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
            cap: caseDef.policyEnvelope.spendCap,
            policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
          }),
        },
      },
      requireLiveProof: true,
      tenantId: 'unit-hermes-fail-tenant',
      userId: 'unit-test',
    }),
    /Live Hermes proof required/
  );
});

test('renewal ledger records and retrieves cycles', async () => {
  const { recordTrialCycle, getRenewalHistory, clearLedger } = await import('../lib/renewalLedger.js');
  const { getCaseById } = await import('../lib/enterpriseCases.js');
  const caseDef = getCaseById('safety-ops-complaint-triage');
  const tenantId = `unit-renewal-${Date.now()}`;

  clearLedger({ tenantId });

  // Simulate a trial result
  recordTrialCycle({
    tenantId,
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

  const history = getRenewalHistory(caseDef.id, { tenantId });
  assert.equal(history.cycles.length, 1);
  assert.equal(history.cycles[0].verdict, 'CONTINUE');
  assert.ok(history.renewal, 'has renewal recommendation');
});

test('proof report exposes masked judge audit surface', async () => {
  const { GET } = await import('../app/api/proof-report/route.js');
  const response = await GET(new Request('http://localhost/api/proof-report'));
  assert.equal(response.status, 200);
  const report = await response.json();

  assert.equal(report.ok, true);
  assert.equal(report.proofSurfaces.primaryRoute, '/trial');
  assert.equal(report.proofSurfaces.spend.includes('Stripe test-mode Checkout Session'), true);
  assert.ok(report.workloadEvidence.rowCount > 0, 'reports workload row count');
  assert.match(report.workloadEvidence.sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.cases.length, 4);
  assert.equal(JSON.stringify(report).includes('sk_test_'), false);
  assert.equal(JSON.stringify(report).includes('nvapi-'), false);
});
