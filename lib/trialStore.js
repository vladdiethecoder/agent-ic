import { parseSchema, TrialRunRecordSchema } from './schemas.js';
import { readTenantCollection, writeTenantCollection } from './tenantStore.js';

const COLLECTION = 'trial-runs';
const EMPTY_STATE = { trials: [] };

export function recordTrialRun({ tenantId, userId = 'system', result }) {
  if (!tenantId) throw new Error('tenantId is required');
  if (!result?.runId) throw new Error('result.runId is required');
  const state = readState(tenantId);
  const record = buildTrialRecord({ tenantId, userId, result });
  const parsed = parseSchema(TrialRunRecordSchema, record);
  if (!parsed.ok) {
    throw new Error(`Trial run record failed schema validation: ${parsed.error.issues?.[0]?.message || 'invalid record'}`);
  }
  const existingIndex = state.trials.findIndex((item) => item.runId === record.runId);
  if (existingIndex >= 0) state.trials[existingIndex] = record;
  else state.trials.push(record);
  writeState(tenantId, state);
  return record;
}

export function listTrialRuns({ tenantId, caseId, limit = 50 } = {}) {
  if (!tenantId) return [];
  let trials = readState(tenantId).trials;
  if (caseId) trials = trials.filter((trial) => trial.caseId === caseId);
  return trials
    .slice()
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .slice(0, Math.max(0, Number(limit) || 50));
}

export function getTrialRun({ tenantId, runId }) {
  if (!tenantId || !runId) return null;
  return readState(tenantId).trials.find((trial) => trial.runId === runId) || null;
}

export function clearTrialRuns({ tenantId }) {
  if (!tenantId) throw new Error('tenantId is required');
  writeState(tenantId, EMPTY_STATE);
}

function buildTrialRecord({ tenantId, userId, result }) {
  const evidence = result.workerResult?.evidence || {};
  const metrics = result.decision?.metrics || {};
  return {
    recordType: 'trial-run-v1',
    tenantId,
    userId,
    runId: result.runId,
    caseId: result.caseId,
    domain: result.domain,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    durationMs: result.durationMs,
    vendor: {
      name: result.vendor?.name,
      product: result.vendor?.product,
      productCategory: result.vendor?.productCategory,
    },
    buyer: {
      organization: result.buyer?.organization,
      division: result.buyer?.division,
    },
    spendEnvelope: {
      cap: result.spendEnvelope?.cap,
      currency: result.spendEnvelope?.currency,
    },
    stripe: result.stripe ? {
      mode: result.stripe.mode,
      testMode: result.stripe.testMode,
      sessionIdMasked: maskId(result.stripe.sessionId),
      amountDollars: result.stripe.amountDollars,
    } : null,
    spendApproval: result.spendApproval ? {
      required: result.spendApproval.required === true,
      status: result.spendApproval.status,
      idMasked: maskId(result.spendApproval.id),
      spendCap: result.spendApproval.spendCap,
      caseId: result.spendApproval.caseId,
      decidedAt: result.spendApproval.decidedAt,
      decidedByRole: result.spendApproval.decidedByRole,
      evidence: result.spendApproval.evidence,
    } : null,
    policyBlock: {
      blockedTool: result.policyBlock?.blockedTool?.name,
      status: result.policyBlock?.result?.status,
      blocked: result.policyBlock?.result?.blocked,
      enforcementEngine: result.policyBlock?.result?.enforcementEngine,
      enforcementMode: result.policyBlock?.result?.enforcementMode,
      verificationStatus: result.policyBlock?.result?.verificationStatus,
      allowedAction: result.policyBlock?.result?.allowedAction ? {
        tool: result.policyBlock.result.allowedAction.tool,
        decision: result.policyBlock.result.allowedAction.decision,
        status: result.policyBlock.result.allowedAction.status,
        evidenceHash: result.policyBlock.result.allowedAction.evidenceHash || null,
      } : null,
      upstreamPolicyAttempt: result.policyBlock?.result?.upstreamPolicyAttempt ? {
        verificationStatus: result.policyBlock.result.upstreamPolicyAttempt.verificationStatus,
        enforcementEngine: result.policyBlock.result.upstreamPolicyAttempt.enforcementEngine,
        status: result.policyBlock.result.upstreamPolicyAttempt.status,
      } : null,
      attemptedAmount: result.policyBlock?.result?.attemptedAmount,
      cap: result.policyBlock?.result?.cap,
      policyRule: result.policyBlock?.result?.policyRule,
    },
    evidenceArtifacts: Array.isArray(result.evidenceArtifacts) ? result.evidenceArtifacts.map((artifact) => ({ artifactId: artifact.artifactId, kind: artifact.kind, sha256: artifact.sha256, bytes: artifact.bytes })) : [],
    evidence: {
      casesProcessed: evidence.casesProcessed,
      autoRouted: evidence.autoRouted,
      humanReviewQueue: evidence.humanReviewQueue,
      accuracy: evidence.accuracy,
      falsePositiveRate: evidence.falsePositiveRate,
      dataHash: evidence.dataHash,
      classificationMethod: evidence.classificationMethod,
      source: evidence.source,
      serviceRuntimeMs: evidence.serviceRuntimeMs,
    },
    productionAccessDecision: result.productionAccessDecision ? {
      approved: result.productionAccessDecision.approved === true,
      status: result.productionAccessDecision.status,
      scope: result.productionAccessDecision.scope,
      recommendedAction: result.productionAccessDecision.recommendedAction,
      blockers: result.productionAccessDecision.blockers || [],
      evidence: result.productionAccessDecision.evidence || {},
    } : null,
    decision: {
      verdict: result.decision?.verdict,
      confidence: result.decision?.confidence,
      businessCase: result.decision?.businessCase,
      netValue: metrics.profitability?.netValue,
      riskAdjustedROI: metrics.riskAdjustedROI?.multiple,
      wasteRatio: metrics.wasteRatio?.ratio,
      annualizedValue: metrics.annualizedProjection?.annualValue,
      nemotronSynthesisMode: result.decision?.nemotronSynthesis?.mode || (result.decision?.nemotronSynthesis?.requestId ? 'live' : null),
      nemotronRequestIdMasked: maskId(result.decision?.nemotronSynthesis?.requestId),
    },
    playbook: result.playbook ? {
      name: result.playbook.name,
      version: result.playbook.version,
      steps: result.playbook.steps?.length || 0,
    } : null,
    storedAt: new Date().toISOString(),
  };
}

function readState(tenantId) {
  const state = readTenantCollection(tenantId, COLLECTION, EMPTY_STATE);
  return { trials: Array.isArray(state.trials) ? state.trials : [] };
}

function writeState(tenantId, state) {
  return writeTenantCollection(tenantId, COLLECTION, { trials: state.trials || [] });
}

function maskId(value) {
  if (!value) return null;
  const text = String(value);
  if (text.length <= 14) return text;
  return `${text.slice(0, 8)}…${text.slice(-4)}`;
}
