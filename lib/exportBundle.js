import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { parseKeyRing, selectSigningKey, verifyWithKeyRing } from './keyRotation.js';
import { logKeyOperation } from './keyAudit.js';
import { readAudit, verifyAuditChain } from './auditStore.js';
import { listApprovals } from './approvalWorkflow.js';
import { listEvidenceArtifacts } from './evidenceStore.js';
import { listPaymentEvents } from './paymentEvents.js';
import { listPolicyVersions } from './policyStore.js';
import { getRenewalExport } from './renewalLedger.js';
import { getRetentionState } from './retentionPolicy.js';
import { listTrialRuns } from './trialStore.js';

export function buildExportBundle({ tenantId, generatedBy = 'system', includeAuditRows = true } = {}) {
  if (!tenantId) throw new Error('tenantId is required');
  const bundle = {
    bundleType: 'agent-ic-export-v1',
    tenantId,
    generatedBy,
    generatedAt: new Date().toISOString(),
    contents: {
      trials: listTrialRuns({ tenantId, limit: 500 }),
      evidenceArtifacts: listEvidenceArtifacts({ tenantId }),
      approvals: listApprovals({ tenantId }),
      policies: listPolicyVersions({ tenantId }),
      payments: listPaymentEvents({ tenantId, limit: 500 }),
      renewalEvidence: getRenewalExport({ tenantId }),
      retention: getRetentionState({ tenantId }),
      auditChain: verifyAuditChain({ tenantId }),
      auditRows: includeAuditRows ? readAudit({ tenantId, limit: 500 }) : undefined,
    },
  };
  bundle.summary = summarize(bundle.contents);
  bundle.sha256 = hashBundle(bundle);
  signExportBundle(bundle);
  return bundle;
}

export function hashBundle(bundle) {
  const { sha256, signature, signatureAlg, signatureKeyId, signedAt, ...withoutIntegrityFields } = bundle;
  return createHash('sha256').update(stableStringify(withoutIntegrityFields)).digest('hex');
}

export function signExportBundle(bundle, env = process.env) {
  const ring = parseKeyRing(env);
  const selected = selectSigningKey(ring);
  if (!selected) return bundle;
  bundle.signatureAlg = 'HMAC-SHA256';
  bundle.signatureKeyId = selected.keyId;
  bundle.signedAt = bundle.signedAt || new Date().toISOString();
  bundle.signature = exportSignature(bundle, selected.key);
  logKeyOperation({ operation: 'sign', keyId: selected.keyId, actor: bundle.generatedBy || 'system', detail: `bundle=${bundle.sha256.slice(0, 16)}... tenant=${bundle.tenantId}` });
  return bundle;
}

export function verifyExportBundleSignature(bundle, env = process.env) {
  const requireSignature = env.AGENT_IC_EXPORT_REQUIRE_SIGNATURES === 'true';
  if (!bundle?.signature) return requireSignature ? { ok: false, code: 'signature_missing' } : { ok: true, code: 'signature_absent_optional' };
  const ring = parseKeyRing(env);
  const expected = (key) => exportSignature(bundle, key);
  const result = verifyWithKeyRing(ring, expected, bundle.signature);
  if (result.ok) return result;
  return requireSignature ? { ok: false, code: result.code } : { ok: true, code: 'signature_absent_optional' };
}

function exportSignature(bundle, key) {
  return createHmac('sha256', key).update(stableStringify({ sha256: bundle.sha256, signatureAlg: bundle.signatureAlg || 'HMAC-SHA256', signatureKeyId: bundle.signatureKeyId || 'default' })).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function summarize(contents) {
  const trials = Array.isArray(contents.trials) ? contents.trials : [];
  const productionAccessApprovedCount = trials.filter((trial) => trial.productionAccessDecision?.approved === true).length;
  const productionAccessDeniedCount = trials.filter((trial) => trial.productionAccessDecision?.approved === false).length;
  const approvalEvidenceCount = trials.filter((trial) => trial.spendApproval?.status === 'approved').length;
  return {
    trialCount: trials.length,
    evidenceArtifactCount: contents.evidenceArtifacts.length,
    approvalCount: contents.approvals.length,
    trialApprovalEvidenceCount: approvalEvidenceCount,
    productionAccessApprovedCount,
    productionAccessDeniedCount,
    policyCount: contents.policies.length,
    paymentEventCount: contents.payments.length,
    renewalRelationshipCount: contents.renewalEvidence?.relationships?.length || 0,
    renewalCycleCount: contents.renewalEvidence?.cycles?.length || 0,
    auditRowCount: contents.auditRows?.length || 0,
    auditChainOk: contents.auditChain.ok,
    activeLegalHoldCount: contents.retention.legalHolds.filter((hold) => hold.status === 'active').length,
  };
}

function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}
