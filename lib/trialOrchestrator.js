/**
 * Trial Orchestrator
 *
 * Runs a complete governed enterprise service trial:
 *
 * 1. Mission intake → trial plan
 * 2. Stripe spend envelope creation
 * 3. Worker agent dispatch (processes real data with Nemotron)
 * 4. OpenShell when observed, otherwise local policy gate (blocks unsafe action)
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
  tenantId = 'local-tenant',
  userId = 'system',
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
    mode: integrations.stripe?.available ? 'provider-attempt' : 'unavailable',
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
    const { createGovernedSandbox, isOpenShellAvailable } = await import('./openShellIntegration.js');

    if (integrations.openShell?.skip === true) {
      onTrace?.('openshell.skipped', { reason: 'integration requested skip' });
      onStage?.('govern', { status: 'sandbox_skipped', reason: 'integration requested skip' });
    } else if (isOpenShellAvailable()) {
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

  // Fall back to policy gate integration adapter when OpenShell is unavailable
  // or when the sandbox attempt did not produce an observed denial receipt.
  if ((!policyBlockResult || policyBlockResult.verificationStatus === 'unverified') && integrations.policyGate?.evaluate) {
    const openShellAttempt = policyBlockResult || null;
    try {
      policyBlockResult = await integrations.policyGate.evaluate({
        caseDef,
        attemptedAction: caseDef.policyEnvelope.blockedTool,
        evidence: trialEvidence,
      });
      if (openShellAttempt) {
        policyBlockResult.upstreamPolicyAttempt = openShellAttempt;
      }
      onTrace?.('policy.test.complete', {
        blocked: policyBlockResult.blocked,
        status: policyBlockResult.status,
        engine: 'policy-gate-adapter',
        upstreamVerificationStatus: openShellAttempt?.verificationStatus || null,
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
  if (!policyBlockResult.allowedAction) {
    policyBlockResult.allowedAction = {
      tool: caseDef.policyEnvelope.allowedTools[0] || 'allowlisted evidence source',
      decision: 'allowed',
      status: 200,
      enforcementMode: policyBlockResult.enforcementEngine || 'policy-gate',
      evidenceSource: trialEvidence.dataSource,
      evidenceHash: trialEvidence.dataHash,
      reason: 'Allowlisted workload evidence read completed inside the governed trial envelope.',
    };
  }
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
      if (!nemotronSynthesis) {
        nemotronSynthesis = {
          requestId: null,
          latencyMs: 0,
          mode: 'deterministic-fallback',
          verdict: decision.verdict,
          businessCase: decision.procurementRecommendation?.recommendation,
          unavailableReason: 'Nemotron synthesis returned no usable receipt; deterministic procurement decision retained.',
        };
      }
      onTrace?.('nemotron.synthesis.complete', {
        requestId: nemotronSynthesis.requestId,
        latencyMs: nemotronSynthesis.latencyMs,
        mode: nemotronSynthesis.mode || 'live',
      });
    } catch (error) {
      nemotronSynthesis = {
        requestId: null,
        latencyMs: 0,
        mode: 'deterministic-fallback',
        verdict: decision.verdict,
        businessCase: decision.procurementRecommendation?.recommendation,
        unavailableReason: `Nemotron procurement synthesis unavailable: ${sanitizeError(error)}`,
      };
      onTrace?.('nemotron.synthesis.fallback', { error: nemotronSynthesis.unavailableReason });
    }
    onStage?.('synthesize', { status: 'complete', nemotronSynthesis });
  }

  // ── Phase 7: Playbook Generation + Hermes Handoff ────────────
  onStage?.('playbook', { status: 'generating' });
  let playbook = generatePlaybook(caseDef, decision, trialContext, { sandboxInfo, policyBlockResult });
  let hermesExecutionReceipt = null;

  if (integrations.hermes?.dispatch) {
    onTrace?.('hermes.dispatch.request', {
      vendor: caseDef.vendor.product,
      verdict: decision.verdict,
      cap: caseDef.policyEnvelope.spendCap,
    });
    try {
      const hermesResult = await integrations.hermes.dispatch({
        proposal: buildHermesProposal(caseDef),
        evaluation: buildHermesEvaluation({ caseDef, decision, trialEvidence, trialContext, playbook }),
      });
      hermesExecutionReceipt = normalizeHermesReceipt(hermesResult);
      if (hermesResult?.ok) {
        playbook = {
          ...playbook,
          hermesNative: true,
          hermesPlaybookId: hermesResult.playbook?.id || hermesResult.taskId || null,
          executionSummary: hermesResult.playbook?.executionSummary || hermesResult.outputSummary || null,
          selectedSkills: hermesResult.skillPlan || playbook.selectedSkills,
        };
      }
      onTrace?.('hermes.dispatch.response', {
        ok: hermesExecutionReceipt.ok,
        skillSource: hermesExecutionReceipt.skillSource,
        sandboxId: hermesExecutionReceipt.sandboxId,
        taskIdMasked: hermesExecutionReceipt.taskIdMasked,
        error: hermesExecutionReceipt.error,
      });
    } catch (error) {
      hermesExecutionReceipt = normalizeHermesReceipt({
        ok: false,
        skillSource: 'unavailable',
        latencyMs: 0,
        error: sanitizeError(error),
      });
      onTrace?.('hermes.dispatch.error', { error: hermesExecutionReceipt.error });
    }
  } else {
    hermesExecutionReceipt = normalizeHermesReceipt({
      ok: false,
      skillSource: 'local-playbook',
      playbook,
      latencyMs: 0,
      error: 'Hermes live dispatch not configured',
    });
    onTrace?.('hermes.dispatch.skipped', { reason: hermesExecutionReceipt.error });
  }

  if (requireLiveProof) {
    enforceStrictProviderProof({ stripeResult, trialEvidence, policyBlockResult, hermesExecutionReceipt });
  }

  onTrace?.('playbook.generated', { name: playbook.name, steps: playbook.steps.length, hermesLive: hermesExecutionReceipt?.ok === true });
  onStage?.('playbook', { status: 'complete', playbook, hermesExecutionReceipt });

  // ── Phase 8: Persist Evidence Artifacts ──────────────────────
  let evidenceArtifacts = [];
  try {
    const { recordEvidenceArtifact } = await import('./evidenceStore.js');
    evidenceArtifacts = [
      recordEvidenceArtifact({ tenantId, runId, kind: 'trial-evidence', content: trialEvidence, createdBy: userId }),
      recordEvidenceArtifact({ tenantId, runId, kind: 'worker-results', content: workerResult?.rawResults || [], createdBy: userId }),
    ];
    onTrace?.('evidence.artifacts.recorded', { count: evidenceArtifacts.length, hashes: evidenceArtifacts.map((artifact) => artifact.sha256.slice(0, 12)) });
  } catch (evidenceError) {
    onTrace?.('evidence.artifacts.error', { error: sanitizeError(evidenceError) });
  }

  // ── Phase 9: Record to Renewal Ledger ────────────────────────
  let recordedCycle = null;
  try {
    const { recordTrialCycle } = await import('./renewalLedger.js');
    recordedCycle = recordTrialCycle({
      runId,
      tenantId,
      userId,
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

  const finalDecision = resolveFinalDecision(decision, nemotronSynthesis);
  if (finalDecision.synthesisRejected) {
    onTrace?.('nemotron.synthesis.rejected', {
      deterministicVerdict: decision.verdict,
      synthesisVerdict: nemotronSynthesis?.verdict || null,
      reason: 'synthesis verdict was less restrictive than fail-closed deterministic baseline',
    });
  }

  // ── Assemble Final Payload ───────────────────────────────────
  return {
    runId,
    tenantId,
    userId,
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
      mode: stripeResult?.mode || 'unavailable',
      sessionId: stripeResult?.checkout?.id || null,
      testMode: String(stripeResult?.checkout?.id || '').startsWith('cs_test'),
      amountDollars: caseDef.policyEnvelope.spendCap,
      retrieval: stripeResult?.retrieval || null,
    },

    // Evidence artifacts
    evidenceArtifacts,

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
      verdict: finalDecision.verdict,
      confidence: finalDecision.confidence,
      businessCase: finalDecision.businessCase,
      procurementRecommendation: decision.procurementRecommendation,
      claimValidation: decision.claimValidation,
      metrics: decision.metrics,
      evidence: decision.evidence,
      nemotronSynthesis,
      synthesisRejected: finalDecision.synthesisRejected,
    },

    // The playbook
    playbook,
    hermesExecutionReceipt,

    // Governance
    governance: enterpriseGovernancePolicy,

    // ROI
    roiMethodology: decision.roiMethodology,

    // Renewal context (accumulated across cycles)
    renewal: recordedCycle?.renewal || null,
    cycleId: recordedCycle?.cycleId || null,
  };
}


function enforceStrictProviderProof({ stripeResult, trialEvidence, policyBlockResult, hermesExecutionReceipt }) {
  const missing = [];
  const stripeSessionId = stripeResult?.checkout?.id || stripeResult?.sessionId || null;
  if (!stripeSessionId) {
    missing.push('Stripe Checkout receipt');
  }

  const classification = trialEvidence?.classificationMethod || {};
  const hasNemotronClassificationReceipt =
    classification.mode === 'nemotron-sample-plus-pattern-extension' &&
    Number(classification.nemotronClassified || 0) > 0 &&
    Boolean(classification.nemotronRequestId);
  if (!hasNemotronClassificationReceipt) {
    missing.push('Nemotron classification request id');
  }

  const hasOpenShellPolicyReceipt =
    policyBlockResult?.blocked === true &&
    policyBlockResult?.verificationStatus === 'verified' &&
    policyBlockResult?.enforcementEngine === 'NVIDIA OpenShell' &&
    Number(policyBlockResult?.status) === 403;
  if (!hasOpenShellPolicyReceipt) {
    missing.push('OpenShell verified 403 policy receipt');
  }

  if (hermesExecutionReceipt?.ok !== true) {
    missing.push('Hermes dispatch receipt');
  }

  if (missing.length > 0) {
    throw new Error(`Strict provider proof required but missing: ${missing.join(', ')}`);
  }
}

function resolveFinalDecision(decision, nemotronSynthesis) {
  const deterministicVerdict = normalizeVerdict(decision?.verdict) || 'KILL';
  const synthesisVerdict = normalizeVerdict(nemotronSynthesis?.verdict);
  const synthesisNotLessRestrictive = synthesisVerdict
    ? verdictRank(synthesisVerdict) >= verdictRank(deterministicVerdict)
    : false;
  const useSynthesis = Boolean(synthesisVerdict && synthesisNotLessRestrictive);

  return {
    verdict: useSynthesis ? synthesisVerdict : deterministicVerdict,
    confidence: useSynthesis ? (nemotronSynthesis?.confidence || decision?.confidence) : decision?.confidence,
    businessCase: useSynthesis
      ? (nemotronSynthesis?.businessCase || decision?.procurementRecommendation?.recommendation)
      : decision?.procurementRecommendation?.recommendation,
    synthesisRejected: Boolean(synthesisVerdict && !synthesisNotLessRestrictive),
  };
}

function normalizeVerdict(value) {
  const verdict = String(value || '').trim().toUpperCase();
  return ['CONTINUE', 'REVISE', 'KILL'].includes(verdict) ? verdict : null;
}

function verdictRank(verdict) {
  return { CONTINUE: 0, REVISE: 1, KILL: 2 }[verdict] ?? 2;
}

function buildHermesProposal(caseDef) {
  return {
    id: caseDef.id,
    company: caseDef.buyer.organization,
    title: caseDef.title,
    microPilot: {
      mission: caseDef.missionStatement,
      envelopeDollars: caseDef.policyEnvelope.spendCap,
    },
  };
}

function buildHermesEvaluation({ caseDef, decision, trialEvidence, trialContext, playbook }) {
  return {
    decision: decision.verdict,
    spendEnvelope: { cap: caseDef.policyEnvelope.spendCap },
    microPilot: {
      decision: decision.verdict,
      nextCap: decision.procurementRecommendation?.recommendedCap || Math.round(caseDef.policyEnvelope.spendCap * 2.5),
    },
    trialEvidence: {
      casesProcessed: trialEvidence.casesProcessed,
      autoRouted: trialEvidence.autoRouted,
      humanReviewQueue: trialEvidence.humanReviewQueue,
      dataHash: trialEvidence.dataHash,
      blockedActionEnforced: trialEvidence.blockedActionEnforced,
    },
    trialContext,
    playbook: {
      name: playbook.name,
      version: playbook.version,
      steps: playbook.steps?.length || 0,
    },
  };
}

function normalizeHermesReceipt(result = {}) {
  const taskId = result.taskId || null;
  const hermesSessionId = result.hermesSessionId || null;
  return {
    ok: result.ok === true,
    state: result.ok === true ? 'recorded' : 'handoff',
    provider: result.provider || (result.skillSource === 'hermes-gateway' ? 'hermes-gateway' : result.skillSource === 'nemohermes-sandbox' ? 'nemohermes' : 'local-artifact'),
    skillSource: result.skillSource || 'local-playbook',
    taskIdMasked: maskId(taskId),
    hermesSessionIdMasked: maskId(hermesSessionId),
    sandboxId: result.sandboxId || null,
    selectedSkills: result.skillPlan || [],
    outputSha256: result.outputSha256 || null,
    outputSummary: result.outputSummary || result.playbook?.executionSummary || null,
    latencyMs: result.latencyMs || 0,
    error: result.error || null,
  };
}

function maskId(id) {
  const text = String(id || '');
  if (!text) return null;
  if (text.length <= 18) return text;
  return `${text.slice(0, 12)}…${text.slice(-4)}`;
}

function generatePlaybook(caseDef, decision, trialContext, runContext = {}) {
  const { sandboxInfo, policyBlockResult } = runContext;
  const openShellVerified = policyBlockResult?.verificationStatus === 'verified' &&
    policyBlockResult?.enforcementEngine === 'NVIDIA OpenShell';
  const enforcementMode = policyBlockResult?.enforcementMode || policyBlockResult?.enforcementEngine || 'not verified';
  const governanceStep = openShellVerified
    ? `Dispatch ${caseDef.vendor.product} into OpenShell sandbox ${sandboxInfo?.sandboxName || 'recorded sandbox'} and verify denied action via container network policy`
    : `Dispatch ${caseDef.vendor.product} through Agent IC worker and enforce denied action with ${enforcementMode}; no OpenShell sandbox enforcement receipt is claimed for this run`;

  return {
    name: `Governed Trial Playbook — ${caseDef.vendor.product}`,
    vendor: caseDef.vendor.name,
    product: caseDef.vendor.product,
    domain: caseDef.domain,
    version: 'v18-enterprise',
    steps: [
      `Intake mission: ${caseDef.missionStatement}`,
      `Create $${caseDef.policyEnvelope.spendCap} spend envelope via Stripe Checkout`,
      governanceStep,
      `Allow: ${caseDef.policyEnvelope.allowedTools.join(', ')}`,
      `Block: ${caseDef.policyEnvelope.blockedTool.name} (${caseDef.policyEnvelope.blockedTool.policyRule})`,
      `Process ${decision.metrics.wasteRatio.totalOutputs} cases, measure routing accuracy and waste ratio`,
      `Validate ${decision.claimValidation.summary.total} vendor claims against measured results`,
      `Compute enterprise metrics: profitability, ROI, waste, throughput, annualized value`,
      `Issue ${decision.verdict} decision with procurement recommendation`,
      `Renew: accumulate evidence monthly, adjust envelope based on trend`,
    ],
    verdict: decision.verdict,
    enforcementMode,
    openShellVerified,
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

  if (typeof nemotronIntegration.classify === 'function') {
    return {
      available: true,
      classify: (params) => nemotronIntegration.classify(params),
    };
  }

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
          signal: AbortSignal.timeout(45_000),
          body: JSON.stringify({
            model: model || process.env.NEMOTRON_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
            temperature: temperature ?? 0,
            max_tokens: maxTokens || 400,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: 'Return a JSON object only. No reasoning. No markdown.' },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (!response.ok) {
          return { ok: false, error: `NIM HTTP ${response.status}` };
        }

        const payload = await response.json();
        const message = payload?.choices?.[0]?.message || {};
        return {
          ok: true,
          requestId: payload?.id || null,
          text: message.content || message.reasoning_content || payload?.choices?.[0]?.text || payload?.output_text || '[]',
        };
      } catch (error) {
        return { ok: false, error: sanitizeError(error) };
      }
    },
  };
}

export { getAvailableCases };
