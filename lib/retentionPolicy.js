import { readTenantCollection, writeTenantCollection } from './tenantStore.js';

const COLLECTION = 'retention-policy';
const DEFAULT_POLICY = Object.freeze({
  auditDays: 2555,
  evidenceDays: 1095,
  trialsDays: 1095,
  paymentsDays: 2555,
  approvalsDays: 1095,
  policiesDays: 2555,
  purgeMode: 'preview_only',
});
const EMPTY_STATE = { policy: DEFAULT_POLICY, legalHolds: [] };

export function getRetentionState({ tenantId }) {
  const state = readState(tenantId);
  return { policy: normalizePolicy(state.policy), legalHolds: state.legalHolds };
}

export function updateRetentionPolicy({ tenantId, updates = {}, updatedBy = 'system' }) {
  const state = readState(tenantId);
  state.policy = normalizePolicy({ ...state.policy, ...updates, updatedBy, updatedAt: new Date().toISOString() });
  writeState(tenantId, state);
  return state.policy;
}

export function createLegalHold({ tenantId, resourceType, resourceId, reason = '', createdBy = 'system' }) {
  const state = readState(tenantId);
  const hold = {
    id: `hold_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tenantId,
    resourceType: String(resourceType || ''),
    resourceId: String(resourceId || ''),
    reason: String(reason || '').slice(0, 500),
    status: 'active',
    createdBy,
    createdAt: new Date().toISOString(),
    releasedBy: null,
    releasedAt: null,
  };
  if (!hold.resourceType || !hold.resourceId) throw new Error('resourceType and resourceId are required');
  state.legalHolds.push(hold);
  writeState(tenantId, state);
  return hold;
}

export function releaseLegalHold({ tenantId, holdId, releasedBy = 'system' }) {
  const state = readState(tenantId);
  const hold = state.legalHolds.find((item) => item.id === holdId && item.status === 'active');
  if (!hold) return { ok: false, code: 'legal_hold_not_found', message: `Legal hold not found: ${holdId}` };
  hold.status = 'released';
  hold.releasedBy = releasedBy;
  hold.releasedAt = new Date().toISOString();
  writeState(tenantId, state);
  return { ok: true, hold };
}

export function listLegalHolds({ tenantId, status } = {}) {
  const holds = readState(tenantId).legalHolds;
  return holds.filter((hold) => !status || hold.status === status).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function evaluateRetention({ tenantId, resources = [], now = new Date() }) {
  const state = getRetentionState({ tenantId });
  const activeHolds = new Set(state.legalHolds.filter((hold) => hold.status === 'active').map((hold) => holdKey(hold.resourceType, hold.resourceId)));
  const evaluated = resources.map((resource) => evaluateResource(resource, state.policy, activeHolds, now));
  return {
    policy: state.policy,
    total: evaluated.length,
    eligibleForReview: evaluated.filter((item) => item.action === 'eligible_for_review').length,
    held: evaluated.filter((item) => item.held).length,
    resources: evaluated,
  };
}

export function resourceFromRecord(resourceType, record) {
  return {
    resourceType,
    resourceId: record.artifactId || record.runId || record.eventId || record.id || record.cycleId || record.policyId || record.caseId || 'unknown',
    createdAt: record.createdAt || record.storedAt || record.receivedAt || record.startedAt || record.ts || record.timestamp || null,
    summary: record.kind || record.action || record.type || record.caseId || record.resourceType || null,
  };
}

function evaluateResource(resource, policy, activeHolds, now) {
  const days = retentionDaysFor(resource.resourceType, policy);
  const created = Date.parse(resource.createdAt || '');
  const expiresAt = Number.isFinite(created) ? new Date(created + days * 24 * 60 * 60 * 1000).toISOString() : null;
  const expired = expiresAt ? Date.parse(expiresAt) <= now.getTime() : false;
  const held = activeHolds.has(holdKey(resource.resourceType, resource.resourceId));
  return {
    ...resource,
    retentionDays: days,
    expiresAt,
    expired,
    held,
    action: held ? 'retain_legal_hold' : expired ? 'eligible_for_review' : 'retain',
  };
}

function retentionDaysFor(type, policy) {
  const key = `${type}Days`;
  return Number(policy[key] || DEFAULT_POLICY[key] || 1095);
}

function holdKey(type, id) {
  return `${type}:${id}`;
}

function readState(tenantId) {
  const state = readTenantCollection(tenantId, COLLECTION, EMPTY_STATE);
  return {
    policy: normalizePolicy(state.policy || DEFAULT_POLICY),
    legalHolds: Array.isArray(state.legalHolds) ? state.legalHolds : [],
  };
}

function writeState(tenantId, state) {
  return writeTenantCollection(tenantId, COLLECTION, { policy: normalizePolicy(state.policy), legalHolds: state.legalHolds || [] });
}

function normalizePolicy(policy = {}) {
  const normalized = { ...DEFAULT_POLICY };
  for (const key of Object.keys(DEFAULT_POLICY)) {
    if (key === 'purgeMode') continue;
    const value = Number(policy[key]);
    normalized[key] = Number.isFinite(value) && value >= 1 ? Math.round(value) : DEFAULT_POLICY[key];
  }
  normalized.purgeMode = 'preview_only';
  if (policy.updatedBy) normalized.updatedBy = String(policy.updatedBy);
  if (policy.updatedAt) normalized.updatedAt = String(policy.updatedAt);
  return normalized;
}
