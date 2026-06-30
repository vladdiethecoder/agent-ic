import { logKeyOperation } from './keyAudit.js';

/**
 * Key access policy enforcement foundation.
 *
 * Defines RBAC permissions for key operations and provides
 * guards for the KMS adapter and API endpoints.
 */

export const KEY_PERMISSIONS = {
  key_generate: ['owner', 'procurement_admin', 'system'],
  key_rotate: ['owner', 'procurement_admin', 'system'],
  key_sign: ['owner', 'procurement_admin', 'system', 'auditor'],
  key_verify: ['owner', 'procurement_admin', 'system', 'auditor', 'operator'],
  key_read_metadata: ['owner', 'procurement_admin', 'system', 'auditor', 'operator'],
  key_audit: ['owner', 'auditor', 'procurement_admin'],
};

export function hasKeyAccess(role, operation) {
  const allowed = KEY_PERMISSIONS[operation];
  if (!allowed) return false;
  return allowed.includes(role);
}

export function requireKeyAccess(principal, operation) {
  if (!principal || !principal.role) {
    return { ok: false, code: 'unauthenticated', response: null };
  }
  if (hasKeyAccess(principal.role, operation)) {
    return { ok: true };
  }
  logKeyOperation({
    operation: 'access_denied',
    keyId: 'policy',
    actor: principal.userId || 'unknown',
    detail: `role=${principal.role} operation=${operation}`,
    tenantId: principal.tenantId || 'system',
  });
  return { ok: false, code: 'forbidden', response: null };
}

export function keyAccessPolicy() {
  return {
    permissions: KEY_PERMISSIONS,
    version: '2026-06-23-v1',
  };
}
