import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const base = process.env.AGENT_IC_BASE_URL || 'http://localhost:3000';
const outDir = process.env.AGENT_IC_QA_DIR || '.agent-ic/qa';
const chrome = process.env.CHROME_BIN || findChrome();

function main() {
  mkdirSync(outDir, { recursive: true });
  const domPath = join(outDir, 'dom.html');
  const topPath = join(outDir, 'top-fold.png');
  const fullPath = join(outDir, 'full-page.png');
  const mobilePath = join(outDir, 'mobile.png');

  runChrome(['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=3000', '--dump-dom', base], { stdoutFile: domPath });
  const dom = readFileSync(domPath, 'utf8');
  for (const text of [
    'Agentic services should earn expansion from receipts, not promises.',
    'Service trial memo',
    'Stripe test-mode envelope',
    'Workload evidence',
    'Governance',
    'Append-only operating record',
    'Governed service-trial workflow',
  ]) {
    assert(dom.includes(text), `DOM includes ${text}`);
  }
  for (const forbidden of ['rawModelSummary', 'Internal Server Error', 'Unhandled Runtime Error', '__NEXT_DATA__:{', 'cs_test_agent_ic']) {
    assert(!dom.includes(forbidden), `DOM must not include ${forbidden}`);
  }

  screenshot(topPath, '1440,1200');
  screenshot(fullPath, '1440,5200');
  screenshot(mobilePath, '390,1200');
  for (const path of [topPath, fullPath, mobilePath]) {
    assert(statSync(path).size > 50_000, `${path} screenshot is non-trivial`);
  }

  console.log(JSON.stringify({ ok: true, chrome, artifacts: { domPath, topPath, fullPath, mobilePath } }, null, 2));
}

function screenshot(path, size) {
  runChrome([
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    `--window-size=${size}`,
    '--virtual-time-budget=3000',
    `--screenshot=${path}`,
    base,
  ]);
}

function runChrome(args, { stdoutFile } = {}) {
  const result = spawnSync(chrome, args, { encoding: 'utf8' });
  if (stdoutFile) writeFileSync(stdoutFile, result.stdout || '');
  if (result.status !== 0) {
    throw new Error(`Chrome failed ${result.status}: ${(result.stderr || result.stdout || '').slice(0, 500)}`);
  }
}

function findChrome() {
  for (const bin of ['google-chrome', 'chromium', 'chromium-browser']) {
    const result = spawnSync('bash', ['-lc', `command -v ${bin}`], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error('No Chrome/Chromium binary found; set CHROME_BIN');
}

function assert(condition, message) {
  if (!condition) throw new Error(`Browser smoke failed: ${message}`);
}

main();
