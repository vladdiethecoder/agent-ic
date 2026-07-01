#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const BASE_URL = (process.env.AGENT_IC_BASE_URL || process.env.AGENT_IC_INTERNAL_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const PROOF_CASE_ID = process.env.AGENT_IC_PROOF_CASE_ID || 'safety-ops-complaint-triage';
const PROOF_MISSION = process.env.AGENT_IC_PROOF_MISSION || 'Evaluate RouteGuard AI for complaint triage before signing a $14,400 annual contract';
const PROOF_RUN_ID = process.env.AGENT_IC_PROOF_RUN_ID || '';
const STRICT_LIVE = process.env.AGENT_IC_PROOF_REQUIRE_LIVE === 'true';

function maskId(id) {
  if (!id) return null;
  const value = String(id);
  if (value.length < 18) return value;
  return `${value.slice(0, 14)}...${value.slice(-4)}`;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, options);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.message || json.error || `HTTP ${response.status}`);
  }
  return json;
}

async function createTrial({ missionStatement = PROOF_MISSION, caseId = PROOF_CASE_ID } = {}) {
  return fetchJson('/api/enterprise-trial', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ caseId, missionStatement }),
  });
}

async function loadTrial() {
  if (PROOF_RUN_ID) {
    const stored = await fetchJson(`/api/trials?runId=${encodeURIComponent(PROOF_RUN_ID)}`);
    if (!stored.trial) throw new Error(`Stored trial not found: ${PROOF_RUN_ID}`);
    return stored.trial;
  }
  return createTrial();
}

function requireStrictLive(condition, message) {
  if (STRICT_LIVE && !condition) throw new Error(message);
}

function shortHash(value) {
  if (!value) return null;
  return String(value).slice(0, 16);
}

export function classifyStripeProof(stripe = {}) {
  const stripeReceiptId = stripe.sessionId || stripe.sessionIdMasked || null;
  const receiptText = String(stripeReceiptId || '');
  const hasCheckoutSession = typeof stripeReceiptId === 'string' && /^cs_(test|live)_/.test(receiptText);
  const nonProductionReceipt = stripe.testMode === true || receiptText.startsWith('cs_test') || stripe.mode === 'non-production';
  const retrieval = stripe.retrieval || {};
  const expectedAmountCents = Number.isFinite(Number(stripe.amountDollars))
    ? Math.round(Number(stripe.amountDollars) * 100)
    : null;
  const amountMatches = expectedAmountCents === null
    ? true
    : Number(retrieval.amount_total) === expectedAmountCents;
  const retrievalCorrelated = Boolean(
    retrieval.id === stripeReceiptId &&
    retrieval.livemode === true &&
    amountMatches
  );
  const liveReceipt = hasCheckoutSession &&
    !nonProductionReceipt &&
    receiptText.startsWith('cs_live') &&
    stripe.mode === 'live' &&
    retrievalCorrelated;
  return {
    stripeReceiptId,
    hasCheckoutSession,
    nonProductionReceipt,
    retrievalCorrelated,
    liveReceipt,
    proof: liveReceipt
      ? 'Checkout Session create and retrieval recorded in live mode'
      : nonProductionReceipt && hasCheckoutSession
        ? 'Checkout Session create recorded in non-production mode'
        : hasCheckoutSession
          ? 'Checkout Session create recorded but live retrieval proof is missing or mismatched'
          : 'bounded local spend envelope',
    state: liveReceipt
      ? 'live-session-retrieved'
      : nonProductionReceipt && hasCheckoutSession
        ? 'non-production-session-recorded'
        : hasCheckoutSession
          ? 'unverified-live-session'
          : 'unavailable-or-local-envelope',
    limitation: liveReceipt
      ? null
      : nonProductionReceipt && hasCheckoutSession
        ? 'Checkout receipt is non-production; it is not live money movement and cannot approve production access.'
        : hasCheckoutSession
          ? 'Checkout receipt lacks matching live retrieve/status metadata; it cannot approve production access.'
          : 'No Stripe Checkout receipt was returned; this is not live money movement.',
  };
}

async function proofStripe() {
  const trial = await loadTrial();
  const stripe = trial.stripe || {};
  const stripeProof = classifyStripeProof(stripe);
  requireStrictLive(stripeProof.liveReceipt, 'Stripe live-mode Checkout receipt is missing');
  print({
    provider: 'Stripe',
    proof: stripeProof.proof,
    state: stripeProof.state,
    runId: trial.runId,
    sessionId: stripe.sessionId ? maskId(stripe.sessionId) : stripe.sessionIdMasked || null,
    mode: stripe.mode || 'unavailable',
    testMode: stripe.testMode === true,
    amountDollars: stripe.amountDollars,
    retrievalStatus: stripe.retrieval?.status || null,
    paymentStatus: stripe.retrieval?.paymentStatus || stripe.retrieval?.payment_status || null,
    limitation: stripeProof.limitation,
  });
}

async function proofNemotron() {
  const trial = await loadTrial();
  const evidence = trial.workerResult?.evidence || trial.evidence || {};
  const proof = classifyNemotronProof(evidence, trial.decision || {});
  requireStrictLive(proof.classificationVerified, 'Nemotron classification receipt is missing');
  const classification = evidence.classificationMethod || {};
  const synthesis = trial.decision?.nemotronSynthesis || {};
  print({
    provider: 'NVIDIA Nemotron',
    proof: proof.proof,
    state: proof.state,
    runId: trial.runId,
    classificationMode: classification.mode || 'unknown',
    nemotronClassified: classification.nemotronClassified || 0,
    patternExtended: classification.patternExtended || 0,
    deterministicClassified: classification.deterministicClassified || 0,
    classificationVerified: proof.classificationVerified,
    classificationRequestId: classification.nemotronRequestId ? maskId(classification.nemotronRequestId) : classification.nemotronRequestIdMasked || null,
    synthesisMode: proof.synthesisMode,
    synthesisRequestId: synthesis.requestId ? maskId(synthesis.requestId) : trial.decision?.nemotronRequestIdMasked || null,
    synthesisVerified: proof.synthesisVerified,
    unavailableReason: classification.unavailableReason || synthesis.unavailableReason || null,
  });
}

export function classifyNemotronProof(evidence = {}, decision = {}) {
  const synthesis = decision.nemotronSynthesis || {};
  const synthesisRequestId = synthesis.requestId || decision.nemotronRequestIdMasked || null;
  const synthesisMode = synthesis.mode || decision.nemotronSynthesisMode || (synthesisRequestId ? 'live' : null);
  const classificationVerified = hasVerifiedNemotronClassification(evidence);
  const synthesisVerified = Boolean(synthesisRequestId) && synthesisMode !== 'deterministic-fallback';
  return {
    classificationVerified,
    synthesisVerified,
    synthesisMode,
    state: classificationVerified
      ? 'classification-receipt-recorded'
      : synthesisVerified
        ? 'synthesis-only-receipt'
        : 'deterministic-fallback',
    proof: classificationVerified
      ? 'live classification receipt on trial evidence'
      : synthesisVerified
        ? 'live synthesis receipt only; classification receipt missing for strict proof'
        : 'deterministic fallback only',
  };
}

export function hasVerifiedNemotronClassification(evidence = {}) {
  const classification = evidence.classificationMethod || {};
  const requestId = String(classification.nemotronRequestId || classification.nemotronRequestIdMasked || '');
  const nemotronClassified = Number(classification.nemotronClassified || 0);
  const patternExtended = Number(classification.patternExtended || 0);
  const deterministicClassified = Number(classification.deterministicClassified || 0);
  const casesProcessed = Number(evidence.casesProcessed || 0);
  const accountingMatches = casesProcessed > 0 &&
    nemotronClassified + patternExtended + deterministicClassified === casesProcessed;
  return Boolean(
    classification.mode === 'nemotron-sample-plus-pattern-extension' &&
    nemotronClassified > 0 &&
    nemotronClassified <= 12 &&
    deterministicClassified === 0 &&
    accountingMatches &&
    /^chatcmpl-[A-Za-z0-9._:-]{8,}$/.test(requestId)
  );
}

async function proofHermes() {
  const trial = await loadTrial();
  const hermes = trial.hermesExecutionReceipt || {};
  const live = isVerifiedHermesReceipt(hermes);
  requireStrictLive(live, 'Hermes live dispatch receipt is missing');
  print({
    provider: 'Hermes Agent',
    proof: live ? (hermes.skillSource === 'nemohermes-sandbox' ? 'NemoHermes sandbox dispatch' : hermes.skillSource === 'hermes-cli' ? 'Hermes CLI session dispatch' : 'gateway task dispatch') : 'local playbook artifact handoff',
    state: live ? 'recorded' : 'handoff-artifact',
    runId: trial.runId,
    skillSource: hermes.skillSource || 'local-playbook',
    taskId: hermes.taskIdMasked || maskId(hermes.taskId),
    hermesSessionId: hermes.hermesSessionIdMasked || maskId(hermes.hermesSessionId),
    sandboxId: maskId(hermes.sandboxId),
    outputSha256: shortHash(hermes.outputSha256),
    selectedSkills: hermes.selectedSkills || trial.playbook?.selectedSkills || [],
    summary: hermes.outputSummary || trial.playbook?.executionSummary || null,
    limitation: live ? null : hermes.error || 'Hermes live dispatch not configured; local playbook generated instead.',
  });
}

function isVerifiedHermesReceipt(hermes = {}) {
  const liveSource = ['nemohermes-sandbox', 'hermes-gateway', 'hermes-cli'].includes(hermes.skillSource);
  const hasSession = Boolean(hermes.taskIdMasked || hermes.taskId || hermes.hermesSessionIdMasked || hermes.hermesSessionId);
  const hasOutputHash = /^[a-f0-9]{64}$/i.test(String(hermes.outputSha256 || ''));
  const selectedSkills = Array.isArray(hermes.selectedSkills) ? hermes.selectedSkills : [];
  if (!(hermes.ok === true && hermes.state === 'recorded' && liveSource && !hermes.error)) return false;
  if (hermes.skillSource === 'hermes-gateway') return Boolean(hermes.taskIdMasked || hermes.taskId);
  if (hermes.skillSource === 'nemohermes-sandbox') {
    return Boolean(hasSession && hermes.sandboxId && hasOutputHash && selectedSkills.includes('governed-agentic-service-trial-v1'));
  }
  if (hermes.skillSource === 'hermes-cli') {
    return Boolean(hasSession && hasOutputHash && selectedSkills.includes('hermes-agent'));
  }
  return false;
}

async function proofPolicy() {
  const trial = await loadTrial();
  const policyBlock = trial.policyBlock || {};
  const result = policyBlock.result || policyBlock;
  const allowed = result.allowedAction || null;
  const policyProof = classifyPolicyProof(result, allowed);
  if (!policyProof.hasAllowedAndDenied) throw new Error('Policy proof requires one allowed action and one denied action receipt');
  requireStrictLive(policyProof.openShellVerified, 'OpenShell verified 403 policy receipt is missing');
  print({
    provider: result.enforcementEngine || 'policy-gate',
    proof: policyProof.proof,
    state: policyProof.state,
    runId: trial.runId,
    verificationStatus: result.verificationStatus,
    enforcementMode: result.enforcementMode || result.enforcementEngine,
    openShellVerified: policyProof.openShellVerified,
    deniedAction: {
      tool: result.tool || policyBlock.blockedTool?.name || policyBlock.blockedTool,
      status: result.status,
      attemptedAmountDollars: result.attemptedAmount,
      capDollars: result.cap,
      policyRule: result.policyRule,
    },
    allowedAction: {
      tool: allowed.tool,
      status: allowed.status,
      evidenceHash: allowed.evidenceHash || null,
      evidenceSource: allowed.evidenceSource || null,
    },
    upstreamPolicyAttempt: result.upstreamPolicyAttempt ? {
      verificationStatus: result.upstreamPolicyAttempt.verificationStatus,
      enforcementEngine: result.upstreamPolicyAttempt.enforcementEngine,
      status: result.upstreamPolicyAttempt.status,
    } : null,
  });
}

export function classifyPolicyProof(result = {}, allowed = null) {
  const hasAllowedAndDenied = result.blocked === true && Number(result.status) === 403 && Number(allowed?.status) === 200;
  const openShellVerified = isVerifiedOpenShellPolicyReceipt(result);
  return {
    hasAllowedAndDenied,
    openShellVerified,
    state: openShellVerified ? 'openshell-verified' : hasAllowedAndDenied ? 'local-policy-enforced' : 'policy-proof-missing',
    proof: openShellVerified
      ? 'OpenShell verified 403 sandbox receipt plus allowed workload read'
      : hasAllowedAndDenied
        ? 'Local policy gate enforced allowed workload read and denied over-cap tool call'
        : 'Policy proof missing allowed or denied action receipt',
  };
}

export function isVerifiedOpenShellPolicyReceipt(result = {}) {
  const proof = result.proof || {};
  return Boolean(
    result.blocked === true &&
    Number(result.status) === 403 &&
    result.verificationStatus === 'verified' &&
    result.enforcementEngine === 'NVIDIA OpenShell' &&
    result.enforcementType === 'container-network-policy' &&
    typeof result.sandbox === 'string' &&
    result.sandbox.length > 0 &&
    /^openshell-block-\d+/.test(String(result.receipt || '')) &&
    proof.engine === 'NVIDIA OpenShell' &&
    proof.genuineExternal === true &&
    /container/i.test(String(proof.enforcementLevel || ''))
  );
}

async function proofPlaybook() {
  const trial = await loadTrial();
  const playbook = trial.playbook || {};
  const stepCount = Array.isArray(playbook.steps) ? playbook.steps.length : Number(playbook.steps || 0);
  if (!playbook.name || stepCount <= 0) throw new Error('Generated playbook artifact is missing from trial result');
  const content = JSON.stringify(playbook);
  print({
    artifact: 'trial playbook',
    runId: trial.runId,
    name: playbook.name,
    version: playbook.version,
    steps: stepCount,
    hermesNative: playbook.hermesNative === true,
    selectedSkills: playbook.selectedSkills || [],
    sha256: createHash('sha256').update(content).digest('hex').slice(0, 16),
    source: playbook.hermesNative ? 'Hermes live dispatch receipt' : 'local generated artifact',
  });
}

async function proofProductionAccess() {
  const trial = await loadTrial();
  const decision = trial.productionAccessDecision || null;
  const accessProof = classifyProductionAccessProof(decision);
  if (!accessProof.valid) throw new Error(accessProof.error);
  const blockers = accessProof.blockers;
  const spendApproval = trial.spendApproval || {};
  const stripe = trial.stripe || {};
  print({
    provider: 'Agent IC production-access gate',
    proof: decision.approved ? 'scoped production access approved by receipts and approval evidence' : 'production access explicitly denied by proof gate',
    state: decision.approved ? 'approved' : 'blocked',
    runId: trial.runId,
    approved: decision.approved,
    status: decision.status,
    scope: decision.scope,
    recommendedAction: decision.recommendedAction,
    blockers,
    spendApproval: {
      required: spendApproval.required === true,
      status: spendApproval.status || null,
      id: spendApproval.id ? maskId(spendApproval.id) : spendApproval.idMasked || null,
      spendCap: spendApproval.spendCap || null,
    },
    receiptEvidence: {
      stripeMode: stripe.mode || 'unavailable',
      stripeTestMode: stripe.testMode === true,
      approvalVerified: decision.evidence?.approvalVerified === true,
      evidenceArtifactsVerified: decision.evidence?.evidenceArtifactsVerified === true,
      stripeLiveReceiptVerified: decision.evidence?.stripeLiveReceiptVerified === true,
      nemotronClassificationReceipt: decision.evidence?.nemotronClassificationReceipt === true,
      openShellVerified403: decision.evidence?.openShellVerified403 === true,
      hermesReceiptVerified: decision.evidence?.hermesReceiptVerified === true,
      policyBypass: decision.evidence?.policyBypass === true,
    },
  });
}

export function classifyProductionAccessProof(decision = null) {
  if (!decision || typeof decision.approved !== 'boolean' || !decision.status || !decision.scope) {
    return { valid: false, error: 'Production-access decision proof is missing from trial result', blockers: [] };
  }
  const blockers = Array.isArray(decision.blockers) ? decision.blockers : [];
  if (decision.approved === true && blockers.length > 0) {
    return { valid: false, error: 'Production-access approval cannot include blockers', blockers };
  }
  if (decision.approved === false && blockers.length === 0) {
    return { valid: false, error: 'Production-access denial requires at least one blocker', blockers };
  }
  const evidence = decision.evidence || {};
  const requiredApprovedReceipts = [
    'approvalVerified',
    'evidenceArtifactsVerified',
    'stripeLiveReceiptVerified',
    'nemotronClassificationReceipt',
    'openShellVerified403',
    'hermesReceiptVerified',
  ];
  const missingReceipts = decision.approved === true
    ? requiredApprovedReceipts.filter((key) => evidence[key] !== true)
    : [];
  if (decision.approved === true && evidence.policyBypass === true) missingReceipts.push('policyBypassClear');
  if (missingReceipts.length > 0) {
    return {
      valid: false,
      error: `Production-access approval missing receipt evidence: ${missingReceipts.join(', ')}`,
      blockers,
      missingReceipts,
    };
  }
  return { valid: true, error: null, blockers, missingReceipts };
}

async function proofRerun() {
  const first = await loadTrial();
  const second = await createTrial({
    caseId: first.caseId || PROOF_CASE_ID,
    missionStatement: `${first.missionStatement || PROOF_MISSION} Re-run from the generated governed-trial playbook context.`,
  });
  const firstHash = first.workerResult?.evidence?.dataHash || first.evidence?.dataHash || null;
  const secondHash = second.workerResult?.evidence?.dataHash || null;
  print({
    command: 'Repeat governed trial from generated playbook context',
    firstRunId: first.runId,
    secondRunId: second.runId,
    sameCase: first.caseId === second.caseId,
    sameEvidenceHash: firstHash === secondHash,
    firstVerdict: first.decision?.verdict,
    secondVerdict: second.decision?.verdict,
    firstDataHash: firstHash,
    secondDataHash: secondHash,
    secondRenewalAction: second.renewal?.action || null,
  });
}

async function proofGpu() {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,driver_version,utilization.gpu,memory.used',
      '--format=csv,noheader,nounits',
    ], { timeout: 5000, maxBuffer: 64 * 1024 });
    const first = stdout.trim().split('\n')[0] || '';
    const [name, driverVersion, utilizationGpu, memoryUsedMiB] = first.split(',').map((part) => part.trim());
    print({
      provider: 'NVIDIA GPU',
      name,
      driverVersion,
      utilizationGpuPercent: Number(utilizationGpu),
      memoryUsedMiB: Number(memoryUsedMiB),
    });
  } catch (error) {
    print({ provider: 'NVIDIA GPU', state: 'unavailable', error: error.message });
  }
}

async function main() {
  const [, , group, command] = process.argv;
  if (group !== 'proof') {
    throw new Error('Usage: agent-ic proof <hermes|stripe|nemotron|policy|production-access|playbook|rerun|gpu>');
  }
  switch (command) {
    case 'hermes':
      return proofHermes();
    case 'stripe':
      return proofStripe();
    case 'nemotron':
      return proofNemotron();
    case 'policy':
      return proofPolicy();
    case 'production-access':
      return proofProductionAccess();
    case 'playbook':
      return proofPlaybook();
    case 'rerun':
      return proofRerun();
    case 'gpu':
      return proofGpu();
    default:
      throw new Error('Usage: agent-ic proof <hermes|stripe|nemotron|policy|production-access|playbook|rerun|gpu>');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`proof failed: ${error.message}\n`);
    process.exit(1);
  });
}
