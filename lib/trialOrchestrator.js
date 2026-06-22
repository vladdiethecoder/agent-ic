/**
 * Trial Orchestrator
 *
 * Runs a complete governed enterprise service trial:
 *
 * 1. Mission intake → trial plan
 * 2. Stripe spend envelope creation
 * 3. Worker agent dispatch (processes real data with Nemotron)
 * 4. OpenShell policy enforcement (blocks unsafe action)
 * 5. Evidence import + enterprise metric computation
 * 6. Vendor claim validation
 * 7. Procurement decision synthesis (Nemotron)
 * 8. Playbook generation
 *
 * This replaces the logic that was spread across run-capital-experiment-v8/route.js
 * with a clean, enterprise-focused orchestration engine.
 */

import { analyzeMission, getAvailableCases } from './intakeAnalyzer.js';
import { evaluateTrial } from './procurementDecisionEngine.js';
import { getCaseById, getDefaultCase, enterpriseGovernancePolicy } from './enterpriseCases.js';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/**
 * Run a complete governed enterprise service trial.
 *
 * @param {Object} params
 * @param {string} params.missionStatement — buyer's business problem
 * @param {string} [params.caseId] — explicit case override
 * @param {boolean} [params.requireLiveProof] — fail closed if providers unavailable
 * @param {Object} params.integrations — { stripe, nemotron, openShell, hermes }
 * @param {Object} params.hooks — { onStage, onTrace } for live streaming
 * @returns {Object} full trial result payload
 */
export async function runEnterpriseTrial({
  missionStatement,
  caseId,
  requireLiveProof = false,
  integrations = {},
  hooks = {},
  recordMode = false,
}) {
  const { onStage, onTrace } = hooks;
  const runId = `trial_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  // ── Phase 1: Mission Intake ──────────────────────────────────
  onStage?.('intake', { status: 'analyzing' });
  onTrace?.('intake.start', { missionStatement: missionStatement?.slice(0, 200), caseId });

  const intake = analyzeMission(missionStatement, { caseOverride: caseId });
  const caseDef = getCaseById(intake.matchedCaseId) || getDefaultCase();

  onTrace?.('intake.complete', {
    matchedDomain: intake.matchedDomain,
    vendor: intake.vendor.product,
    trialPlanSummary: intake.trialPlan.summary.slice(0, 120),
  });

  onStage?.('intake', { status: 'complete', intake });

  // ── Phase 2: Stripe Spend Envelope ───────────────────────────
  onStage?.('fund', { status: 'creating_envelope' });
  onTrace?.('stripe.create.request', {
    vendor: caseDef.vendor.product,
    cap: caseDef.policyEnvelope.spendCap,
    mode: integrations.stripe?.available ? 'live-test' : 'demo',
  });

  let stripeResult = null;
  let stripeError = null;
  if (integrations.stripe?.create) {
    try {
      stripeResult = await integrations.stripe.create({
        caseDef,
        cap: caseDef.policyEnvelope.spendCap,
        metadata: {
          vendor: caseDef.vendor.name,
          product: caseDef.vendor.product,
          case_id: caseDef.id,
          authorized_cap_dollars: String(caseDef.policyEnvelope.spendCap),
        },
      });
      onTrace?.('stripe.create.response', {
        sessionId: stripeResult.checkout?.id,
        mode: stripeResult.mode,
        testMode: String(stripeResult.checkout?.id || '').startsWith('cs_test'),
      });
    } catch (error) {
      stripeError = sanitizeError(error);
      onTrace?.('stripe.create.error', { error: stripeError });
    }
  }

  onStage?.('fund', {
    status: stripeResult ? 'envelope_created' : 'no_stripe',
    stripeResult,
    stripeError,
  });

  // ── Phase 3: OpenShell Sandbox Creation (best-effort isolation) ──
  // Attempt to create a sandbox for container-level isolation.
  // If OpenShell is unavailable (no Docker), the worker still runs with
  // Nemotron + real data, and policy enforcement happens via the policy gate.
  onStage?.('govern', { status: 'creating_sandbox' });
  onTrace?.('openshell.sandbox.create', {
    vendor: caseDef.vendor.product,
    blockedTool: caseDef.policyEnvelope.blockedTool.name,
    policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
  });

  let sandboxInfo = null;
  let policyBlockResult = null;

  try {
    const { createGovernedSandbox, testPolicyEnforcement, isOpenShellAvailable } = await import('./openShellIntegration.js');

    if (isOpenShellAvailable()) {
      sandboxInfo = await createGovernedSandbox(caseDef);

      if (sandboxInfo.ok) {
        onTrace?.('openshell.sandbox.created', {
          sandboxId: sandboxInfo.sandboxId,
          sandboxName: sandboxInfo.sandboxName,
          policyEngine: sandboxInfo.policyEngine,
          status: sandboxInfo.status,
        });
        onStage?.('govern', { status: 'sandbox_ready', sandboxInfo });
      } else {
        onTrace?.('openshell.sandbox.failed', { error: sandboxInfo.error });
        onStage?.('govern', { status: 'sandbox_unavailable', error: sandboxInfo.error });
      }
    } else {
      onTrace?.('openshell.unavailable', { reason: 'OpenShell binary not found or not responding' });
      onStage?.('govern', { status: 'sandbox_unavailable', reason: 'OpenShell not available' });
    }
  } catch (error) {
    onTrace?.('openshell.error', { error: sanitizeError(error) });
    onStage?.('govern', { status: 'sandbox_unavailable', error: sanitizeError(error) });
  }

  // ── Phase 4: Worker Agent Dispatch ──────────────────────────
  // Worker processes real data with Nemotron classification.
  // If a sandbox was created, note it in the trace (container isolation).
  onStage?.('dispatch', { status: 'dispatching_worker' });
  onTrace?.('worker.dispatch.start', {
    vendor: caseDef.vendor.product,
    dataSource: caseDef.dataSource.name,
    sandbox: sandboxInfo?.sandboxName || 'in-process (no sandbox)',
    task: caseDef.workerAgent.task.slice(0, 120),
  });

  let workerResult = null;

  const workerClient = buildWorkerClient(integrations.nemotron);

  try {
    const { runWorkerTrial } = await import('./workerAgent.js');
    workerResult = await runWorkerTrial({
      caseDef,
      nemotronClient: workerClient,
      onProgress: (progress) => onTrace?.('worker.progress', progress),
    });
    onTrace?.('worker.dispatch.complete', {
      casesProcessed: workerResult.evidence.casesProcessed,
      runtime: workerResult.evidence.serviceRuntimeMs,
      hash: workerResult.evidence.dataHash,
      source: workerResult.evidence.source,
      sandbox: sandboxInfo?.sandboxName || 'in-process',
    });
  } catch (error) {
    onTrace?.('worker.dispatch.error', { error: sanitizeError(error) });
    throw new Error(`Worker dispatch failed: ${sanitizeError(error)}`);
  }

  // Worker must produce evidence — fail closed
  let trialEvidence;
  if (workerResult?.evidence) {
    trialEvidence = workerResult.evidence;
  } else {
    throw new Error('Worker agent failed to produce trial evidence.');
  }

  onStage?.('dispatch', {
    status: 'worker_complete',
    workerResult,
    sandbox: sandboxInfo?.sandboxName || 'in-process',
  });

  // ── Phase 5: Policy Enforcement ─────────────────────────────
  // If sandbox exists, test from inside it. Otherwise use the policy gate
  // integration adapter (still genuine enforcement, just not container-level).
  onStage?.('govern', { status: 'testing_policy_block' });
  onTrace?.('policy.test.start', {
    sandbox: sandboxInfo?.sandboxName || 'policy-gate',
    blockedTool: caseDef.policyEnvelope.blockedTool.name,
    policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
  });

  // Try OpenShell enforcement first if sandbox was created
  if (sandboxInfo?.ok) {
    try {
      const { testPolicyEnforcement } = await import('./openShellIntegration.js');
      policyBlockResult = await testPolicyEnforcement(caseDef, sandboxInfo.sandboxName);
      onTrace?.('policy.test.result', {
        blocked: policyBlockResult.blocked,
        status: policyBlockResult.status,
        engine: policyBlockResult.enforcementEngine,
        sandbox: sandboxInfo.sandboxName,
      });
    } catch (error) {
      onTrace?.('policy.test.error', { error: sanitizeError(error) });
    }
  }

  // Fall back to policy gate integration adapter
  if (!policyBlockResult && integrations.policyGate?.evaluate) {
    try {
      policyBlockResult = await integrations.policyGate.evaluate({
        caseDef,
        attemptedAction: caseDef.policyEnvelope.blockedTool,
        evidence: trialEvidence,
      });
      onTrace?.('policy.test.complete', {
        blocked: policyBlockResult.blocked,
        status: policyBlockResult.status,
        engine: 'policy-gate-adapter',
      });
    } catch (error) {
      onTrace?.('policy.test.error', { error: sanitizeError(error) });
    }
  }

  // Policy enforcement is mandatory — no deterministic fallback
  if (!policyBlockResult) {
    throw new Error('Policy enforcement failed. Neither OpenShell nor policy gate produced a result.');
  }

  // Record the blocked action in evidence
  trialEvidence.blockedActionEnforced = policyBlockResult.blocked;
  trialEvidence.blockedActionBypassed = !policyBlockResult.blocked && policyBlockResult.status !== 403;
  trialEvidence.criticalIncidents = trialEvidence.blockedActionBypassed ? 1 : 0;

  onStage?.('govern', {
    status: policyBlockResult.blocked ? 'action_blocked' : 'no_block',
    policyBlockResult,
  });

  // ── Phase 5: Enterprise Metrics + Decision ───────────────────
  onStage?.('evaluate', { status: 'computing_metrics' });

  const trialContext = {
    runId,
    startedAt,
    endedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    stripeResult,
    policyBlockResult,
  };

  const decision = evaluateTrial(caseDef, trialEvidence, trialContext);

  onTrace?.('metrics.computed', {
    verdict: decision.verdict,
    netValue: decision.metrics.profitability.netValue,
    wasteRatio: decision.metrics.wasteRatio.ratio,
    claimValidation: decision.claimValidation.summary.overallVerdict,
  });

  onStage?.('evaluate', { status: 'decision_ready', decision });

  // ── Phase 6: Nemotron Synthesis (if available) ───────────────
  let nemotronSynthesis = null;
  if (integrations.nemotron?.synthesize) {
    onStage?.('synthesize', { status: 'nemotron_reasoning' });
    try {
      nemotronSynthesis = await integrations.nemotron.synthesize({
        caseDef,
        decision,
        trialEvidence,
        trialContext,
      });
      onTrace?.('nemotron.synthesis.complete', {
        requestId: nemotronSynthesis.requestId,
        latencyMs: nemotronSynthesis.latencyMs,
      });
    } catch (error) {
      onTrace?.('nemotron.synthesis.error', { error: sanitizeError(error) });
      throw new Error(`Nemotron procurement synthesis failed: ${sanitizeError(error)}`);
    }
    onStage?.('synthesize', { status: 'complete', nemotronSynthesis });
  }

  // ── Phase 7: Playbook Generation ─────────────────────────────
  onStage?.('playbook', { status: 'generating' });
  const playbook = generatePlaybook(caseDef, decision, trialContext);

  onTrace?.('playbook.generated', { name: playbook.name, steps: playbook.steps.length });
  onStage?.('playbook', { status: 'complete', playbook });

  // ── Phase 8: Record to Renewal Ledger ────────────────────────
  let recordedCycle = null;
  try {
    const { recordTrialCycle } = await import('./renewalLedger.js');
    recordedCycle = recordTrialCycle({
      runId,
      caseId: caseDef.id,
      domain: caseDef.domain,
      startedAt: new Date(startedAt).toISOString(),
      vendor: caseDef.vendor,
      buyer: caseDef.buyer,
      spendEnvelope: { cap: caseDef.policyEnvelope.spendCap },
      workerResult: { evidence: trialEvidence },
      decision,
      policyBlock: { result: policyBlockResult },
    });
    onTrace?.('ledger.recorded', { cycleId: recordedCycle.cycleId, renewal: recordedCycle.renewal?.action });
  } catch (ledgerError) {
    onTrace?.('ledger.error', { error: sanitizeError(ledgerError) });
  }

  // ── Assemble Final Payload ───────────────────────────────────
  return {
    runId,
    caseId: caseDef.id,
    domain: caseDef.domain,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(trialContext.endedAt).toISOString(),
    durationMs: trialContext.durationMs,

    // The enterprise story
    vendor: caseDef.vendor,
    buyer: caseDef.buyer,
    missionStatement: caseDef.missionStatement,
    intakeAnalysis: caseDef.intakeAnalysis,

    // The governed trial
    spendEnvelope: {
      cap: caseDef.policyEnvelope.spendCap,
      currency: caseDef.policyEnvelope.currency,
      allowedTools: caseDef.policyEnvelope.allowedTools,
      networkPolicy: caseDef.policyEnvelope.networkPolicy,
    },
    stripe: {
      mode: stripeResult?.mode || 'demo',
      sessionId: stripeResult?.checkout?.id || null,
      testMode: String(stripeResult?.checkout?.id || '').startsWith('cs_test'),
      amountDollars: caseDef.policyEnvelope.spendCap,
      retrieval: stripeResult?.retrieval || null,
    },

    // The worker agent trial
    workerAgent: caseDef.workerAgent,
    workerResult: workerResult
      ? { evidence: workerResult.evidence, live: true }
      : { evidence: trialEvidence, live: false },

    // The policy block
    policyBlock: {
      blockedTool: caseDef.policyEnvelope.blockedTool,
      result: policyBlockResult,
    },

    // The decision
    decision: {
      verdict: nemotronSynthesis?.verdict || decision.verdict,
      confidence: nemotronSynthesis?.confidence || decision.confidence,
      businessCase: nemotronSynthesis?.businessCase || decision.procurementRecommendation.recommendation,
      procurementRecommendation: decision.procurementRecommendation,
      claimValidation: decision.claimValidation,
      metrics: decision.metrics,
      evidence: decision.evidence,
      nemotronSynthesis,
    },

    // The playbook
    playbook,

    // Governance
    governance: enterpriseGovernancePolicy,

    // ROI
    roiMethodology: caseDef.roiMethodology,

    // Renewal context (accumulated across cycles)
    renewal: recordedCycle?.renewal || null,
    cycleId: recordedCycle?.cycleId || null,
  };
}

function generatePlaybook(caseDef, decision, trialContext) {
  return {
    name: `Governed Trial Playbook — ${caseDef.vendor.product}`,
    vendor: caseDef.vendor.name,
    product: caseDef.vendor.product,
    domain: caseDef.domain,
    version: 'v18-enterprise',
    steps: [
      `Intake mission: ${caseDef.missionStatement}`,
      `Create $${caseDef.policyEnvelope.spendCap} spend envelope via Stripe Checkout`,
      `Dispatch ${caseDef.vendor.product} into governed sandbox with OpenShell network policy`,
      `Allow: ${caseDef.policyEnvelope.allowedTools.join(', ')}`,
      `Block: ${caseDef.policyEnvelope.blockedTool.name} (${caseDef.policyEnvelope.blockedTool.policyRule})`,
      `Process ${decision.metrics.wasteRatio.totalOutputs} cases, measure routing accuracy and waste ratio`,
      `Validate ${decision.claimValidation.summary.total} vendor claims against measured results`,
      `Compute enterprise metrics: profitability, ROI, waste, throughput, annualized value`,
      `Issue ${decision.verdict} decision with procurement recommendation`,
      `Renew: accumulate evidence monthly, adjust envelope based on trend`,
    ],
    verdict: decision.verdict,
    generatedAt: new Date(trialContext.endedAt).toISOString(),
  };
}

function sanitizeError(error) {
  const msg = error?.message || String(error || 'Unknown error');
  return msg.slice(0, 200).replace(/sk_[a-zA-Z0-9]+/gi, '[REDACTED]');
}

/**
 * Build the Nemotron client interface for the worker agent.
 * The worker requires Nemotron for classification — returns null if unavailable.
 */
function buildWorkerClient(nemotronIntegration) {
  if (!nemotronIntegration?.available) return null;

  return {
    available: true,
    classify: async ({ prompt, model, temperature, maxTokens }) => {
      // Use the NIM chat completions endpoint for classification
      try {
        const url = (process.env.NEMOTRON_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '') + '/chat/completions';
        const apiKey = process.env.NEMOTRON_API_KEY;

        if (!apiKey) return { ok: false, error: 'NEMOTRON_API_KEY not configured' };

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || process.env.NEMOTRON_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
            temperature: temperature ?? 0,
            max_tokens: maxTokens || 400,
            messages: [
              { role: 'system', content: 'You are an enterprise data classification service. Return valid JSON arrays only. No markdown.' },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (!response.ok) {
          return { ok: false, error: `NIM HTTP ${response.status}` };
        }

        const payload = await response.json();
        return {
          ok: true,
          requestId: payload?.id || null,
          text: payload?.choices?.[0]?.message?.content || '[]',
        };
      } catch (error) {
        return { ok: false, error: sanitizeError(error) };
      }
    },
  };
}

export { getAvailableCases };
