import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const base = process.env.AGENT_IC_BASE_URL || 'http://localhost:3000';
const outDir = process.env.AGENT_IC_QA_DIR || '.agent-ic/qa';
const chrome = process.env.CHROME_BIN || findChrome();

function main() {
  mkdirSync(outDir, { recursive: true });
  const domPath = join(outDir, 'trial-dom.html');
  const topPath = join(outDir, 'trial-top-fold.png');
  const fullPath = join(outDir, 'trial-full-page.png');
  const mobilePath = join(outDir, 'trial-mobile.png');
  const route = `${base.replace(/\/$/, '')}/trial`;

  runChrome(['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=3000', '--dump-dom', route], { stdoutFile: domPath });
  const dom = readFileSync(domPath, 'utf8');
  for (const text of [
    'Procurement governance ledger/control plane',
    'Fund the right AI pilots.',
    'Stop the wrong ones.',
    'not the vendor agent',
    'governed spend envelope',
    'policy receipt',
    'Bounded trial',
    'evidence-backed procurement decision',
    'Run RouteGuard trial',
    'Vendor Renewals',
  ]) {
    assert(dom.includes(text), `DOM includes ${text}`);
  }
  for (const forbidden of ['Internal Server Error', 'Unhandled Runtime Error', '__NEXT_DATA__:{', 'cs_test_agent_ic', 'Atlas Freight', 'rawModelSummary']) {
    assert(!dom.includes(forbidden), `DOM must not include ${forbidden}`);
  }

  screenshot(topPath, route, '1440,1200');
  screenshot(fullPath, route, '1440,3200');
  screenshot(mobilePath, route, '390,1200');
  for (const path of [topPath, fullPath, mobilePath]) {
    assert(statSync(path).size > 30_000, `${path} screenshot is non-trivial`);
  }

  const adminDomPath = join(outDir, 'admin-dom.html');
  const adminTopPath = join(outDir, 'admin-top-fold.png');
  const adminRoute = `${base.replace(/\/$/, '')}/admin`;
  runChrome(['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=3000', '--dump-dom', adminRoute], { stdoutFile: adminDomPath });
  const adminDom = readFileSync(adminDomPath, 'utf8');
  for (const text of ['Enterprise Ops Console', 'Approval Queue', 'Policy Governance', 'Stored Trial Evidence', 'Organization / Tenant', 'Memberships', 'Create browser session', 'Logout session', 'Compliance Export', 'Alerts + on-call', 'SLO + error budget', 'Incident Reviews', 'Telemetry Export', 'Payment Events', 'Stripe Checkout Session ID for reconciliation']) {
    assert(adminDom.includes(text), `admin DOM includes ${text}`);
  }
  screenshot(adminTopPath, adminRoute, '1440,1200');
  assert(statSync(adminTopPath).size > 30_000, `${adminTopPath} screenshot is non-trivial`);

  console.log(JSON.stringify({ ok: true, chrome, route, adminRoute, artifacts: { domPath, topPath, fullPath, mobilePath, adminDomPath, adminTopPath } }, null, 2));
}

function screenshot(path, route, size) {
  runChrome([
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    `--window-size=${size}`,
    '--virtual-time-budget=3000',
    `--screenshot=${path}`,
    route,
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
