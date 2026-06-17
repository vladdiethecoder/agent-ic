import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sanitizeAuditEntry } from './validation.js';

const globalForAudit = globalThis;
const DEFAULT_AUDIT_FILE = join(process.cwd(), '.agent-ic', 'audit-log.jsonl');
const AUDIT_FILE = process.env.AGENT_IC_AUDIT_FILE || DEFAULT_AUDIT_FILE;
const RETENTION_LIMIT = 100;

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
  const normalized = sanitizeAuditEntry({
    id: `AUD-${String(nextSequence).padStart(6, '0')}`,
    ts: new Date().toISOString(),
    actor: 'Agent IC',
    action: 'recorded event',
    detail: '',
    kind: 'manual',
    ...entry,
  });

  state.sequence = nextSequence;
  state.entries.unshift(normalized);
  state.entries = state.entries.slice(0, RETENTION_LIMIT);
  globalForAudit.__agentIcAuditState = state;
  persistState(state);
  notifyAuditStreamListeners(normalized);
  return normalized;
}

export function readAudit() {
  const state = globalForAudit.__agentIcAuditState || loadState();
  globalForAudit.__agentIcAuditState = state;
  return state.entries;
}

export function resetAudit() {
  globalForAudit.__agentIcAuditState = { sequence: 0, entries: [] };
  persistState(globalForAudit.__agentIcAuditState);
}

function loadState() {
  if (!existsSync(AUDIT_FILE)) return { sequence: 0, entries: [] };
  const lines = readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean);
  const entries = [];
  let sequence = 0;
  for (const line of lines) {
    try {
      const entry = sanitizeAuditEntry(JSON.parse(line));
      entries.push(entry);
      const match = String(entry.id || '').match(/AUD-(\d+)/);
      if (match) sequence = Math.max(sequence, Number(match[1]));
    } catch {
      // Preserve availability if a demo log line is corrupted; new writes rewrite clean retained state.
    }
  }
  entries.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  return { sequence, entries: entries.slice(0, RETENTION_LIMIT) };
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
