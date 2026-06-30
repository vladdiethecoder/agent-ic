import { randomUUID } from 'node:crypto';
import { logKeyOperation } from './keyAudit.js';

/**
 * Key operation approval workflow foundation.
 *
 * Provides request/approve workflow for sensitive key operations.
 * Integrates with the existing approval store for persistence.
 */

// In-memory store for key operation approvals (replace with durable store in production)
const keyApprovalStore = new Map();

export function requestKeyOperation({ operation, keyId, requester, justification, tenantId }) {
  const approvalId = `key-op-${randomUUID()}`;
  const request = {
    approvalId,
    operation,
    keyId,
    requester,
    justification,
    tenantId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    approvedAt: null,
    approver: null,
  };
  keyApprovalStore.set(approvalId, request);

  logKeyOperation({
    operation: 'approval_request',
    keyId: keyId || 'unknown',
    actor: requester,
    detail: `approvalId=${approvalId} operation=${operation}`,
    tenantId,
  });

  return request;
}

export function approveKeyOperation({ approvalId, approver, tenantId }) {
  const request = keyApprovalStore.get(approvalId);
  if (!request) {
    return { ok: false, code: 'not_found', message: 'Approval request not found' };
  }
  if (request.tenantId !== tenantId) {
    return { ok: false, code: 'tenant_mismatch', message: 'Tenant mismatch' };
  }
  if (request.status !== 'pending') {
    return { ok: false, code: 'already_processed', message: `Request already ${request.status}` };
  }

  request.status = 'approved';
  request.approvedAt = new Date().toISOString();
  request.approver = approver;
  keyApprovalStore.set(approvalId, request);

  logKeyOperation({
    operation: 'approval_approve',
    keyId: request.keyId || 'unknown',
    actor: approver,
    detail: `approvalId=${approvalId} operation=${request.operation}`,
    tenantId,
  });

  return { ok: true, request };
}

export function rejectKeyOperation({ approvalId, approver, tenantId }) {
  const request = keyApprovalStore.get(approvalId);
  if (!request) {
    return { ok: false, code: 'not_found', message: 'Approval request not found' };
  }
  if (request.tenantId !== tenantId) {
    return { ok: false, code: 'tenant_mismatch', message: 'Tenant mismatch' };
  }
  if (request.status !== 'pending') {
    return { ok: false, code: 'already_processed', message: `Request already ${request.status}` };
  }

  request.status = 'rejected';
  request.approvedAt = new Date().toISOString();
  request.approver = approver;
  keyApprovalStore.set(approvalId, request);

  logKeyOperation({
    operation: 'approval_reject',
    keyId: request.keyId || 'unknown',
    actor: approver,
    detail: `approvalId=${approvalId} operation=${request.operation}`,
    tenantId,
  });

  return { ok: true, request };
}

export function getKeyOperationRequest(approvalId) {
  return keyApprovalStore.get(approvalId) || null;
}

export function listKeyOperationRequests({ tenantId, status = 'pending' } = {}) {
  const requests = Array.from(keyApprovalStore.values());
  return requests.filter((r) => {
    if (tenantId && r.tenantId !== tenantId) return false;
    if (status && r.status !== status) return false;
    return true;
  });
}

export function requireApprovedOperation({ approvalId, operation, tenantId }) {
  if (!approvalId) {
    return { ok: false, code: 'approval_required', message: `Approval required for ${operation}` };
  }
  const request = keyApprovalStore.get(approvalId);
  if (!request) {
    return { ok: false, code: 'approval_not_found', message: 'Approval request not found' };
  }
  if (request.tenantId !== tenantId) {
    return { ok: false, code: 'tenant_mismatch', message: 'Tenant mismatch' };
  }
  if (request.status !== 'approved') {
    return { ok: false, code: 'not_approved', message: `Request is ${request.status}, not approved` };
  }
  if (request.operation !== operation) {
    return { ok: false, code: 'operation_mismatch', message: 'Approval operation mismatch' };
  }
  return { ok: true, request };
}

export function resetKeyApprovalStore() {
  keyApprovalStore.clear();
}
