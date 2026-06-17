import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TRACE_DIR = join(process.cwd(), '.agent-ic');
const TRACE_FILE = join(TRACE_DIR, 'live-trace.jsonl');

function ensureTraceFile() {
  if (!existsSync(TRACE_DIR)) {
    mkdirSync(TRACE_DIR, { recursive: true });
  }
  if (!existsSync(TRACE_FILE)) {
    writeFileSync(TRACE_FILE, '', 'utf8');
  }
}

export function clearLiveTrace() {
  ensureTraceFile();
  writeFileSync(TRACE_FILE, '', 'utf8');
}

export function appendLiveTrace(type, body) {
  ensureTraceFile();
  const line = JSON.stringify({ ts: Date.now(), type, body });
  appendFileSync(TRACE_FILE, `${line}\n`, 'utf8');
}

export function readLiveTrace() {
  ensureTraceFile();
  const raw = readFileSync(TRACE_FILE, 'utf8');
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
  return TRACE_FILE;
}
