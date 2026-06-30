import { readTenantCollection, writeTenantCollection } from './tenantStore.js';
import { knownRole } from './rbac.js';

const COLLECTION = 'memberships';
const EMPTY_STATE = { memberships: [] };

export function upsertMembership({ tenantId, userId, role, status = 'active', displayName = '', updatedBy = 'system', externalId = undefined, emails = undefined, scimSyncedAt = undefined, scimSource = undefined } = {}) {
  if (!tenantId) throw new Error('tenantId is required');
  if (!userId) throw new Error('userId is required');
  if (!knownRole(role)) throw new Error(`Unknown role: ${role}`);
  const state = readState(tenantId);
  const existing = state.memberships.find((item) => item.userId === userId);
  const now = new Date().toISOString();
  const membership = existing || { tenantId, userId, createdAt: now, createdBy: updatedBy };
  membership.role = role;
  membership.status = status === 'inactive' ? 'inactive' : 'active';
  membership.displayName = String(displayName || membership.displayName || '').slice(0, 200);
  if (externalId !== undefined) membership.externalId = String(externalId || '').slice(0, 200);
  if (emails !== undefined) membership.emails = normalizeEmails(emails);
  if (scimSyncedAt !== undefined) membership.scimSyncedAt = String(scimSyncedAt || now);
  if (scimSource !== undefined) membership.scimSource = String(scimSource || '').slice(0, 100);
  membership.updatedAt = now;
  membership.updatedBy = updatedBy;
  if (!existing) state.memberships.push(membership);
  writeState(tenantId, state);
  return membership;
}

export function getMembership({ tenantId, userId }) {
  if (!tenantId || !userId) return null;
  return readState(tenantId).memberships.find((item) => item.userId === userId) || null;
}

export function listMemberships({ tenantId, status } = {}) {
  if (!tenantId) return [];
  return readState(tenantId).memberships
    .filter((item) => !status || item.status === status)
    .slice()
    .sort((a, b) => String(a.userId).localeCompare(String(b.userId)));
}

export function deactivateMembership({ tenantId, userId, updatedBy = 'system' }) {
  const membership = getMembership({ tenantId, userId });
  if (!membership) return { ok: false, code: 'membership_not_found', message: `Membership not found: ${userId}` };
  const updated = upsertMembership({ tenantId, userId, role: membership.role, status: 'inactive', displayName: membership.displayName, updatedBy });
  return { ok: true, membership: updated };
}

export function assertActiveMembership({ tenantId, userId, role }) {
  const membership = getMembership({ tenantId, userId });
  if (!membership || membership.status !== 'active') {
    return { ok: false, code: 'membership_required', message: 'Active tenant membership is required' };
  }
  if (membership.role !== role) {
    return { ok: false, code: 'membership_role_mismatch', message: 'Token role does not match stored tenant membership role' };
  }
  return { ok: true, membership };
}

function normalizeEmails(emails) {
  if (!Array.isArray(emails)) return [];
  return emails
    .map((email) => ({ value: String(email?.value || email || '').slice(0, 320), primary: Boolean(email?.primary), type: String(email?.type || 'work').slice(0, 40) }))
    .filter((email) => email.value);
}

function readState(tenantId) {
  const state = readTenantCollection(tenantId, COLLECTION, EMPTY_STATE);
  return { memberships: Array.isArray(state.memberships) ? state.memberships : [] };
}

function writeState(tenantId, state) {
  return writeTenantCollection(tenantId, COLLECTION, { memberships: state.memberships || [] });
}
