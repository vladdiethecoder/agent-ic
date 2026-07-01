import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

function verifiedOpenShellReceipt(caseDef, suffix = 'unit') {
  return {
    enforcementType: 'container-network-policy',
    sandbox: `agent-ic-${caseDef.domainKey}-${suffix}`,
    receipt: `openshell-block-${Date.now()}`,
    proof: {
      engine: 'NVIDIA OpenShell',
      enforcementLevel: 'container network interception',
      policyFile: 'openshell/policy-agent-ic.yaml',
      genuineExternal: true,
    },
  };
}

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
        checkout: { id: 'cs_live_enterprise_hermes_receipt', status: 'open', livemode: true, amount_total: 10000 },
        retrieval: { id: 'cs_live_enterprise_hermes_receipt', status: 'open', livemode: true, amount_total: 10000 },
        spendCapDollars: 100,
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
        verificationStatus: 'verified',
        enforcementEngine: 'NVIDIA OpenShell',
        attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
        cap: caseDef.policyEnvelope.spendCap,
        policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
        ...verifiedOpenShellReceipt(caseDef),
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
        skillPlan: ['governed-agentic-service-trial-v1', 'official/payments/stripe-link-cli'],
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
    approvalContext: {
      required: true,
      approval: {
        id: 'appr_unit_prod_access_1234567890',
        status: 'approved',
        caseId: 'safety-ops-complaint-triage',
        spendCap: 100,
        decidedAt: new Date().toISOString(),
        decidedByRole: 'finance_approver',
      },
    },
    tenantId: 'unit-hermes-tenant',
    userId: 'unit-test',
  });

  assert.equal(result.hermesExecutionReceipt.state, 'recorded');
  assert.equal(result.hermesExecutionReceipt.receiptVerified, true);
  assert.equal(result.hermesExecutionReceipt.skillSource, 'nemohermes-sandbox');
  assert.equal(result.hermesExecutionReceipt.sandboxId, 'agent-ic-hermes');
  assert.match(result.hermesExecutionReceipt.taskIdMasked, /^hermes-sessi.*1234567890$|^hermes-sessi.*7890$/);
  assert.equal(result.playbook.hermesNative, true);
  assert.equal(result.spendApproval.status, 'approved');
  assert.equal(result.productionAccessDecision.approved, true);
  assert.equal(result.productionAccessDecision.status, 'approved');
  assert.equal(result.productionAccessDecision.scope, 'scoped_production_access');
  assert.equal(result.policyBlock.result.allowedAction.status, 200);
  assert.equal(result.policyBlock.result.allowedAction.decision, 'allowed');
  assert.equal(result.playbook.openShellVerified, true);
  assert.equal(result.playbook.enforcementMode, 'NVIDIA OpenShell');
  assert.ok(result.playbook.steps.some((step) => step.includes('OpenShell sandbox') && step.includes('container network policy')));
});

test('enterprise trial denies production access for uncorrelated spend approval', async () => {
  const { runEnterpriseTrial } = await import('../lib/trialOrchestrator.js');
  const integrations = {
    openShell: { skip: true },
    stripe: {
      available: true,
      create: async () => ({
        mode: 'live',
        checkout: { id: 'cs_live_enterprise_bad_approval', status: 'open', livemode: true, amount_total: 10000 },
        retrieval: { id: 'cs_live_enterprise_bad_approval', status: 'open', livemode: true, amount_total: 10000 },
        spendCapDollars: 100,
      }),
    },
    nemotron: {
      available: true,
      classify: async () => ({
        ok: true,
        requestId: 'chatcmpl-enterprise-bad-approval-worker',
        text: JSON.stringify(Array.from({ length: 12 }, () => (
          { queue: 'technical', confidence: 0.95, rationale: 'sample classification' }
        ))),
      }),
      synthesize: async () => ({
        requestId: 'chatcmpl-enterprise-bad-approval',
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
        verificationStatus: 'verified',
        enforcementEngine: 'NVIDIA OpenShell',
        attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
        cap: caseDef.policyEnvelope.spendCap,
        policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
        ...verifiedOpenShellReceipt(caseDef),
      }),
    },
    hermes: {
      available: true,
      dispatch: async () => ({
        ok: true,
        taskId: 'hermes-session-unit-bad-approval-1234567890',
        hermesSessionId: 'unit-bad-approval-1234567890',
        skillSource: 'hermes-cli',
        provider: 'hermes-cli',
        skillPlan: ['hermes-agent'],
        outputSha256: '9'.repeat(64),
        outputSummary: 'Hermes receipt recorded for approval correlation test.',
      }),
    },
  };

  const result = await runEnterpriseTrial({
    missionStatement: 'Evaluate RouteGuard AI for complaint triage before signing',
    caseId: 'safety-ops-complaint-triage',
    integrations,
    requireLiveProof: true,
    approvalContext: {
      required: true,
      approval: {
        id: 'appr_unit_bad_approval_1234567890',
        status: 'approved',
        caseId: 'security-critical-cve-triage',
        spendCap: 100,
        decidedAt: new Date().toISOString(),
        decidedByRole: 'finance_approver',
      },
    },
    tenantId: 'unit-bad-approval-tenant',
    userId: 'unit-test',
  });

  assert.equal(result.productionAccessDecision.approved, false);
  assert.equal(result.productionAccessDecision.evidence.approvalVerified, false);
  assert.match(result.productionAccessDecision.blockers.join('; '), /production spend\/access approval missing/);
});

test('enterprise trial denies production access when evidence artifacts cannot persist', async () => {
  const { runEnterpriseTrial } = await import('../lib/trialOrchestrator.js');
  const previousStoreRoot = process.env.AGENT_IC_STORE_ROOT;
  const dir = await mkdtemp(path.join(tmpdir(), 'agent-ic-evidence-fail-'));
  const blockedStoreRoot = path.join(dir, 'store-file');
  await writeFile(blockedStoreRoot, 'not a directory');

  try {
    process.env.AGENT_IC_STORE_ROOT = blockedStoreRoot;
    const result = await runEnterpriseTrial({
      missionStatement: 'Evaluate RouteGuard AI for complaint triage before signing',
      caseId: 'safety-ops-complaint-triage',
      integrations: {
        openShell: { skip: true },
        stripe: {
          available: true,
          create: async () => ({
            mode: 'live',
            checkout: { id: 'cs_live_enterprise_no_evidence_artifacts', status: 'open', livemode: true, amount_total: 10000 },
            retrieval: { id: 'cs_live_enterprise_no_evidence_artifacts', status: 'open', livemode: true, amount_total: 10000 },
            spendCapDollars: 100,
          }),
        },
        nemotron: {
          available: true,
          classify: async () => ({
            ok: true,
            requestId: 'chatcmpl-enterprise-no-evidence-worker',
            text: JSON.stringify(Array.from({ length: 12 }, () => (
              { queue: 'technical', confidence: 0.95, rationale: 'sample classification' }
            ))),
          }),
          synthesize: async () => ({
            requestId: 'chatcmpl-enterprise-no-evidence',
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
            verificationStatus: 'verified',
            enforcementEngine: 'NVIDIA OpenShell',
            attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
            cap: caseDef.policyEnvelope.spendCap,
            policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
            ...verifiedOpenShellReceipt(caseDef),
          }),
        },
        hermes: {
          available: true,
          dispatch: async () => ({
            ok: true,
            taskId: 'hermes-session-unit-no-evidence-1234567890',
            hermesSessionId: 'unit-no-evidence-1234567890',
            skillSource: 'hermes-cli',
            provider: 'hermes-cli',
            skillPlan: ['hermes-agent'],
            outputSha256: '8'.repeat(64),
            outputSummary: 'Hermes receipt recorded for evidence persistence test.',
          }),
        },
      },
      requireLiveProof: true,
      approvalContext: {
        required: true,
        approval: {
          id: 'appr_unit_no_evidence_1234567890',
          status: 'approved',
          caseId: 'safety-ops-complaint-triage',
          spendCap: 100,
          decidedAt: new Date().toISOString(),
          decidedByRole: 'finance_approver',
        },
      },
      tenantId: 'unit-no-evidence-tenant',
      userId: 'unit-test',
    });

    assert.equal(result.evidenceArtifacts.length, 0);
    assert.equal(result.productionAccessDecision.approved, false);
    assert.equal(result.productionAccessDecision.evidence.evidenceArtifactsVerified, false);
    assert.match(result.productionAccessDecision.blockers.join('; '), /evidence artifacts missing or unverified/);
  } finally {
    if (previousStoreRoot === undefined) delete process.env.AGENT_IC_STORE_ROOT;
    else process.env.AGENT_IC_STORE_ROOT = previousStoreRoot;
  }
});

test('enterprise trial carries approved spend context into renewal evidence', async () => {
  const { runEnterpriseTrial } = await import('../lib/trialOrchestrator.js');
  const { getRenewalHistory, clearLedger } = await import('../lib/renewalLedger.js');
  const tenantId = `unit-approval-carry-${Date.now()}`;
  clearLedger({ tenantId });
  const approval = {
    id: 'appr_unit_approved_1234567890',
    status: 'approved',
    caseId: 'safety-ops-complaint-triage',
    spendCap: 100,
    decidedAt: new Date().toISOString(),
    decidedByRole: 'finance_approver',
  };
  const result = await runEnterpriseTrial({
    missionStatement: 'Evaluate RouteGuard AI for complaint triage before signing',
    caseId: 'safety-ops-complaint-triage',
    approvalContext: { required: true, approval },
    integrations: {
      openShell: { skip: true },
      nemotron: {
        available: true,
        classify: async () => ({
          ok: true,
          requestId: 'chatcmpl-enterprise-approval-carry-worker',
          text: JSON.stringify(Array.from({ length: 12 }, () => (
            { queue: 'technical', confidence: 0.95, rationale: 'sample classification' }
          ))),
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
          enforcementMode: 'local-deny-by-default-policy-gate',
          attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
          cap: caseDef.policyEnvelope.spendCap,
          policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
        }),
      },
    },
    tenantId,
    userId: 'unit-test',
  });

  assert.equal(result.spendApproval.required, true);
  assert.equal(result.spendApproval.status, 'approved');
  assert.equal(result.spendApproval.id, approval.id);
  assert.equal(result.spendApproval.decidedByRole, 'finance_approver');
  assert.equal(result.productionAccessDecision.approved, false);
  assert.match(result.productionAccessDecision.blockers.join('; '), /live-mode spend receipt missing|Hermes dispatch receipt missing/);
  const history = getRenewalHistory(result.caseId, { tenantId });
  assert.equal(history.cycles[0].spendApproval.status, 'approved');
  assert.equal(history.cycles[0].spendApproval.required, true);
  assert.equal(history.cycles[0].productionAccessDecision.approved, false);
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

test('enterprise trial fails closed when strict provider proof lacks Hermes receipt', async () => {
  const { runEnterpriseTrial } = await import('../lib/trialOrchestrator.js');
  await assert.rejects(
    runEnterpriseTrial({
      missionStatement: 'Evaluate RouteGuard AI for complaint triage before signing',
      caseId: 'safety-ops-complaint-triage',
      integrations: {
        openShell: { skip: true },
        stripe: {
          available: true,
          create: async () => ({
            mode: 'live',
            checkout: { id: 'cs_live_unit_strict_hermes', livemode: true, amount_total: 10000 },
            retrieval: { id: 'cs_live_unit_strict_hermes', livemode: true, amount_total: 10000 },
            spendCapDollars: 100,
          }),
        },
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
            verificationStatus: 'verified',
            enforcementEngine: 'NVIDIA OpenShell',
            attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
            cap: caseDef.policyEnvelope.spendCap,
            policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
            ...verifiedOpenShellReceipt(caseDef),
          }),
        },
      },
      requireLiveProof: true,
      tenantId: 'unit-hermes-fail-tenant',
      userId: 'unit-test',
    }),
    /Strict provider proof required.*Hermes dispatch receipt/
  );
});

test('enterprise trial strict provider proof rejects unverified Hermes receipts', async () => {
  const { runEnterpriseTrial } = await import('../lib/trialOrchestrator.js');
  await assert.rejects(
    runEnterpriseTrial({
      missionStatement: 'Evaluate RouteGuard AI for complaint triage before signing',
      caseId: 'safety-ops-complaint-triage',
      integrations: {
        openShell: { skip: true },
        stripe: {
          available: true,
          create: async () => ({
            mode: 'live',
            checkout: { id: 'cs_live_unit_weak_hermes', livemode: true, amount_total: 10000 },
            retrieval: { id: 'cs_live_unit_weak_hermes', livemode: true, amount_total: 10000 },
            spendCapDollars: 100,
          }),
        },
        nemotron: {
          available: true,
          classify: async () => ({
            ok: true,
            requestId: 'chatcmpl-enterprise-weak-hermes-worker',
            text: JSON.stringify(Array.from({ length: 12 }, () => (
              { queue: 'technical', confidence: 0.95, rationale: 'sample classification' }
            ))),
          }),
          synthesize: async () => ({
            requestId: 'chatcmpl-enterprise-weak-hermes',
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
            verificationStatus: 'verified',
            enforcementEngine: 'NVIDIA OpenShell',
            attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
            cap: caseDef.policyEnvelope.spendCap,
            policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
            ...verifiedOpenShellReceipt(caseDef),
          }),
        },
        hermes: {
          available: true,
          dispatch: async () => ({
            ok: true,
            skillSource: 'nemohermes-sandbox',
            provider: 'nemohermes',
            sandboxId: 'agent-ic-hermes',
            outputSummary: 'Weak Hermes response omitted session id, output hash, and selected skill proof.',
          }),
        },
      },
      requireLiveProof: true,
      approvalContext: {
        required: true,
        approval: {
          id: 'appr_unit_weak_hermes_1234567890',
          status: 'approved',
          caseId: 'safety-ops-complaint-triage',
          spendCap: 100,
          decidedAt: new Date().toISOString(),
          decidedByRole: 'finance_approver',
        },
      },
      tenantId: 'unit-strict-weak-hermes-fail-tenant',
      userId: 'unit-test',
    }),
    /Strict provider proof required.*Hermes dispatch receipt/
  );
});

test('enterprise trial strict provider proof rejects weak Nemotron classification receipts', async () => {
  const { runEnterpriseTrial } = await import('../lib/trialOrchestrator.js');
  await assert.rejects(
    runEnterpriseTrial({
      missionStatement: 'Evaluate RouteGuard AI for complaint triage before signing',
      caseId: 'safety-ops-complaint-triage',
      integrations: {
        openShell: { skip: true },
        stripe: {
          available: true,
          create: async () => ({
            mode: 'live',
            checkout: { id: 'cs_live_unit_weak_nemotron', livemode: true, amount_total: 10000 },
            retrieval: { id: 'cs_live_unit_weak_nemotron', livemode: true, amount_total: 10000 },
            spendCapDollars: 100,
          }),
        },
        nemotron: {
          available: true,
          classify: async () => ({
            ok: true,
            requestId: 'unit-not-provider-shaped',
            text: JSON.stringify(Array.from({ length: 12 }, () => (
              { queue: 'technical', confidence: 0.95, rationale: 'sample classification' }
            ))),
          }),
          synthesize: async () => ({
            requestId: 'chatcmpl-enterprise-weak-nemotron-synth',
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
            verificationStatus: 'verified',
            enforcementEngine: 'NVIDIA OpenShell',
            attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
            cap: caseDef.policyEnvelope.spendCap,
            policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
            ...verifiedOpenShellReceipt(caseDef),
          }),
        },
        hermes: {
          available: true,
          dispatch: async () => ({
            ok: true,
            skillSource: 'hermes-cli',
            hermesSessionId: 'unit-hermes-session-strict-weak-nemotron',
            skillPlan: ['hermes-agent'],
            outputSha256: 'e'.repeat(64),
            outputSummary: 'Hermes receipt recorded for strict proof test.',
          }),
        },
      },
      requireLiveProof: true,
      approvalContext: {
        required: true,
        approval: {
          id: 'appr_unit_weak_nemotron_1234567890',
          status: 'approved',
          caseId: 'safety-ops-complaint-triage',
          spendCap: 100,
          decidedAt: new Date().toISOString(),
          decidedByRole: 'finance_approver',
        },
      },
      tenantId: 'unit-strict-weak-nemotron-fail-tenant',
      userId: 'unit-test',
    }),
    /Strict provider proof required.*Nemotron classification request id/
  );
});

test('enterprise trial strict provider proof rejects self-labeled OpenShell receipts', async () => {
  const { runEnterpriseTrial } = await import('../lib/trialOrchestrator.js');
  await assert.rejects(
    runEnterpriseTrial({
      missionStatement: 'Evaluate RouteGuard AI for complaint triage before signing',
      caseId: 'safety-ops-complaint-triage',
      integrations: {
        openShell: { skip: true },
        stripe: {
          available: true,
          create: async () => ({
            mode: 'live',
            checkout: { id: 'cs_live_unit_weak_openshell', livemode: true, amount_total: 10000 },
            retrieval: { id: 'cs_live_unit_weak_openshell', livemode: true, amount_total: 10000 },
            spendCapDollars: 100,
          }),
        },
        nemotron: {
          available: true,
          classify: async () => ({
            ok: true,
            requestId: 'chatcmpl-enterprise-weak-openshell-worker',
            text: JSON.stringify(Array.from({ length: 12 }, () => (
              { queue: 'technical', confidence: 0.95, rationale: 'sample classification' }
            ))),
          }),
          synthesize: async () => ({
            requestId: 'chatcmpl-enterprise-weak-openshell-synth',
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
            verificationStatus: 'verified',
            enforcementEngine: 'NVIDIA OpenShell',
            attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
            cap: caseDef.policyEnvelope.spendCap,
            policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
          }),
        },
        hermes: {
          available: true,
          dispatch: async () => ({
            ok: true,
            skillSource: 'hermes-cli',
            hermesSessionId: 'unit-hermes-session-strict-weak-openshell',
            skillPlan: ['hermes-agent'],
            outputSha256: 'f'.repeat(64),
            outputSummary: 'Hermes receipt recorded for strict proof test.',
          }),
        },
      },
      requireLiveProof: true,
      approvalContext: {
        required: true,
        approval: {
          id: 'appr_unit_weak_openshell_1234567890',
          status: 'approved',
          caseId: 'safety-ops-complaint-triage',
          spendCap: 100,
          decidedAt: new Date().toISOString(),
          decidedByRole: 'finance_approver',
        },
      },
      tenantId: 'unit-strict-weak-openshell-fail-tenant',
      userId: 'unit-test',
    }),
    /Strict provider proof required.*OpenShell verified 403 policy receipt/
  );
});

test('enterprise trial strict provider proof requires spend receipt before approval', async () => {
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
            requestId: 'chatcmpl-enterprise-no-stripe-worker',
            text: JSON.stringify(Array.from({ length: 12 }, () => (
              { queue: 'technical', confidence: 0.95, rationale: 'sample classification' }
            ))),
          }),
        },
        policyGate: {
          available: true,
          evaluate: async ({ caseDef }) => ({
            blocked: true,
            status: 403,
            enforced: true,
            verificationStatus: 'verified',
            enforcementEngine: 'NVIDIA OpenShell',
            attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
            cap: caseDef.policyEnvelope.spendCap,
            policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
            ...verifiedOpenShellReceipt(caseDef),
          }),
        },
        hermes: {
          available: true,
          dispatch: async () => ({
            ok: true,
            skillSource: 'hermes-cli',
            hermesSessionId: 'unit-hermes-session-strict-no-stripe',
            skillPlan: ['hermes-agent'],
            outputSha256: 'b'.repeat(64),
            outputSummary: 'Hermes receipt recorded for strict proof test.',
          }),
        },
      },
      requireLiveProof: true,
      tenantId: 'unit-strict-stripe-fail-tenant',
      userId: 'unit-test',
    }),
    /Strict provider proof required.*Stripe live-mode Checkout receipt/
  );
});

test('enterprise trial strict provider proof rejects non-production Stripe receipts', async () => {
  const { runEnterpriseTrial } = await import('../lib/trialOrchestrator.js');
  await assert.rejects(
    runEnterpriseTrial({
      missionStatement: 'Evaluate RouteGuard AI for complaint triage before signing',
      caseId: 'safety-ops-complaint-triage',
      integrations: {
        openShell: { skip: true },
        stripe: {
          available: true,
          create: async () => ({
            mode: 'non-production',
            checkout: { id: 'cs_test_unit_strict_non_production', status: 'open' },
            retrieval: { id: 'cs_test_unit_strict_non_production', status: 'open' },
          }),
        },
        nemotron: {
          available: true,
          classify: async () => ({
            ok: true,
            requestId: 'chatcmpl-enterprise-test-stripe-worker',
            text: JSON.stringify(Array.from({ length: 12 }, () => (
              { queue: 'technical', confidence: 0.95, rationale: 'sample classification' }
            ))),
          }),
          synthesize: async () => ({
            requestId: 'chatcmpl-enterprise-test-stripe',
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
            verificationStatus: 'verified',
            enforcementEngine: 'NVIDIA OpenShell',
            attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
            cap: caseDef.policyEnvelope.spendCap,
            policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
            ...verifiedOpenShellReceipt(caseDef),
          }),
        },
        hermes: {
          available: true,
          dispatch: async () => ({
            ok: true,
            skillSource: 'hermes-cli',
            hermesSessionId: 'unit-hermes-session-strict-test-stripe',
            skillPlan: ['hermes-agent'],
            outputSha256: 'c'.repeat(64),
            outputSummary: 'Hermes receipt recorded for strict proof test.',
          }),
        },
      },
      requireLiveProof: true,
      approvalContext: {
        required: true,
        approval: {
          id: 'appr_unit_test_stripe_1234567890',
          status: 'approved',
          caseId: 'safety-ops-complaint-triage',
          spendCap: 100,
          decidedAt: new Date().toISOString(),
          decidedByRole: 'finance_approver',
        },
      },
      tenantId: 'unit-strict-test-stripe-fail-tenant',
      userId: 'unit-test',
    }),
    /Strict provider proof required.*Stripe live-mode Checkout receipt/
  );
});

test('enterprise trial strict provider proof requires Stripe retrieval correlation', async () => {
  const { runEnterpriseTrial } = await import('../lib/trialOrchestrator.js');
  await assert.rejects(
    runEnterpriseTrial({
      missionStatement: 'Evaluate RouteGuard AI for complaint triage before signing',
      caseId: 'safety-ops-complaint-triage',
      integrations: {
        openShell: { skip: true },
        stripe: {
          available: true,
          create: async () => ({
            mode: 'live',
            checkout: { id: 'cs_live_unit_unverified_retrieval', status: 'open', livemode: true, amount_total: 10000 },
            retrieval: { id: 'cs_live_different_session', status: 'open', livemode: true, amount_total: 10000 },
            spendCapDollars: 100,
          }),
        },
        nemotron: {
          available: true,
          classify: async () => ({
            ok: true,
            requestId: 'chatcmpl-enterprise-unverified-stripe-worker',
            text: JSON.stringify(Array.from({ length: 12 }, () => (
              { queue: 'technical', confidence: 0.95, rationale: 'sample classification' }
            ))),
          }),
          synthesize: async () => ({
            requestId: 'chatcmpl-enterprise-unverified-stripe',
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
            verificationStatus: 'verified',
            enforcementEngine: 'NVIDIA OpenShell',
            attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
            cap: caseDef.policyEnvelope.spendCap,
            policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
            ...verifiedOpenShellReceipt(caseDef),
          }),
        },
        hermes: {
          available: true,
          dispatch: async () => ({
            ok: true,
            skillSource: 'hermes-cli',
            hermesSessionId: 'unit-hermes-session-strict-unverified-stripe',
            skillPlan: ['hermes-agent'],
            outputSha256: 'd'.repeat(64),
            outputSummary: 'Hermes receipt recorded for strict proof test.',
          }),
        },
      },
      requireLiveProof: true,
      approvalContext: {
        required: true,
        approval: {
          id: 'appr_unit_unverified_stripe_1234567890',
          status: 'approved',
          caseId: 'safety-ops-complaint-triage',
          spendCap: 100,
          decidedAt: new Date().toISOString(),
          decidedByRole: 'finance_approver',
        },
      },
      tenantId: 'unit-strict-unverified-stripe-fail-tenant',
      userId: 'unit-test',
    }),
    /Strict provider proof required.*Stripe live-mode Checkout receipt/
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
    spendApproval: { required: false, status: 'not_required_for_local_trial' },
    productionAccessDecision: {
      approved: false,
      status: 'not_approved',
      scope: 'governed_trial_only',
      recommendedAction: 'keep governed',
      blockers: ['production spend/access approval missing'],
    },
    roiMethodology: {
      baseline: { inputs: { cases: { value: 330 } }, result: { totalCost: 3036 } },
      agent: { inputs: { humanReviewCases: { value: 29 } }, result: { totalCost: 367 } },
      computed: { netValue: { formula: 'baseline.totalCost - agent.totalCost', value: 2669, unit: 'USD' } },
    },
  });

  const history = getRenewalHistory(caseDef.id, { tenantId });
  assert.equal(history.cycles.length, 1);
  assert.equal(history.cycles[0].verdict, 'CONTINUE');
  assert.equal(history.cycles[0].provenance.mode, 'observed_trial');
  assert.equal(history.cycles[0].spendApproval.status, 'not_required_for_local_trial');
  assert.equal(history.cycles[0].productionAccessDecision.approved, false);
  assert.equal(history.cycles[0].roiMethodology.computed.netValue.value, 2669);
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
  assert.equal(history.cycles[0].roiMethodology.computed.netValue.formula, 'baseline.totalCost - agent.totalCost');

  const [relationship] = getAllVendorRelationships({ tenantId });
  assert.equal(relationship.historyMode, 'illustrative_seed');
  assert.equal(relationship.illustrativeCycles, relationship.cycleCount);
});

test('proof report exposes masked audit surface', async () => {
  const { recordTrialRun, clearTrialRuns } = await import('../lib/trialStore.js');
  const audit = await import('../lib/auditStore.js');
  const { getCaseById } = await import('../lib/enterpriseCases.js');
  const caseDef = getCaseById('safety-ops-complaint-triage');
  clearTrialRuns({ tenantId: 'local-tenant' });
  audit.resetAudit();
  recordTrialRun({
    tenantId: 'local-tenant',
    userId: 'proof-test',
    result: {
      runId: 'trial_proof_latest_1234567890',
      caseId: caseDef.id,
      domain: caseDef.domain,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 1234,
      vendor: caseDef.vendor,
      buyer: caseDef.buyer,
      spendEnvelope: { cap: 100, currency: 'USD' },
      stripe: { mode: 'non-production', testMode: true, sessionId: 'cs_test_latest_proof_1234567890', amountDollars: 100 },
      spendApproval: { required: true, status: 'approved', id: 'appr_latest_proof_1234567890', spendCap: 100, caseId: caseDef.id, decidedAt: new Date().toISOString(), decidedByRole: 'finance_approver', evidence: 'approved spend envelope matched before trial execution' },
      policyBlock: { result: { blocked: true, status: 403, enforcementEngine: 'NVIDIA OpenShell', verificationStatus: 'verified', attemptedAmount: 150, cap: 100 }, blockedTool: caseDef.policyEnvelope.blockedTool },
      evidenceArtifacts: [{ artifactId: 'artifact_latest', kind: 'trial-evidence', sha256: 'a'.repeat(64), bytes: 256 }],
      workerResult: { evidence: { casesProcessed: 330, autoRouted: 301, humanReviewQueue: 29, accuracy: 0.91, falsePositiveRate: 0.01, dataHash: 'abcdef1234567890', source: 'NHTSA', serviceRuntimeMs: 1000, classificationMethod: { mode: 'nemotron-sample-plus-pattern-extension', nemotronRequestId: 'chatcmpl-proof-latest-1234567890' } } },
      decision: { verdict: 'CONTINUE', confidence: 'high', businessCase: 'Continue governed pilot.', metrics: { profitability: { netValue: 2669 }, riskAdjustedROI: { multiple: 6.18 }, wasteRatio: { ratio: 0.05 }, annualizedProjection: { annualValue: 32028 } }, nemotronSynthesis: { mode: 'live', requestId: 'chatcmpl-proof-synth-1234567890' } },
      roiMethodology: {
        baseline: { inputs: { cases: { value: 330 } }, result: { totalCost: 3036, totalHours: 33 } },
        agent: { inputs: { humanReviewCases: { value: 29 } }, result: { totalCost: 367, agentHours: 3 } },
        computed: { netValue: { formula: 'baseline.totalCost - agent.totalCost', value: 2669, unit: 'USD' } },
        measurementNote: 'Cost and ROI figures are materialized from current trial evidence.',
      },
      playbook: { name: 'Proof playbook', version: '1.0.0', steps: ['step'] },
      productionAccessDecision: { approved: false, status: 'not_approved', scope: 'governed_trial_only', recommendedAction: 'keep governed', blockers: ['live-mode spend receipt missing'], evidence: { stripeTestMode: true } },
    },
  });
  audit.appendAudit({
    tenantId: 'local-tenant',
    userId: 'proof-test',
    role: 'operator',
    actor: 'Agent IC',
    kind: 'trial',
    action: 'enterprise_trial_completed',
    runId: 'trial_proof_latest_1234567890',
    caseId: caseDef.id,
    detail: 'Trial trial_proof_latest_1234567890 completed with CONTINUE',
    verdict: 'CONTINUE',
    policyBlocked: true,
    evidenceHash: 'abcdef1234567890',
    spendApprovalStatus: 'approved',
    productionAccessApproved: false,
    productionAccessStatus: 'not_approved',
    productionAccessScope: 'governed_trial_only',
    productionAccessBlockers: ['live-mode spend receipt missing'],
  });
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
  assert.equal(report.latestTrial.runId, 'trial_proof_latest_1234567890');
  assert.equal(report.latestTrial.spendApproval.status, 'approved');
  assert.equal(report.latestTrial.roiMethodology.computed.netValue.formula, 'baseline.totalCost - agent.totalCost');
  assert.equal(report.latestTrial.roiMethodology.computed.netValue.value, 2669);
  assert.equal(report.latestTrial.productionAccessDecision.approved, false);
  assert.match(report.latestTrial.productionAccessDecision.blockers.join('; '), /live-mode spend receipt missing/);
  assert.equal(report.latestAudit[0].productionAccessApproved, false);
  assert.equal(report.latestAudit[0].productionAccessStatus, 'not_approved');
  assert.match(report.latestAudit[0].productionAccessBlockers.join('; '), /live-mode spend receipt missing/);
  assert.equal(report.latestAudit[0].runId.includes('trial_proof_latest_1234567890'), false);
  assert.equal(JSON.stringify(report).includes('cs_test_latest_proof_1234567890'), false);
  assert.equal(JSON.stringify(report).includes('sk_test_'), false);
  assert.equal(JSON.stringify(report).includes('nvapi-'), false);
});
