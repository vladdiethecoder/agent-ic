import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { NextResponse } from 'next/server.js';
import { enterpriseCases, GOVERNANCE_INVARIANTS } from '../../../lib/enterpriseCases.js';
import { readAudit, verifyAuditChain } from '../../../lib/auditStore.js';
import { readLiveTrace } from '../../../lib/liveTrace.js';
import { buildProviderStates } from '../../../lib/providerStatus.js';
import { listTrialRuns } from '../../../lib/trialStore.js';
import { parseSchema, ProofReportSchema } from '../../../lib/schemas.js';
import { authContext, requireApiAccessAsync } from '../../../lib/authz.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_proof_report');
  if (!access.ok) return access.response;

  const latestAudit = readAudit({ tenantId: access.principal.tenantId, limit: 5 }).map(maskAuditEntry);
  const auditChain = verifyAuditChain({ tenantId: access.principal.tenantId });
  const latestTrace = readLiveTrace().slice(-8).map(maskTraceEvent);
  const latestTrial = listTrialRuns({ tenantId: access.principal.tenantId, limit: 1 })[0] || null;
  const providers = buildProviderStates();

  let openshellAvailable = false;
  try {
    const { isOpenShellAvailable } = await import('../../../lib/openShellIntegration.js');
    openshellAvailable = isOpenShellAvailable();
  } catch {
    openshellAvailable = false;
  }

  const responseBody = {
    ok: true,
    product: 'Agent IC',
    auth: authContext(access.principal),
    claim:
      'Agent IC governs agentic-service procurement through bounded spend, policy enforcement, workload evidence, and evidence-backed renewal decisions.',
    proofSurfaces: {
      primaryRoute: '/trial',
      spend: 'Stripe Checkout receipt for a bounded dollar envelope',
      policy: 'Per-run enforcement receipt: OpenShell only when the trial records an observed sandbox denial; otherwise the response labels the local deny-by-default policy gate',
      model: providers.nemotron.state === 'configured'
        ? 'NVIDIA Nemotron configured; sample classification is live only when the trial records request IDs; synthesis is claimed only with a synthesis receipt'
        : 'NVIDIA Nemotron not configured; live-proof paths must fail closed',
      playbook: 'Hermes-compatible governed trial playbook generated from run evidence',
      evidence: 'Public-data workload receipts include row counts, hashes, metrics, and policy outcomes',
    },
    providers: {
      nemotron: maskProvider(providers.nemotron),
      stripe: maskProvider(providers.stripe),
      hermes: maskProvider(providers.hermes),
      policy: {
        state: openshellAvailable ? 'available' : providers.nemoclaw.state,
        mode: openshellAvailable ? 'capability-check' : providers.nemoclaw.mode,
        detail: openshellAvailable ? 'OpenShell binary available; a run still needs an observed 403/policy-denied receipt before claiming OpenShell enforcement' : providers.nemoclaw.detail,
      },
    },
    cases: enterpriseCases.map((c) => ({
      id: c.id,
      domain: c.domain,
      product: c.vendor.product,
      buyer: c.buyer.organization,
      dataSource: c.dataSource.name,
      policyBlock: c.policyEnvelope.blockedTool.name,
      capDollars: c.policyEnvelope.spendCap,
      projectedNetValue: c.roiMethodology.computed.netValue,
    })),
    workloadEvidence: buildWorkloadEvidence(),
    latestTrial: maskTrialRecord(latestTrial),
    invariants: GOVERNANCE_INVARIANTS,
    latestAudit,
    auditChain,
    latestTrace,
  };

  const parsed = parseSchema(ProofReportSchema, responseBody);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'Proof report failed schema validation', code: 'proof_report_schema_invalid' },
      { status: 500 }
    );
  }

  return NextResponse.json(responseBody);
}

function buildWorkloadEvidence() {
  const snapshot = 'data/nhtsa-complaints-run/complaints.json';
  if (!existsSync(snapshot)) {
    return {
      source: 'NHTSA ODI Public Complaints API',
      snapshot,
      available: false,
    };
  }

  const raw = readFileSync(snapshot, 'utf8');
  const parsed = JSON.parse(raw);
  const rows = parsed.rows || parsed.Results || parsed;
  return {
    source: 'NHTSA ODI Public Complaints API',
    snapshot,
    available: true,
    rowCount: Array.isArray(rows) ? rows.length : 0,
    sha256: createHash('sha256').update(raw).digest('hex'),
  };
}


function maskTrialRecord(trial) {
  if (!trial) return null;
  return {
    runId: trial.runId,
    caseId: trial.caseId,
    vendor: trial.vendor,
    buyer: trial.buyer,
    startedAt: trial.startedAt,
    spendEnvelope: trial.spendEnvelope,
    spendApproval: trial.spendApproval || null,
    policyBlock: trial.policyBlock ? {
      blockedTool: trial.policyBlock.blockedTool,
      status: trial.policyBlock.status,
      blocked: trial.policyBlock.blocked,
      enforcementEngine: trial.policyBlock.enforcementEngine,
      enforcementMode: trial.policyBlock.enforcementMode,
      verificationStatus: trial.policyBlock.verificationStatus,
      attemptedAmount: trial.policyBlock.attemptedAmount,
      cap: trial.policyBlock.cap,
    } : null,
    evidence: trial.evidence ? {
      casesProcessed: trial.evidence.casesProcessed,
      autoRouted: trial.evidence.autoRouted,
      humanReviewQueue: trial.evidence.humanReviewQueue,
      dataHash: maskId(trial.evidence.dataHash),
      classificationMode: trial.evidence.classificationMethod?.mode || null,
      nemotronRequestIdMasked: maskId(trial.evidence.classificationMethod?.nemotronRequestId),
    } : null,
    decision: trial.decision ? {
      verdict: trial.decision.verdict,
      confidence: trial.decision.confidence,
      netValue: trial.decision.netValue,
      riskAdjustedROI: trial.decision.riskAdjustedROI,
      wasteRatio: trial.decision.wasteRatio,
    } : null,
    roiMethodology: trial.roiMethodology ? {
      baseline: {
        inputs: trial.roiMethodology.baseline?.inputs || {},
        result: trial.roiMethodology.baseline?.result || null,
      },
      agent: {
        inputs: trial.roiMethodology.agent?.inputs || {},
        result: trial.roiMethodology.agent?.result || null,
      },
      computed: trial.roiMethodology.computed || null,
      measurementNote: trial.roiMethodology.measurementNote || null,
    } : null,
    productionAccessDecision: trial.productionAccessDecision || null,
    evidenceArtifacts: Array.isArray(trial.evidenceArtifacts)
      ? trial.evidenceArtifacts.map((artifact) => ({ kind: artifact.kind, sha256: maskId(artifact.sha256), bytes: artifact.bytes }))
      : [],
    storedAt: trial.storedAt,
  };
}

function maskProvider(provider = {}) {
  return {
    state: provider.state,
    mode: provider.mode,
    provider: provider.provider,
    detail: provider.detail,
    sandboxId: maskId(provider.sandboxId),
  };
}

function maskAuditEntry(entry = {}) {
  return {
    id: entry.id,
    ts: entry.ts,
    actor: entry.actor,
    action: entry.action,
    kind: entry.kind,
    detail: maskSecrets(entry.detail),
    runId: maskId(entry.runId),
    caseId: entry.caseId || null,
    verdict: entry.verdict || null,
    policyBlocked: typeof entry.policyBlocked === 'boolean' ? entry.policyBlocked : null,
    evidenceHash: maskId(entry.evidenceHash),
    spendApprovalStatus: entry.spendApprovalStatus || null,
    productionAccessApproved: typeof entry.productionAccessApproved === 'boolean' ? entry.productionAccessApproved : null,
    productionAccessStatus: entry.productionAccessStatus || null,
    productionAccessScope: entry.productionAccessScope || null,
    productionAccessBlockers: Array.isArray(entry.productionAccessBlockers)
      ? entry.productionAccessBlockers.slice(0, 5).map((blocker) => maskSecrets(blocker))
      : [],
    strictProofMissing: Array.isArray(entry.strictProofMissing)
      ? entry.strictProofMissing.slice(0, 12).map((item) => maskSecrets(item))
      : [],
  };
}

function maskTraceEvent(event = {}) {
  return {
    ts: event.ts,
    type: event.type,
    body: maskNested(event.body),
  };
}

function maskNested(value) {
  if (value == null) return value;
  if (typeof value === 'string') return maskSecrets(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 8).map(maskNested);

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (/key|secret|token|authorization/i.test(key)) return [key, '[REDACTED]'];
      if (/id|session|receipt|hash/i.test(key)) return [key, maskId(item)];
      return [key, maskNested(item)];
    })
  );
}

function maskSecrets(value) {
  return String(value || '')
    .replace(/sk_(test|live)_[a-zA-Z0-9_]+/g, '[REDACTED_STRIPE_KEY]')
    .replace(/nvapi-[a-zA-Z0-9_-]+/g, '[REDACTED_NVIDIA_KEY]')
    .replace(/cs_(test|live)_[a-zA-Z0-9_]+/g, (match) => maskId(match));
}

function maskId(value) {
  if (!value) return value ?? null;
  const text = String(value);
  if (text.length <= 14) return text;
  return `${text.slice(0, 8)}…${text.slice(-4)}`;
}
