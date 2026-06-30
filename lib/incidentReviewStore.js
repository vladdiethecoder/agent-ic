import { readTenantCollection, writeTenantCollection } from './tenantStore.js';

const COLLECTION = 'incident-reviews';
const EMPTY_STATE = { incidents: [] };
const STATUSES = new Set(['open', 'investigating', 'mitigated', 'closed', 'drill_completed']);
const SEVERITIES = new Set(['info', 'warning', 'critical']);

export function createIncidentReview({ tenantId, title, severity = 'warning', sourceAlertId = '', runbook = '', owner = '', summary = '', evidence = {}, drill = false, createdBy = 'system' }) {
  if (!tenantId) throw new Error('tenantId is required');
  if (!title) throw new Error('title is required');
  const state = readState(tenantId);
  const now = new Date().toISOString();
  const incident = {
    id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tenantId,
    title: String(title).slice(0, 200),
    severity: normalizeSeverity(severity),
    status: drill ? 'drill_completed' : 'open',
    sourceAlertId: String(sourceAlertId || '').slice(0, 120),
    runbook: String(runbook || '').slice(0, 240),
    owner: String(owner || createdBy || 'unassigned').slice(0, 120),
    summary: String(summary || '').slice(0, 1200),
    correctiveActions: [],
    evidence: normalizeEvidence(evidence),
    drill: Boolean(drill),
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
    closedAt: drill ? now : null,
  };
  state.incidents.push(incident);
  writeState(tenantId, state);
  return incident;
}

export function updateIncidentReview({ tenantId, incidentId, status, summary, correctiveAction, evidence, updatedBy = 'system' }) {
  if (!tenantId) throw new Error('tenantId is required');
  if (!incidentId) throw new Error('incidentId is required');
  const state = readState(tenantId);
  const incident = state.incidents.find((item) => item.id === incidentId);
  if (!incident) return { ok: false, code: 'incident_not_found', message: `Incident review not found: ${incidentId}` };
  const now = new Date().toISOString();
  if (status !== undefined) incident.status = normalizeStatus(status);
  if (summary !== undefined) incident.summary = String(summary || '').slice(0, 1200);
  if (correctiveAction) {
    incident.correctiveActions.push({ text: String(correctiveAction).slice(0, 800), addedAt: now, addedBy: updatedBy });
  }
  if (evidence !== undefined) incident.evidence = { ...incident.evidence, ...normalizeEvidence(evidence) };
  incident.updatedAt = now;
  incident.updatedBy = updatedBy;
  if (['closed', 'drill_completed'].includes(incident.status) && !incident.closedAt) incident.closedAt = now;
  writeState(tenantId, state);
  return { ok: true, incident };
}

export function listIncidentReviews({ tenantId, status, limit = 50 } = {}) {
  if (!tenantId) return [];
  return readState(tenantId).incidents
    .filter((incident) => !status || incident.status === status)
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, Math.max(0, Number(limit) || 50));
}

export function getIncidentReview({ tenantId, incidentId }) {
  if (!tenantId || !incidentId) return null;
  return readState(tenantId).incidents.find((incident) => incident.id === incidentId) || null;
}

export function incidentSummary({ tenantId } = {}) {
  const incidents = listIncidentReviews({ tenantId, limit: 500 });
  return {
    total: incidents.length,
    open: incidents.filter((incident) => incident.status === 'open').length,
    investigating: incidents.filter((incident) => incident.status === 'investigating').length,
    mitigated: incidents.filter((incident) => incident.status === 'mitigated').length,
    closed: incidents.filter((incident) => incident.status === 'closed').length,
    drills: incidents.filter((incident) => incident.drill || incident.status === 'drill_completed').length,
    critical: incidents.filter((incident) => incident.severity === 'critical').length,
  };
}

function readState(tenantId) {
  const state = readTenantCollection(tenantId, COLLECTION, EMPTY_STATE);
  return { incidents: Array.isArray(state.incidents) ? state.incidents : [] };
}

function writeState(tenantId, state) {
  return writeTenantCollection(tenantId, COLLECTION, { incidents: state.incidents || [] });
}

function normalizeStatus(status) {
  const value = String(status || 'open');
  if (!STATUSES.has(value)) throw new Error(`Unknown incident status: ${value}`);
  return value;
}

function normalizeSeverity(severity) {
  const value = String(severity || 'warning');
  if (!SEVERITIES.has(value)) throw new Error(`Unknown incident severity: ${value}`);
  return value;
}

function normalizeEvidence(evidence = {}) {
  return Object.fromEntries(
    Object.entries(evidence || {}).map(([key, value]) => [String(key).slice(0, 80), String(value ?? '').slice(0, 500)])
  );
}
