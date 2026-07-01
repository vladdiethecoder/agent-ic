import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { parseKeyRing, verifyWithKeyRing } from './keyRotation.js';

/**
 * Offline export bundle verification.
 *
 * Recomputes SHA-256 hash and verifies HMAC-SHA256 signature without
 * requiring a running server. Uses only Node.js crypto (no external deps).
 * Supports key ring verification for rotated keys.
 */

export function verifyBundleHash(bundle) {
  const { sha256, signature, signatureAlg, signatureKeyId, signedAt, ...withoutIntegrityFields } = bundle || {};
  const computed = createHash('sha256').update(stableStringify(withoutIntegrityFields)).digest('hex');
  return { ok: computed === bundle?.sha256, computed, expected: bundle?.sha256 };
}

export function verifyBundleSignature(bundle, keyOrRing) {
  if (!bundle?.signature) return { ok: false, code: 'signature_missing' };
  const ring = Array.isArray(keyOrRing) ? keyOrRing : keyOrRing ? [{ key: keyOrRing, keyId: 'default', priority: 1 }] : [];
  if (ring.length === 0) return { ok: false, code: 'signature_key_missing' };
  const expected = (key) => createHmac('sha256', key).update(stableStringify({ sha256: bundle.sha256, signatureAlg: bundle.signatureAlg || 'HMAC-SHA256', signatureKeyId: bundle.signatureKeyId || 'default' })).digest('hex');
  return verifyWithKeyRing(ring, expected, bundle.signature);
}

export function verifyExportBundle(bundle, { key, keyRing, requireSignature = false } = {}) {
  const ring = keyRing || (key ? [{ key, keyId: 'default', priority: 1 }] : []);
  const hash = verifyBundleHash(bundle);
  const signature = verifyBundleSignature(bundle, ring);
  const semantics = verifyBundleSemantics(bundle);
  if (requireSignature && !signature.ok) {
    return { ok: false, code: signature.code, hash, signature, semantics };
  }
  return { ok: hash.ok && signature.ok && semantics.ok, hash, signature, semantics };
}

export function verifyBundleSemantics(bundle = {}) {
  const failures = [];
  const contents = bundle.contents || {};
  const summary = bundle.summary || {};
  const trials = Array.isArray(contents.trials) ? contents.trials : [];
  const evidenceArtifacts = Array.isArray(contents.evidenceArtifacts) ? contents.evidenceArtifacts : [];
  const renewalEvidence = contents.renewalEvidence || {};
  const renewalRelationships = Array.isArray(renewalEvidence.relationships) ? renewalEvidence.relationships : [];
  const renewalCycles = Array.isArray(renewalEvidence.cycles) ? renewalEvidence.cycles : [];

  countMatches(failures, 'trialCount', summary.trialCount, trials.length);
  countMatches(failures, 'evidenceArtifactCount', summary.evidenceArtifactCount, evidenceArtifacts.length);
  countMatches(failures, 'renewalRelationshipCount', summary.renewalRelationshipCount, renewalRelationships.length);
  countMatches(failures, 'renewalCycleCount', summary.renewalCycleCount, renewalCycles.length);

  for (const trial of trials) {
    if (!trial?.runId) failures.push('trial_run_id_missing');
    if (!hasRoiMethodology(trial?.roiMethodology)) failures.push(`trial_roi_methodology_missing:${trial?.runId || 'unknown'}`);
    const decision = trial?.productionAccessDecision || {};
    const blockers = Array.isArray(decision.blockers) ? decision.blockers : [];
    if (decision.approved === true && blockers.length > 0) failures.push(`trial_approved_with_blockers:${trial?.runId || 'unknown'}`);
    if (decision.approved === false && blockers.length === 0) failures.push(`trial_denial_without_blockers:${trial?.runId || 'unknown'}`);
  }

  for (const cycle of renewalCycles) {
    if (!cycle?.cycleId) failures.push('renewal_cycle_id_missing');
    if (!cycle?.runId) failures.push(`renewal_cycle_run_id_missing:${cycle?.cycleId || 'unknown'}`);
    if (!hasRoiMethodology(cycle?.roiMethodology)) failures.push(`renewal_roi_methodology_missing:${cycle?.cycleId || 'unknown'}`);
    if (!cycle?.provenance?.mode) failures.push(`renewal_provenance_missing:${cycle?.cycleId || 'unknown'}`);
  }

  for (const relationship of renewalRelationships) {
    if (!relationship?.caseId) failures.push('renewal_relationship_case_missing');
    if (!relationship?.historyMode) failures.push(`renewal_relationship_history_mode_missing:${relationship?.caseId || 'unknown'}`);
  }

  return { ok: failures.length === 0, failures };
}

function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function countMatches(failures, field, actual, expected) {
  if (Number(actual) !== Number(expected)) failures.push(`${field}_mismatch:${actual ?? 'missing'}!=${expected}`);
}

function hasRoiMethodology(roi = {}) {
  const baseline = Number(roi?.baseline?.result?.totalCost);
  const agent = Number(roi?.agent?.result?.totalCost);
  const netValue = Number(roi?.computed?.netValue?.value);
  const formula = String(roi?.computed?.netValue?.formula || '');
  return Number.isFinite(baseline) &&
    Number.isFinite(agent) &&
    Number.isFinite(netValue) &&
    netValue === baseline - agent &&
    /baseline\.totalCost\s*-\s*agent\.totalCost/.test(formula);
}
