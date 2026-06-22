/**
 * Role-Based Access Control for Agent IC
 *
 * Roles define what actions each enterprise persona can perform.
 * This model maps to segregation-of-duties requirements in procurement workflows.
 */

export const ROLES = {
  buyer: {
    name: 'Buyer',
    description: 'Creates trial requests and views evidence',
    permissions: ['create_trial', 'view_evidence', 'view_renewals', 'view_metrics'],
  },
  reviewer: {
    name: 'Reviewer',
    description: 'Reviews trial evidence and validates claims',
    permissions: ['view_evidence', 'view_metrics', 'validate_claims', 'view_renewals'],
  },
  approver: {
    name: 'Approver',
    description: 'Approves spend envelopes and contract decisions',
    permissions: ['approve_spend', 'approve_contract', 'view_evidence', 'view_metrics', 'view_renewals'],
  },
  auditor: {
    name: 'Auditor',
    description: 'Read-only access to all trial evidence and audit logs',
    permissions: ['view_evidence', 'view_metrics', 'view_renewals', 'view_audit_log', 'export_evidence'],
  },
  admin: {
    name: 'Administrator',
    description: 'Full system access including policy management',
    permissions: [
      'create_trial', 'approve_spend', 'approve_contract',
      'view_evidence', 'view_metrics', 'view_renewals',
      'view_audit_log', 'export_evidence',
      'manage_policy', 'manage_users', 'kill_trial',
    ],
  },
};

/**
 * Check if a role has a specific permission.
 * @param {string} roleKey - Role key (buyer, reviewer, approver, auditor, admin)
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
export function hasPermission(roleKey, permission) {
  const role = ROLES[roleKey];
  if (!role) return false;
  return role.permissions.includes(permission);
}

/**
 * Check if a role can perform an action, throwing if not.
 * @param {string} roleKey
 * @param {string} permission
 * @throws {Error} if permission denied
 */
export function requirePermission(roleKey, permission) {
  if (!hasPermission(roleKey, permission)) {
    throw new Error(`Permission denied: role '${roleKey}' cannot '${permission}'`);
  }
}

/**
 * Get all permissions for a role.
 */
export function getPermissions(roleKey) {
  return ROLES[roleKey]?.permissions || [];
}

/**
 * Get the approval workflow for a trial.
 * Returns the roles that must approve at each gate.
 */
export function getTrialApprovalWorkflow() {
  return [
    { gate: 'trial_creation', requiredRole: 'buyer', description: 'Buyer submits trial request' },
    { gate: 'spend_approval', requiredRole: 'approver', description: 'Approver authorizes spend envelope' },
    { gate: 'evidence_review', requiredRole: 'reviewer', description: 'Reviewer validates trial evidence' },
    { gate: 'contract_decision', requiredRole: 'approver', description: 'Approver signs or rejects contract' },
    { gate: 'audit_review', requiredRole: 'auditor', description: 'Auditor reviews compliance trail' },
  ];
}
