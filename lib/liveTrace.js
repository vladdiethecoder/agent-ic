import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const TRACE_DIR = join(process.cwd(), '.agent-ic');

function traceFile() {
  const configured = process.env.AGENT_IC_LIVE_TRACE_FILE;
  if (!configured) return join(TRACE_DIR, 'live-trace.jsonl');
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

function ensureTraceFile() {
  const file = traceFile();
  const dir = dirname(file);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(file)) {
    writeFileSync(file, '', 'utf8');
  }
}

export function clearLiveTrace() {
  ensureTraceFile();
  writeFileSync(traceFile(), '', 'utf8');
}

export function appendLiveTrace(type, body) {
  ensureTraceFile();
  const line = JSON.stringify({ ts: Date.now(), type, body });
  appendFileSync(traceFile(), `${line}\n`, 'utf8');
}

export function readLiveTrace() {
  ensureTraceFile();
  const raw = readFileSync(traceFile(), 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function getTracePath() {
  ensureTraceFile();
  return traceFile();
}
