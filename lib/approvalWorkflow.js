import { incrementCounter, recordEvent } from './observability.js';
import { clearTenantStore, listTenantIds, readTenantCollection, writeTenantCollection } from './tenantStore.js';

const COLLECTION = 'approvals';
const EMPTY_STATE = { approvals: [] };

export function requestSpendApproval({ principal, caseId, spendCap, reason = '', policySummary = '' }) {
  const state = readState(principal.tenantId);
  const approval = {
    id: `appr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tenantId: principal.tenantId,
    requestedBy: principal.userId,
    requestedByRole: principal.role,
    caseId,
    spendCap: Number(spendCap),
    reason: String(reason || '').slice(0, 500),
    policySummary: String(policySummary || '').slice(0, 1000),
    status: 'pending',
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
    decisionReason: null,
  };
  state.approvals.push(approval);
  writeState(principal.tenantId, state);
  incrementCounter('agent_ic_approvals_requested_total', { tenantId: principal.tenantId, caseId });
  recordEvent({ level: 'info', kind: 'approval', action: 'requested', tenantId: principal.tenantId, userId: principal.userId, approvalId: approval.id, caseId, spendCap });
  return approval;
}

export function decideSpendApproval({ principal, approvalId, decision, reason = '' }) {
  const state = readState(principal.tenantId);
  const approval = state.approvals.find((item) => item.id === approvalId && item.tenantId === principal.tenantId);
  if (!approval) return { ok: false, code: 'approval_not_found', message: `Approval not found: ${approvalId}` };
  if (!['approve', 'reject'].includes(decision)) {
    return { ok: false, code: 'invalid_decision', message: 'decision must be approve or reject' };
  }
  if (approval.status !== 'pending') {
    return { ok: false, code: 'approval_already_decided', message: `Approval is already ${approval.status}` };
  }

  approval.status = decision === 'approve' ? 'approved' : 'rejected';
  approval.decidedAt = new Date().toISOString();
  approval.decidedBy = principal.userId;
  approval.decidedByRole = principal.role;
  approval.decisionReason = String(reason || '').slice(0, 500);
  writeState(principal.tenantId, state);
  incrementCounter('agent_ic_approvals_decided_total', { tenantId: principal.tenantId, status: approval.status, caseId: approval.caseId });
  recordEvent({ level: 'info', kind: 'approval', action: approval.status, tenantId: principal.tenantId, userId: principal.userId, approvalId: approval.id, caseId: approval.caseId, spendCap: approval.spendCap });
  return { ok: true, approval };
}

export function listApprovals({ tenantId, status } = {}) {
  const tenantIds = tenantId ? [tenantId] : listTenantIds();
  const approvals = tenantIds.flatMap((id) => readState(id).approvals);
  return approvals
    .filter((item) => !status || item.status === status)
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getApproval({ tenantId, approvalId }) {
  if (!tenantId || !approvalId) return null;
  return readState(tenantId).approvals.find((item) => item.id === approvalId && item.tenantId === tenantId) || null;
}

export function requireApprovedSpend({ tenantId, approvalId, caseId, spendCap }) {
  if (!approvalId) {
    return { ok: false, code: 'approval_required', message: 'Approved spend envelope is required for production trial execution' };
  }
  const approval = getApproval({ tenantId, approvalId });
  if (!approval) return { ok: false, code: 'approval_not_found', message: `Approval not found: ${approvalId}` };
  if (approval.status !== 'approved') return { ok: false, code: 'approval_not_approved', message: `Approval is ${approval.status}` };
  if (approval.caseId !== caseId) return { ok: false, code: 'approval_case_mismatch', message: 'Approval case does not match requested trial case' };
  if (Number(approval.spendCap) < Number(spendCap)) {
    return { ok: false, code: 'approval_cap_too_low', message: 'Approval cap is lower than requested spend envelope' };
  }
  return { ok: true, approval };
}

export function clearApprovals({ tenantId } = {}) {
  if (tenantId) {
    writeState(tenantId, EMPTY_STATE);
    return;
  }
  clearTenantStore();
}

function readState(tenantId) {
  const state = readTenantCollection(tenantId, COLLECTION, EMPTY_STATE);
  return { approvals: Array.isArray(state.approvals) ? state.approvals : [] };
}

function writeState(tenantId, state) {
  return writeTenantCollection(tenantId, COLLECTION, { approvals: state.approvals || [] });
}
