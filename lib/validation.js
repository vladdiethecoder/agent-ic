import { NextResponse } from 'next/server.js';
import { verifyCsrfForSession } from './sessionStore.js';

export const MAX_JSON_BYTES = 32 * 1024;

export function jsonError(status, code, message, extra = {}) {
  return NextResponse.json({ error: message, code, ...extra }, { status });
}

export async function readJsonBody(request, { maxBytes = MAX_JSON_BYTES } = {}) {
  const csrf = csrfCheck(request);
  if (!csrf.ok) return { ok: false, response: jsonError(403, csrf.code, csrf.message) };
  const text = await request.text();
  if (text.length > maxBytes) {
    return { ok: false, response: jsonError(413, 'request_too_large', `JSON body exceeds ${maxBytes} bytes`) };
  }
  if (!text.trim()) return { ok: true, body: {} };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, response: jsonError(400, 'invalid_json_shape', 'JSON body must be an object') };
    }
    return { ok: true, body };
  } catch {
    return { ok: false, response: jsonError(400, 'malformed_json', 'Malformed JSON body') };
  }
}

function csrfCheck(request) {
  const method = String(request?.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return { ok: true };
  const path = safePathname(request);
  if (path === '/api/session') return { ok: true };
  return verifyCsrfForSession(request);
}

function safePathname(request) {
  try { return new URL(request.url).pathname; } catch { return ''; }
}

export function getProposalOrError(proposals, proposalId, { allowDefault = false } = {}) {
  if (!proposalId && allowDefault) return { proposal: proposals[0] };
  if (!proposalId || typeof proposalId !== 'string') {
    return { response: jsonError(400, 'missing_proposal_id', 'proposalId is required') };
  }
  const proposal = proposals.find((item) => item.id === proposalId);
  if (!proposal) {
    return { response: jsonError(404, 'proposal_not_found', `Proposal not found: ${proposalId}`) };
  }
  return { proposal };
}

export function sanitizeProviderError(value) {
  const text = value instanceof Error ? value.message : String(value || 'provider error');
  return redactSecrets(text).slice(0, 240);
}

export function redactSecrets(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/cs_(test|live)_[A-Za-z0-9._-]+/g, '[CHECKOUT_SESSION]')
    .replace(/sk_(test|live)_[A-Za-z0-9._-]+/g, '[REDACTED]')
    .replace(/sk_(tes|liv)\.\.\.[A-Za-z0-9._-]+/g, '[REDACTED]')
    .replace(/nvapi-[A-Za-z0-9._-]+/g, '[REDACTED]')
    .replace(/(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

export function sanitizeAuditEntry(entry) {
  const normalized = {};
  for (const [key, value] of Object.entries(entry || {})) {
    // Keep opaque identifiers readable in audit rows; redact them inside free-text detail fields.
    const keepPlain = ['stripeSessionId', 'sessionId', 'paymentIntentId', 'id'].includes(key);
    normalized[key] = typeof value === 'string' && !keepPlain ? redactSecrets(value).slice(0, 1200) : value;
  }
  return normalized;
}

export function assertValidProposal(proposal) {
  const checks = [
    ['ask', proposal.ask, 0, 1_000_000_000],
    ['durationWeeks', proposal.durationWeeks, 1, 104],
    ['dataReadiness', proposal.dataReadiness, 0, 100],
    ['integrationRisk', proposal.integrationRisk, 0, 100],
    ['complianceRisk', proposal.complianceRisk, 0, 100],
    ['businessUrgency', proposal.businessUrgency, 0, 100],
    ['automationLeverage', proposal.automationLeverage, 0, 100],
    ['baseline.monthlyCases', proposal.baseline?.monthlyCases, 0, 1_000_000_000],
    ['baseline.manualMinutesPerCase', proposal.baseline?.manualMinutesPerCase, 0, 1440],
    ['baseline.loadedHourlyCost', proposal.baseline?.loadedHourlyCost, 0, 100_000],
    ['baseline.refundLeakageMonthly', proposal.baseline?.refundLeakageMonthly, 0, 1_000_000_000],
    ['baseline.churnRiskMonthly', proposal.baseline?.churnRiskMonthly, 0, 1_000_000_000],
    ['target.deflectionRate', proposal.target?.deflectionRate, 0, 1],
    ['target.minutesSavedPerCase', proposal.target?.minutesSavedPerCase, 0, 1440],
    ['target.leakageReduction', proposal.target?.leakageReduction, 0, 1],
  ];
  for (const [name, value, min, max] of checks) {
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`invalid proposal numeric field: ${name}`);
    }
  }
  if (!Array.isArray(proposal.evidencePlan) || proposal.evidencePlan.length === 0) {
    throw new Error('invalid proposal evidence plan');
  }
}

export function isKillDecision(evaluation) {
  return String(evaluation?.decision || '').toUpperCase() === 'KILL';
}
