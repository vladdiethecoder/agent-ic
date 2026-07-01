import { createHash } from 'node:crypto';
import { readTenantCollection, writeTenantCollection } from './tenantStore.js';

const COLLECTION = 'idempotency';
const EMPTY_STATE = { records: [] };
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function idempotencyKeyFromRequest(request, body = {}) {
  return request.headers.get('idempotency-key') || request.headers.get('x-idempotency-key') || body.idempotencyKey || '';
}

export function fingerprintPayload(payload) {
  return createHash('sha256').update(stableStringify(payload || {})).digest('hex');
}

export function checkIdempotency({ tenantId, key, scope, fingerprint }) {
  if (!key) return { status: 'disabled' };
  const state = prune(readState(tenantId));
  const record = state.records.find((item) => item.key === key && item.scope === scope);
  writeState(tenantId, state);
  if (!record) return { status: 'new' };
  if (record.fingerprint !== fingerprint) {
    return { status: 'conflict', record };
  }
  if (record.requestStatus === 'in_progress') return { status: 'in_progress', record };
  return { status: 'replay', record };
}

export function beginIdempotentRequest({ tenantId, key, scope, fingerprint }) {
  const checked = checkIdempotency({ tenantId, key, scope, fingerprint });
  if (checked.status !== 'new') return checked;
  if (!key) return checked;
  const state = prune(readState(tenantId));
  const now = Date.now();
  const record = {
    key,
    scope,
    fingerprint,
    requestStatus: 'in_progress',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs()).toISOString(),
  };
  state.records.push(record);
  writeState(tenantId, state);
  return { status: 'new', record };
}

export function completeIdempotentRequest(args) {
  return storeIdempotentResponse(args);
}

export function idempotencyInProgressResponse(record) {
  return {
    error: 'Idempotency key is already processing another request',
    code: 'idempotency_in_progress',
    firstSeenAt: record?.createdAt,
  };
}

export function storeIdempotentResponse({ tenantId, key, scope, fingerprint, responseBody, status = 200 }) {
  if (!key) return null;
  const state = prune(readState(tenantId));
  const now = Date.now();
  const record = {
    key,
    scope,
    fingerprint,
    requestStatus: 'completed',
    status,
    responseBody,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs()).toISOString(),
  };
  const index = state.records.findIndex((item) => item.key === key && item.scope === scope);
  if (index >= 0) state.records[index] = record;
  else state.records.push(record);
  writeState(tenantId, state);
  return record;
}

export function idempotencyHeaders(mode) {
  return mode ? { 'x-agent-ic-idempotency': mode } : {};
}

export function idempotencyConflictResponse(record) {
  return {
    error: 'Idempotency key was already used with a different request payload',
    code: 'idempotency_conflict',
    firstSeenAt: record?.createdAt,
  };
}

export function clearIdempotency({ tenantId }) {
  writeState(tenantId, EMPTY_STATE);
}

function readState(tenantId) {
  const state = readTenantCollection(tenantId, COLLECTION, EMPTY_STATE);
  return { records: Array.isArray(state.records) ? state.records : [] };
}

function writeState(tenantId, state) {
  return writeTenantCollection(tenantId, COLLECTION, { records: state.records || [] });
}

function prune(state) {
  const now = Date.now();
  return {
    records: state.records.filter((record) => !record.expiresAt || Date.parse(record.expiresAt) > now),
  };
}

function ttlMs() {
  const value = Number(process.env.AGENT_IC_IDEMPOTENCY_TTL_MS || DEFAULT_TTL_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TTL_MS;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}
