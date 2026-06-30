import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseKeyRing, selectSigningKey, verifyWithKeyRing } from './keyRotation.js';
import { sanitizeAuditEntry } from './validation.js';
import { incrementCounter, recordEvent, setGauge } from './observability.js';

const globalForAudit = globalThis;
const DEFAULT_AUDIT_FILE = join(process.cwd(), '.agent-ic', 'audit-log.jsonl');
const AUDIT_FILE = process.env.AGENT_IC_AUDIT_FILE || DEFAULT_AUDIT_FILE;
const RETENTION_LIMIT = Number(process.env.AGENT_IC_AUDIT_RETENTION_LIMIT || 500);
const ROOT_HASH = '0'.repeat(64);

if (!globalForAudit.__agentIcAuditState) {
  globalForAudit.__agentIcAuditState = loadState();
}

if (!globalForAudit.__agentIcAuditStreamListeners) {
  globalForAudit.__agentIcAuditStreamListeners = new Set();
}

export function subscribeAuditStream(listener) {
  globalForAudit.__agentIcAuditStreamListeners.add(listener);
  return () => {
    globalForAudit.__agentIcAuditStreamListeners.delete(listener);
  };
}

function notifyAuditStreamListeners(entry) {
  globalForAudit.__agentIcAuditStreamListeners.forEach((listener) => {
    try {
      listener(entry);
    } catch {
      // Ignore listener errors so a misbehaving client cannot break the store.
    }
  });
}

export function appendAudit(entry) {
  const state = globalForAudit.__agentIcAuditState || loadState();
  const nextSequence = state.sequence + 1;
  const previousHash = state.entries[0]?.hash || state.lastHash || ROOT_HASH;
  const normalized = sanitizeAuditEntry({
    id: `AUD-${String(nextSequence).padStart(6, '0')}`,
    seq: nextSequence,
    ts: new Date().toISOString(),
    actor: 'Agent IC',
    action: 'recorded event',
    detail: '',
    kind: 'manual',
    tenantId: 'demo-tenant',
    userId: 'system',
    role: 'system',
    ...entry,
    previousHash,
  });
  normalized.hash = hashAuditEntry(normalized);
  signAuditEntry(normalized);

  state.sequence = nextSequence;
  state.lastHash = normalized.hash;
  state.entries.unshift(normalized);
  state.entries = state.entries.slice(0, RETENTION_LIMIT);
  globalForAudit.__agentIcAuditState = state;
  persistState(state);
  incrementCounter('agent_ic_audit_entries_total', { kind: normalized.kind || 'manual', action: normalized.action || 'unknown', tenantId: normalized.tenantId || 'unknown' });
  setGauge('agent_ic_audit_entries_retained', {}, state.entries.length);
  recordEvent({ level: 'info', kind: 'audit', action: normalized.action || 'recorded', tenantId: normalized.tenantId, userId: normalized.userId, auditId: normalized.id });
  notifyAuditStreamListeners(normalized);
  return normalized;
}

export function readAudit({ tenantId, limit } = {}) {
  const state = globalForAudit.__agentIcAuditState || loadState();
  globalForAudit.__agentIcAuditState = state;
  let entries = state.entries;
  if (tenantId) entries = entries.filter((entry) => !entry.tenantId || entry.tenantId === tenantId);
  if (Number.isInteger(limit) && limit >= 0) entries = entries.slice(0, limit);
  return entries;
}

export function resetAudit() {
  globalForAudit.__agentIcAuditState = { sequence: 0, lastHash: ROOT_HASH, entries: [] };
  persistState(globalForAudit.__agentIcAuditState);
}

export function verifyAuditChain({ tenantId } = {}) {
  const entries = readAudit({ tenantId }).slice().reverse();
  const failures = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const expectedHash = hashAuditEntry(entry);
    if (entry.hash !== expectedHash) {
      failures.push({ id: entry.id, code: 'hash_mismatch' });
    }
    const signature = verifyAuditSignature(entry);
    if (!signature.ok) failures.push({ id: entry.id, code: signature.code });
    const next = entries[i + 1];
    if (next && next.previousHash !== entry.hash) {
      failures.push({ id: next.id, code: 'previous_hash_mismatch', expected: entry.hash, actual: next.previousHash });
    }
  }

  if (failures.length > 0) incrementCounter('agent_ic_audit_chain_failures_total', { tenantId: tenantId || 'all' }, failures.length);
  return {
    ok: failures.length === 0,
    checked: entries.length,
    failures,
    latestHash: entries.at(-1)?.hash || ROOT_HASH,
    signatures: signatureSummary(entries),
    partial: entries.length >= RETENTION_LIMIT,
  };
}

export function hashAuditEntry(entry) {
  const { hash, signature, signatureAlg, signatureKeyId, signedAt, ...withoutIntegrityFields } = entry || {};
  return createHash('sha256').update(stableStringify(withoutIntegrityFields)).digest('hex');
}

export function signAuditEntry(entry, env = process.env) {
  const ring = parseKeyRing(env);
  const selected = selectSigningKey(ring);
  if (!selected) return entry;
  entry.signatureAlg = 'HMAC-SHA256';
  entry.signatureKeyId = selected.keyId;
  entry.signedAt = entry.signedAt || new Date().toISOString();
  entry.signature = auditSignature(entry, selected.key);
  return entry;
}

export function verifyAuditSignature(entry, env = process.env) {
  const requireSignature = env.AGENT_IC_AUDIT_REQUIRE_SIGNATURES === 'true';
  if (!entry.signature) {
    return requireSignature ? { ok: false, code: 'signature_missing' } : { ok: true, code: 'signature_absent_optional' };
  }
  const ring = parseKeyRing(env);
  const expected = (key) => auditSignature(entry, key);
  const result = verifyWithKeyRing(ring, expected, entry.signature);
  if (result.ok) return result;
  return requireSignature ? { ok: false, code: result.code } : { ok: true, code: 'signature_absent_optional' };
}

function signatureSummary(entries) {
  const signed = entries.filter((entry) => entry.signature).length;
  return { checked: entries.length, signed, unsigned: entries.length - signed, required: process.env.AGENT_IC_AUDIT_REQUIRE_SIGNATURES === 'true' };
}

function auditSignature(entry, key) {
  return createHmac('sha256', key).update(stableStringify({ hash: entry.hash, signatureAlg: entry.signatureAlg || 'HMAC-SHA256', signatureKeyId: entry.signatureKeyId || 'default' })).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function loadState() {
  if (!existsSync(AUDIT_FILE)) return { sequence: 0, lastHash: ROOT_HASH, entries: [] };
  const lines = readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean);
  const entries = [];
  let sequence = 0;
  let lastHash = ROOT_HASH;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const entry = sanitizeAuditEntry(parsed);
      if (!entry.previousHash) entry.previousHash = entries.at(-1)?.hash || ROOT_HASH;
      if (!entry.hash) entry.hash = hashAuditEntry(entry);
      entries.push(entry);
      const seq = Number(entry.seq) || Number(String(entry.id || '').match(/AUD-(\d+)/)?.[1]) || 0;
      sequence = Math.max(sequence, seq);
      lastHash = entry.hash || lastHash;
    } catch {
      // Preserve availability if a demo log line is corrupted; new writes rewrite clean retained state.
    }
  }
  entries.sort((a, b) => (Number(b.seq) || 0) - (Number(a.seq) || 0));
  return { sequence, lastHash, entries: entries.slice(0, RETENTION_LIMIT) };
}

function persistState(state) {
  mkdirSync(dirname(AUDIT_FILE), { recursive: true });
  const content = state.entries
    .slice()
    .reverse()
    .map((entry) => JSON.stringify(entry))
    .join('\n');
  writeFileSync(AUDIT_FILE, content ? `${content}\n` : '');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}
