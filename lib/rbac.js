/**
 * Role-Based Access Control for Agent IC.
 *
 * Production roles follow the enterprise production-readiness contract. Legacy
 * legacy prototype role names remain as aliases so older local code/tests keep working.
 */

export const ROLES = {
  owner: {
    name: 'Owner',
    description: 'Tenant owner with administration and policy authority',
    permissions: [
      'create_trial', 'view_evidence', 'view_renewals', 'view_metrics',
      'approve_spend', 'approve_contract', 'manage_policy', 'manage_users',
      'view_audit_log', 'export_evidence', 'reset_trace', 'manage_renewals',
      'clear_renewals', 'kill_trial', 'view_proof_report',
    ],
  },
  procurement_admin: {
    name: 'Procurement Admin',
    description: 'Manages vendor trials, renewal history, and procurement packets',
    permissions: [
      'create_trial', 'view_evidence', 'view_renewals', 'view_metrics',
      'validate_claims', 'approve_contract', 'manage_renewals',
      'view_audit_log', 'export_evidence', 'view_proof_report',
    ],
  },
  finance_approver: {
    name: 'Finance Approver',
    description: 'Approves spend envelopes and budget changes',
    permissions: ['approve_spend', 'view_evidence', 'view_metrics', 'view_renewals', 'view_proof_report'],
  },
  security_reviewer: {
    name: 'Security Reviewer',
    description: 'Reviews policies, blocked actions, and evidence access',
    permissions: ['view_evidence', 'view_metrics', 'validate_claims', 'view_renewals', 'view_audit_log', 'manage_policy', 'view_proof_report'],
  },
  operator: {
    name: 'Operator',
    description: 'Runs bounded trials within approved policies',
    permissions: ['create_trial', 'view_evidence', 'view_metrics', 'view_renewals'],
  },
  auditor: {
    name: 'Auditor',
    description: 'Read-only access to audit logs, evidence, and proof reports',
    permissions: ['view_evidence', 'view_metrics', 'view_renewals', 'view_audit_log', 'export_evidence', 'view_proof_report'],
  },

  // Backward-compatible aliases used by earlier prototype/demo code.
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
  admin: {
    name: 'Administrator',
    description: 'Legacy full-access administrator alias',
    permissions: [
      'create_trial', 'approve_spend', 'approve_contract',
      'view_evidence', 'view_metrics', 'view_renewals',
      'view_audit_log', 'export_evidence', 'view_proof_report',
      'manage_policy', 'manage_users', 'reset_trace', 'manage_renewals',
      'clear_renewals', 'kill_trial',
    ],
  },
};

export function hasPermission(roleKey, permission) {
  const role = ROLES[roleKey];
  if (!role) return false;
  return role.permissions.includes(permission);
}

export function requirePermission(roleKey, permission) {
  if (!hasPermission(roleKey, permission)) {
    throw new Error(`Permission denied: role '${roleKey}' cannot '${permission}'`);
  }
}

export function getPermissions(roleKey) {
  return ROLES[roleKey]?.permissions || [];
}

export function knownRole(roleKey) {
  return Boolean(ROLES[roleKey]);
}

export function getTrialApprovalWorkflow() {
  return [
    { gate: 'trial_creation', requiredRole: 'operator', description: 'Operator submits bounded trial request' },
    { gate: 'spend_approval', requiredRole: 'finance_approver', description: 'Finance approver authorizes spend envelope' },
    { gate: 'evidence_review', requiredRole: 'security_reviewer', description: 'Security reviewer validates policy and evidence' },
    { gate: 'contract_decision', requiredRole: 'procurement_admin', description: 'Procurement admin signs, revises, or rejects contract' },
    { gate: 'audit_review', requiredRole: 'auditor', description: 'Auditor reviews compliance trail' },
  ];
}
