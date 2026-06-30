import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { NextResponse } from 'next/server.js';
import { enterpriseCases, GOVERNANCE_INVARIANTS } from '../../../lib/enterpriseCases.js';
import { readAudit, verifyAuditChain } from '../../../lib/auditStore.js';
import { readLiveTrace } from '../../../lib/liveTrace.js';
import { buildProviderStates } from '../../../lib/providerStatus.js';
import { authContext, requireApiAccessAsync } from '../../../lib/authz.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_proof_report');
  if (!access.ok) return access.response;

  const latestAudit = readAudit({ tenantId: access.principal.tenantId, limit: 5 }).map(maskAuditEntry);
  const auditChain = verifyAuditChain({ tenantId: access.principal.tenantId });
  const latestTrace = readLiveTrace().slice(-8).map(maskTraceEvent);
  const providers = buildProviderStates();

  let openshellAvailable = false;
  try {
    const { isOpenShellAvailable } = await import('../../../lib/openShellIntegration.js');
    openshellAvailable = isOpenShellAvailable();
  } catch {
    openshellAvailable = false;
  }

  return NextResponse.json({
    ok: true,
    product: 'Agent IC',
    auth: authContext(access.principal),
    claim:
      'Agent IC governs agentic-service procurement through bounded spend, policy enforcement, workload evidence, and evidence-backed renewal decisions.',
    proofSurfaces: {
      primaryRoute: '/trial',
      spend: 'Stripe test-mode Checkout Session for a bounded dollar envelope',
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
    invariants: GOVERNANCE_INVARIANTS,
    latestAudit,
    auditChain,
    latestTrace,
  });
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
