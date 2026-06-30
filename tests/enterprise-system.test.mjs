import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
  assert.equal(result.evidence.dataSourceMode, 'checked-in-snapshot');
  assert.ok(result.evidence.dataSourceArtifact?.includes('nhtsa'), 'snapshot artifact is named');
  assert.ok(result.evidence.accuracy > 0, 'has accuracy');
});

test('worker agent recovers malformed batch Nemotron output with per-item live calls', async () => {
  const { runWorkerTrial } = await import('../lib/workerAgent.js');
  const { getCaseById } = await import('../lib/enterpriseCases.js');
  const caseDef = getCaseById('safety-ops-complaint-triage');
  let calls = 0;
  const maxTokensSeen = [];
  const sampleNemotronClient = {
    available: true,
    classify: async ({ maxTokens } = {}) => {
      maxTokensSeen.push(maxTokens);
      calls += 1;
      if (calls <= 2) {
        return {
          ok: true,
          requestId: `chatcmpl-batch-malformed-${calls}`,
          text: JSON.stringify({ status: 'ok', note: 'missing classifications array' }),
        };
      }
      return {
        ok: true,
        requestId: `chatcmpl-per-item-${calls}`,
        text: JSON.stringify({ classification: { queue: 'technical', confidence: 0.91, rationale: 'single item recovered' } }),
      };
    },
  };

  const result = await runWorkerTrial({ caseDef, nemotronClient: sampleNemotronClient });
  assert.equal(result.evidence.classificationMethod.nemotronClassified, 3);
  assert.equal(result.evidence.classificationMethod.patternExtended, result.evidence.casesProcessed - 3);
  assert.match(result.evidence.classificationMethod.nemotronRequestId, /^chatcmpl-per-item-/);
  assert.equal(calls, 5);
  assert.ok(maxTokensSeen.slice(0, 2).every((tokens) => tokens >= 800));
  assert.ok(maxTokensSeen.slice(2).every((tokens) => tokens >= 300));
});

test('worker agent uses explicitly labeled deterministic fallback when Nemotron is unavailable', async () => {
  const { runWorkerTrial } = await import('../lib/workerAgent.js');
  const { getCaseById } = await import('../lib/enterpriseCases.js');
  const caseDef = getCaseById('safety-ops-complaint-triage');

  const result = await runWorkerTrial({ caseDef, nemotronClient: { available: false } });

  assert.equal(result.evidence.classificationMethod.mode, 'deterministic-fallback');
  assert.equal(result.evidence.classificationMethod.nemotronClassified, 0);
  assert.equal(result.evidence.classificationMethod.deterministicClassified, result.evidence.casesProcessed);
  assert.equal(result.evidence.classificationMethod.nemotronRequestId, null);
  assert.match(result.evidence.classificationMethod.unavailableReason, /Nemotron/i);
});

test('OpenShell exec failure cannot synthesize a successful 403 enforcement receipt', async () => {
  const previous = process.env.OPENSHELL_BINARY;
  process.env.OPENSHELL_BINARY = '/bin/false';
  try {
    const { testPolicyEnforcement } = await import(`../lib/openShellIntegration.js?execfail=${Date.now()}`);
    const { getCaseById } = await import('../lib/enterpriseCases.js');
    const caseDef = getCaseById('safety-ops-complaint-triage');

    const result = await testPolicyEnforcement(caseDef, 'sandbox-unavailable-in-test');

    assert.equal(result.blocked, false);
    assert.equal(result.enforced, false);
    assert.equal(result.status, 0);
    assert.equal(result.verificationStatus, 'unverified');
    assert.doesNotMatch(result.receipt || '', /^openshell-(block|policy)-/);
    assert.equal(result.proof.genuineExternal, false);
    assert.equal(result.proof.enforcementLevel, 'not observed');
    assert.match(result.proof.engine, /unverified/i);
  } finally {
    if (previous === undefined) delete process.env.OPENSHELL_BINARY;
    else process.env.OPENSHELL_BINARY = previous;
  }
});

test('OpenShell integration does not hard-code a provider version as proof', async () => {
  const source = await readFile(new URL('../lib/openShellIntegration.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /NVIDIA OpenShell v0\.0\.66/);
});

test('OpenShell availability does not trust an invalid OPENSHELL_BINARY value', async () => {
  const previous = process.env.OPENSHELL_BINARY;
  process.env.OPENSHELL_BINARY = '/definitely/not/agent-ic-openshell';
  try {
    const { isOpenShellAvailable } = await import(`../lib/openShellIntegration.js?availability=${Date.now()}`);
    assert.equal(isOpenShellAvailable(), false);
  } finally {
    if (previous === undefined) delete process.env.OPENSHELL_BINARY;
    else process.env.OPENSHELL_BINARY = previous;
  }
});

test('provider status labels credentials as configured rather than live receipts', async () => {
  const previousNemotron = process.env.NEMOTRON_API_KEY;
  const previousStripe = process.env.STRIPE_SECRET_KEY;
  const previousLocalMode = process.env.AGENT_IC_LOCAL_MODE;
  process.env.NEMOTRON_API_KEY = 'unit-nvidia-configured-key';
  process.env.STRIPE_SECRET_KEY = 'unit-stripe-configured-key';
  delete process.env.AGENT_IC_LOCAL_MODE;
  try {
    const { buildProviderStates } = await import(`../lib/providerStatus.js?configured=${Date.now()}`);
    const states = buildProviderStates();
    assert.equal(states.nemotron.state, 'configured');
    assert.equal(states.nemotron.mode, 'configured-attempt-live');
    assert.match(states.nemotron.detail, /per-run provider receipt/);
    assert.equal(states.stripe.state, 'configured');
    assert.notEqual(states.nemotron.state, 'live');
    assert.notEqual(states.stripe.state, 'live');
  } finally {
    if (previousNemotron === undefined) delete process.env.NEMOTRON_API_KEY;
    else process.env.NEMOTRON_API_KEY = previousNemotron;
    if (previousStripe === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousStripe;
    if (previousLocalMode === undefined) delete process.env.AGENT_IC_LOCAL_MODE;
    else process.env.AGENT_IC_LOCAL_MODE = previousLocalMode;
  }
});

test('provider status exposes explicitly enabled Hermes CLI dispatch without gateway overclaim', async () => {
  const previousCli = process.env.AGENT_IC_HERMES_CLI_LIVE;
  const previousLocalMode = process.env.AGENT_IC_LOCAL_MODE;
  process.env.AGENT_IC_HERMES_CLI_LIVE = 'true';
  delete process.env.AGENT_IC_LOCAL_MODE;
  try {
    const { buildProviderStates, isHermesLive } = await import(`../lib/providerStatus.js?hermescli=${Date.now()}`);
    const states = buildProviderStates();
    assert.equal(isHermesLive(), true);
    assert.equal(states.hermes.state, 'configured');
    assert.equal(states.hermes.mode, 'configured-attempt-live');
    assert.equal(states.hermes.provider, 'hermes-cli');
    assert.match(states.hermes.detail, /per-run dispatch receipt/);
  } finally {
    if (previousCli === undefined) delete process.env.AGENT_IC_HERMES_CLI_LIVE;
    else process.env.AGENT_IC_HERMES_CLI_LIVE = previousCli;
    if (previousLocalMode === undefined) delete process.env.AGENT_IC_LOCAL_MODE;
    else process.env.AGENT_IC_LOCAL_MODE = previousLocalMode;
  }
});

test('Hermes CLI dispatch adapter records a real CLI-shaped session receipt', async () => {
  const previousCli = process.env.AGENT_IC_HERMES_CLI_LIVE;
  const previousHermesBin = process.env.HERMES_BIN;
  const previousGateway = process.env.HERMES_AGENT_URL;
  const previousGatewayAlias = process.env.HERMES_GATEWAY_URL;
  const previousWebhook = process.env.HERMES_WEBHOOK_URL;
  const previousLocalMode = process.env.AGENT_IC_LOCAL_MODE;
  const dir = await mkdtemp(path.join(tmpdir(), 'agent-ic-hermes-cli-test-'));
  const fakeHermes = path.join(dir, 'hermes');
  await writeFile(fakeHermes, '#!/usr/bin/env node\nprocess.stdout.write(\'session_id: unit-hermes-cli-session\\n{"ok":true,"selectedSkills":["hermes-agent"],"summary":"Unit Hermes CLI receipt."}\\n\');\n');
  await chmod(fakeHermes, 0o755);
  process.env.AGENT_IC_HERMES_CLI_LIVE = 'true';
  process.env.HERMES_BIN = fakeHermes;
  delete process.env.HERMES_AGENT_URL;
  delete process.env.HERMES_GATEWAY_URL;
  delete process.env.HERMES_WEBHOOK_URL;
  delete process.env.AGENT_IC_LOCAL_MODE;
  try {
    const { dispatchToHermes } = await import(`../lib/hermesClient.js?hermescli=${Date.now()}`);
    const receipt = await dispatchToHermes({
      id: 'unit-routeguard',
      company: 'Northstar Automotive',
      title: 'RouteGuard AI trial',
      microPilot: { mission: 'Evaluate RouteGuard AI', envelopeDollars: 100 },
    }, {
      decision: 'CONTINUE',
      autonomousSpendCap: 100,
      trialEvidence: { casesProcessed: 330, autoRouted: 301, humanReviewQueue: 29, dataHash: '3fa9128055d1469d', blockedActionEnforced: true },
    });

    assert.equal(receipt.ok, true);
    assert.equal(receipt.skillSource, 'hermes-cli');
    assert.equal(receipt.provider, 'hermes-cli');
    assert.equal(receipt.hermesSessionId, 'unit-hermes-cli-session');
    assert.equal(receipt.taskId, 'hermes-cli-session-unit-hermes-cli-session');
    assert.deepEqual(receipt.skillPlan, ['hermes-agent']);
    assert.equal(receipt.outputSummary, 'Unit Hermes CLI receipt.');
    assert.match(receipt.outputSha256, /^[0-9a-f]{64}$/);
    assert.equal(receipt.sandboxId, undefined);
  } finally {
    if (previousCli === undefined) delete process.env.AGENT_IC_HERMES_CLI_LIVE;
    else process.env.AGENT_IC_HERMES_CLI_LIVE = previousCli;
    if (previousHermesBin === undefined) delete process.env.HERMES_BIN;
    else process.env.HERMES_BIN = previousHermesBin;
    if (previousGateway === undefined) delete process.env.HERMES_AGENT_URL;
    else process.env.HERMES_AGENT_URL = previousGateway;
    if (previousGatewayAlias === undefined) delete process.env.HERMES_GATEWAY_URL;
    else process.env.HERMES_GATEWAY_URL = previousGatewayAlias;
    if (previousWebhook === undefined) delete process.env.HERMES_WEBHOOK_URL;
    else process.env.HERMES_WEBHOOK_URL = previousWebhook;
    if (previousLocalMode === undefined) delete process.env.AGENT_IC_LOCAL_MODE;
    else process.env.AGENT_IC_LOCAL_MODE = previousLocalMode;
  }
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
  assert.equal(result.policyBlock.result.allowedAction.status, 200);
  assert.equal(result.policyBlock.result.allowedAction.decision, 'allowed');
  assert.equal(result.playbook.openShellVerified, false);
  assert.equal(result.playbook.enforcementMode, 'policy-gate');
  assert.equal(result.playbook.steps.some((step) => step.includes('governed sandbox with OpenShell network policy')), false);
  assert.ok(result.playbook.steps.some((step) => step.includes('policy-gate') && step.includes('no OpenShell sandbox enforcement receipt')));
});

test('enterprise trial labels deterministic synthesis fallback instead of failing when Nemotron synthesis is unusable', async () => {
  const { runEnterpriseTrial } = await import('../lib/trialOrchestrator.js');
  const result = await runEnterpriseTrial({
    missionStatement: 'Evaluate RouteGuard AI for complaint triage before signing',
    caseId: 'safety-ops-complaint-triage',
    integrations: {
      openShell: { skip: true },
      nemotron: {
        available: true,
        classify: async () => ({
          ok: true,
          requestId: 'chatcmpl-enterprise-synth-fallback-worker',
          text: JSON.stringify(Array.from({ length: 12 }, () => (
            { queue: 'technical', confidence: 0.95, rationale: 'sample classification' }
          ))),
        }),
        synthesize: async () => null,
      },
      policyGate: {
        available: true,
        evaluate: async ({ caseDef }) => ({
          blocked: true,
          status: 403,
          enforced: true,
          verificationStatus: 'verified',
          enforcementEngine: 'policy-gate',
          attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
          cap: caseDef.policyEnvelope.spendCap,
          policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
        }),
      },
    },
    tenantId: 'unit-synth-fallback-tenant',
    userId: 'unit-test',
  });

  assert.equal(result.decision.nemotronSynthesis.mode, 'deterministic-fallback');
  assert.equal(result.decision.nemotronSynthesis.requestId, null);
  assert.match(result.decision.nemotronSynthesis.unavailableReason, /no usable receipt/i);
});

test('enterprise trial rejects permissive synthesis when worker model evidence fell back', async () => {
  const { runEnterpriseTrial } = await import('../lib/trialOrchestrator.js');
  const result = await runEnterpriseTrial({
    missionStatement: 'Evaluate RouteGuard AI for complaint triage before signing',
    caseId: 'safety-ops-complaint-triage',
    integrations: {
      openShell: { skip: true },
      stripe: {
        available: true,
        create: async () => ({
          mode: 'live',
          checkout: { id: 'cs_test_permissive_synthesis_guard', status: 'open' },
          retrieval: { id: 'cs_test_permissive_synthesis_guard', status: 'open' },
        }),
      },
      nemotron: {
        available: true,
        classify: async () => ({
          ok: true,
          requestId: 'chatcmpl-malformed-classification',
          text: JSON.stringify({ status: 'ok', note: 'not classifications' }),
        }),
        synthesize: async () => ({
          requestId: 'chatcmpl-too-permissive-synthesis',
          latencyMs: 12,
          mode: 'live',
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
          verificationStatus: 'verified',
          enforcementEngine: 'policy-gate',
          attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
          cap: caseDef.policyEnvelope.spendCap,
          policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
        }),
      },
    },
    tenantId: 'unit-permissive-synthesis-tenant',
    userId: 'unit-test',
  });

  assert.equal(result.workerResult.evidence.classificationMethod.mode, 'deterministic-fallback');
  assert.equal(result.decision.evidence.completeness.blocking, true);
  assert.equal(result.decision.nemotronSynthesis.verdict, 'CONTINUE');
  assert.equal(result.decision.verdict, 'REVISE');
  assert.equal(result.decision.synthesisRejected, true);
  assert.match(result.decision.businessCase, /Do not sign or expand yet/);
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
        profitability: { netValue: 2669, baselineCost: 3036, agentCost: 367 },
        wasteRatio: { ratio: 0.05 },
        riskAdjustedROI: { multiple: 6.18 },
        throughputUplift: { multiple: 7 },
        annualizedProjection: { annualValue: 32028, vendorAnnualAsk: 14400 },
        opportunityCost: { value: 3738, hoursSaved: 30.1 },
        timeToValue: { seconds: 0.9 },
        costPerUnit: { baseline: 9.2, agent: 1.11 },
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
  assert.equal(history.cycles[0].provenance.mode, 'observed_trial');
  assert.ok(history.renewal, 'has renewal recommendation');
});

test('seeded renewal history is labeled illustrative and distinct from observed trial cycles', async () => {
  const { seedIllustrativeRenewalHistory, getRenewalHistory, getAllVendorRelationships, clearLedger } = await import('../lib/renewalLedger.js');
  const { getCaseById } = await import('../lib/enterpriseCases.js');
  const caseDef = getCaseById('safety-ops-complaint-triage');
  const tenantId = `unit-renewal-seed-${Date.now()}`;

  clearLedger({ tenantId });
  seedIllustrativeRenewalHistory(caseDef.id, caseDef, { tenantId });

  const history = getRenewalHistory(caseDef.id, { tenantId });
  assert.ok(history.cycles.length > 0);
  assert.equal(history.cycles[0].provenance.mode, 'illustrative_seed');
  assert.equal(history.cycles[0].provenance.validationStatus, 'illustrative_not_observed');
  assert.match(history.cycles[0].runId, /^seed-run-/);

  const [relationship] = getAllVendorRelationships({ tenantId });
  assert.equal(relationship.historyMode, 'illustrative_seed');
  assert.equal(relationship.illustrativeCycles, relationship.cycleCount);
});

test('proof report exposes masked audit surface', async () => {
  const { GET } = await import('../app/api/proof-report/route.js');
  const response = await GET(new Request('http://localhost/api/proof-report'));
  assert.equal(response.status, 200);
  const report = await response.json();

  assert.equal(report.ok, true);
  assert.equal(report.proofSurfaces.primaryRoute, '/trial');
  assert.equal(report.proofSurfaces.spend.includes('Stripe Checkout receipt'), true);
  assert.ok(report.workloadEvidence.rowCount > 0, 'reports workload row count');
  assert.match(report.workloadEvidence.sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.cases.length, 4);
  assert.equal(JSON.stringify(report).includes('sk_test_'), false);
  assert.equal(JSON.stringify(report).includes('nvapi-'), false);
});
