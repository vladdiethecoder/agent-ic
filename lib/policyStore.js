import { createHash } from 'node:crypto';
import { readTenantCollection, writeTenantCollection } from './tenantStore.js';

const COLLECTION = 'policies';
const EMPTY_STATE = { policies: [] };

export function createPolicyVersion({ tenantId, caseId, envelope, createdBy = 'system', status = 'draft', notes = '' }) {
  if (!tenantId) throw new Error('tenantId is required');
  if (!caseId) throw new Error('caseId is required');
  const state = readState(tenantId);
  const nextVersion = 1 + Math.max(0, ...state.policies.filter((p) => p.caseId === caseId).map((p) => Number(p.version) || 0));
  const policy = normalizePolicyEnvelope(envelope);
  const record = {
    id: `pol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tenantId,
    caseId,
    version: nextVersion,
    status,
    policy,
    policyHash: hashPolicy(policy),
    notes: String(notes || '').slice(0, 500),
    createdBy,
    createdAt: new Date().toISOString(),
    activatedAt: status === 'active' ? new Date().toISOString() : null,
    activatedBy: status === 'active' ? createdBy : null,
  };
  if (record.status === 'active') deactivateCasePolicies(state, caseId);
  state.policies.push(record);
  writeState(tenantId, state);
  return record;
}

export function listPolicyVersions({ tenantId, caseId, status } = {}) {
  if (!tenantId) return [];
  let policies = readState(tenantId).policies;
  if (caseId) policies = policies.filter((policy) => policy.caseId === caseId);
  if (status) policies = policies.filter((policy) => policy.status === status);
  return policies.slice().sort((a, b) => b.version - a.version || String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getPolicyVersion({ tenantId, policyId }) {
  if (!tenantId || !policyId) return null;
  return readState(tenantId).policies.find((policy) => policy.id === policyId) || null;
}

export function getActivePolicyVersion({ tenantId, caseId }) {
  return listPolicyVersions({ tenantId, caseId, status: 'active' })[0] || null;
}

export function activatePolicyVersion({ tenantId, policyId, activatedBy }) {
  const state = readState(tenantId);
  const policy = state.policies.find((item) => item.id === policyId);
  if (!policy) return { ok: false, code: 'policy_not_found', message: `Policy not found: ${policyId}` };
  const simulation = simulatePolicy({ policy: policy.policy, attemptedAction: policy.policy.blockedTool });
  if (!simulation.blocked) return { ok: false, code: 'policy_simulation_failed', message: 'Policy cannot be activated because blocked tool simulation did not deny' };
  deactivateCasePolicies(state, policy.caseId);
  policy.status = 'active';
  policy.activatedAt = new Date().toISOString();
  policy.activatedBy = activatedBy;
  writeState(tenantId, state);
  return { ok: true, policy };
}

export function diffPolicyVersions({ fromPolicy, toPolicy }) {
  const from = normalizePolicyEnvelope(fromPolicy || {});
  const to = normalizePolicyEnvelope(toPolicy || {});
  return {
    spendCap: from.spendCap === to.spendCap ? null : { from: from.spendCap, to: to.spendCap },
    currency: from.currency === to.currency ? null : { from: from.currency, to: to.currency },
    allowedTools: diffArrays(from.allowedTools, to.allowedTools),
    networkPolicy: from.networkPolicy === to.networkPolicy ? null : { from: from.networkPolicy, to: to.networkPolicy },
    blockedTool: JSON.stringify(from.blockedTool) === JSON.stringify(to.blockedTool) ? null : { from: from.blockedTool, to: to.blockedTool },
    hashChanged: hashPolicy(from) !== hashPolicy(to),
  };
}

export function simulatePolicy({ policy, attemptedAction = {} }) {
  const normalized = normalizePolicyEnvelope(policy || {});
  const amount = Number(attemptedAction.attemptedAmount ?? attemptedAction.amount ?? 0);
  const tool = attemptedAction.name || attemptedAction.tool || '';
  const ruleMatchesBlockedTool = normalized.blockedTool?.name && tool && normalized.blockedTool.name === tool;
  const amountOverCap = Number.isFinite(amount) && amount > Number(normalized.spendCap || 0);
  const notAllowlisted = tool ? !normalized.allowedTools.includes(tool) : false;
  const blocked = Boolean(ruleMatchesBlockedTool || amountOverCap || notAllowlisted);
  const reasons = [];
  if (ruleMatchesBlockedTool) reasons.push('blocked_tool');
  if (amountOverCap) reasons.push('spend_cap_exceeded');
  if (notAllowlisted) reasons.push('tool_not_allowlisted');
  return {
    blocked,
    status: blocked ? 403 : 200,
    reasons,
    spendCap: normalized.spendCap,
    attemptedAmount: Number.isFinite(amount) ? amount : 0,
    tool: tool || null,
  };
}

export function normalizePolicyEnvelope(envelope = {}) {
  return {
    spendCap: Number(envelope.spendCap ?? 0),
    currency: String(envelope.currency || 'USD'),
    allowedTools: Array.isArray(envelope.allowedTools) ? envelope.allowedTools.map(String).sort() : [],
    networkPolicy: String(envelope.networkPolicy || ''),
    blockedTool: envelope.blockedTool ? {
      name: String(envelope.blockedTool.name || ''),
      category: String(envelope.blockedTool.category || ''),
      attemptedAmount: Number(envelope.blockedTool.attemptedAmount || 0),
      policyRule: String(envelope.blockedTool.policyRule || ''),
      reason: String(envelope.blockedTool.reason || ''),
    } : null,
  };
}

export function hashPolicy(policy) {
  return createHash('sha256').update(stableStringify(normalizePolicyEnvelope(policy))).digest('hex');
}

function deactivateCasePolicies(state, caseId) {
  for (const policy of state.policies) {
    if (policy.caseId === caseId && policy.status === 'active') policy.status = 'retired';
  }
}

function readState(tenantId) {
  const state = readTenantCollection(tenantId, COLLECTION, EMPTY_STATE);
  return { policies: Array.isArray(state.policies) ? state.policies : [] };
}

function writeState(tenantId, state) {
  return writeTenantCollection(tenantId, COLLECTION, { policies: state.policies || [] });
}

function diffArrays(from = [], to = []) {
  const a = new Set(from);
  const b = new Set(to);
  return {
    added: [...b].filter((item) => !a.has(item)).sort(),
    removed: [...a].filter((item) => !b.has(item)).sort(),
  };
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}
