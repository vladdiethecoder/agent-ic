#!/usr/bin/env node
/**
 * Professional live screencast recorder for the final Agent IC submission.
 *
 * The recording is product-first and fail-closed:
 *   - no browser URL bar, DevTools, localhost, ports, or workspace paths on screen
 *   - no local policy proxy in strict mode
 *   - strict preflight requires Hermes dispatch, Nemotron, Stripe test-mode, and external NemoHermes/OpenShell 403 proof
 *   - optional terminal proof uses the product-safe `agent-ic proof ...` wrapper only
 *
 * Output: demo-out/agent-ic-demo-raw.mp4
 */

import { chromium } from '@playwright/test';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const WORKSPACE_ROOT = process.cwd();
const OUT_DIR = path.resolve(process.env.AGENT_IC_DEMO_DIR || 'demo-out');
const RAW_VIDEO = path.join(OUT_DIR, 'agent-ic-demo-raw.mp4');
const INTERNAL_BASE_URL = (process.env.AGENT_IC_INTERNAL_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const APP_URL = `${INTERNAL_BASE_URL}/run`;
const QR_URL = `${INTERNAL_BASE_URL}/qr`;
const PROOF_DIR = process.env.AGENT_IC_PROOF_TMP || '/tmp';
const STRIPE_ID_FILE = path.join(PROOF_DIR, 'agent-ic-final-stripe-session');
const GATE_FILE = path.join(PROOF_DIR, 'agent-ic-final-gate.json');
const DEMO_PROPOSAL_ID = process.env.AGENT_IC_DEMO_PROPOSAL_ID || 'agentic-service-complaint-triage-trial';

const DISPLAY = process.env.AGENT_IC_DISPLAY || ':99';
const XVFB_RES = '1920x1080x24';
const X_ENV = { ...process.env, DISPLAY, WAYLAND_DISPLAY: '', XDG_SESSION_TYPE: 'x11' };
// The final submission defaults to product-only capture. OS terminals are
// opt-in because their chrome can expose hostnames or workspace paths.
const TERMINAL_ENABLED = process.env.AGENT_IC_RECORD_TERMINAL === 'true';
const BROWSER_W = TERMINAL_ENABLED ? 1440 : 1920;
const BROWSER_H = 1080;
const TERM_W = TERMINAL_ENABLED ? 480 : 0;
const TERM_H = 1080;
const TERM_X = BROWSER_W;
const FPS = 30;
const MAX_RECORDING_SECONDS = Number(process.env.AGENT_IC_MAX_RECORDING_SECONDS || 120);
const QR_HOLD_MS = Number(process.env.AGENT_IC_QR_HOLD_MS || 9_000);
const QR_START_TARGET_MS = Number(process.env.AGENT_IC_QR_START_TARGET_MS || 56_800);
const QR_NAVIGATION_LEAD_MS = Number(process.env.AGENT_IC_QR_NAVIGATION_LEAD_MS || 2_100);
const POST_START_TRIM_MS = Number(process.env.AGENT_IC_POST_START_TRIM_SECONDS || 1.8) * 1000;
const PRE_QR_PROOF_HOLD_MS = Number(process.env.AGENT_IC_PRE_QR_PROOF_HOLD_MS || 0);
const MIN_RAW_RECORDING_MS = Number(process.env.AGENT_IC_MIN_RAW_RECORDING_MS || 66_000);

const beats = { start: 0, stages: {} };
let capturedStripeSessionId = null;
let capturedHermesReceipt = null;
let capturedNemotronReceipt = null;
let capturedBlockedMetrics = null;
let capturedPolicyGate = null;
let capturedGovernanceReceipt = null;
let capturedEvidenceMetrics = null;
let activeXvfbPid = null;
let activeTerminalPid = null;

function beat(name, value) {
  if (name === 'stage') {
    if (beats.stages[value]) return;
    beats.stages[value] = Date.now();
    console.log(`[beat] stage-${value} @ ${beats.stages[value] - beats.start}ms`);
    return;
  }
  if (beats[name]) return;
  beats[name] = Date.now();
  console.log(`[beat] ${name} @ ${beats[name] - beats.start}ms`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function maskId(id) {
  if (!id || id.length < 16) return id || '';
  return `${id.slice(0, 14)}...${id.slice(-4)}`;
}

function segmentStartMs(segments, index) {
  const segment = segments.find((item) => Number(item.index) === index);
  const seconds = Number(segment?.start);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

async function loadQrTargetMs() {
  let target = QR_START_TARGET_MS;
  const timingPath = path.join(OUT_DIR, 'caption-timing-final.json');
  try {
    const timing = JSON.parse(await fs.readFile(timingPath, 'utf8'));
    const segments = Array.isArray(timing.segments) ? timing.segments : [];
    const lastSpeech = segments
      .filter((segment) => Number.isFinite(Number(segment.start)))
      .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
      .at(-1);
    const lastStartMs = lastSpeech ? Number(lastSpeech.start) * 1000 : null;
    if (lastStartMs !== null && Number.isFinite(lastStartMs)) {
      target = Math.max(0, lastStartMs + POST_START_TRIM_MS - QR_NAVIGATION_LEAD_MS);
    }
  } catch {
    // demo:record can run without a freshly generated voiceover; defaults stay usable.
  }
  return target;
}

async function loadCaptionTimingTargetsMs() {
  let segments = [];
  const timingPath = path.join(OUT_DIR, 'caption-timing-final.json');
  try {
    const timing = JSON.parse(await fs.readFile(timingPath, 'utf8'));
    segments = Array.isArray(timing.segments) ? timing.segments : [];
  } catch {
    segments = [];
  }

  const target = (index, fallbackMs) => {
    const startMs = segmentStartMs(segments, index);
    const baseMs = Number.isFinite(startMs) ? startMs : fallbackMs;
    return Math.max(0, baseMs + POST_START_TRIM_MS);
  };

  return {
    decision: target(7, 25_264),
    replay: target(8, 33_435),
    replayAudit: target(9, 43_260),
    productivity: target(10, 35_751),
    skill: target(11, 47_005),
    qr: target(12, 66_049),
  };
}

async function waitUntilElapsedMs(targetMs) {
  if (!Number.isFinite(targetMs) || !beats.start) return;
  const remainingMs = targetMs - (Date.now() - beats.start);
  if (remainingMs > 0) await sleep(remainingMs);
}

async function loadEnvLocal() {
  try {
    const text = await fs.readFile(path.resolve(WORKSPACE_ROOT, '.env.local'), 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Optional local credentials file.
  }
}

function buildLiveEnvBlock() {
  const sandboxName =
    process.env.AGENT_IC_NEMOHERMES_SANDBOX ||
    process.env.NEMOHERMES_SANDBOX ||
    process.env.NEMOCLAW_SANDBOX_NAME ||
    'agent-ic-hermes';
  const explicit = {
    AGENT_IC_DEMO_MODE: 'false',
    AGENT_IC_RECORDING_MODE: 'true',
    AGENT_IC_RECORDING_NO_AUTORUN: 'true',
    AGENT_IC_RECORDING_FAST: 'false',
    AGENT_IC_REQUIRE_LIVE_PROOF: 'true',
    AGENT_IC_HERMES_NEMOHERMES_LIVE: 'true',
    AGENT_IC_NEMOCLAW_EXTERNAL_LIVE: 'true',
    AGENT_IC_ALLOW_LOCAL_POLICY_PROOF: 'false',
    AGENT_IC_NEMOHERMES_SANDBOX: sandboxName,
    AGENT_IC_HERMES_NEMOHERMES_SANDBOX: sandboxName,
    NEMOCLAW_SANDBOX_NAME: sandboxName,
    NEXT_PUBLIC_APP_URL: process.env.AGENT_IC_PUBLIC_APP_URL || 'https://agent-ic.demo',
    NEXT_PUBLIC_GITHUB_REPO_URL:
      process.env.AGENT_IC_PUBLIC_REPO_URL || 'https://github.com/agent-ic',
    NEXT_PUBLIC_GITHUB_REPO_LABEL:
      process.env.AGENT_IC_PUBLIC_REPO_LABEL || 'github.com/agent-ic',
  };
  const passThroughKeys = [
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEMOTRON_API_KEY',
    'NEMOTRON_BASE_URL',
    'NEMOTRON_MODEL',
    'HERMES_AGENT_URL',
    'HERMES_AGENT_TOKEN',
    'AGENT_IC_STRIPE_POLL_PAYMENT',
    'NEMOHERMES_BIN',
    'CHATGPT55_API_KEY',
    'CHATGPT55_BASE_URL',
    'CHATGPT55_MODEL',
    'OPENAI_COMPAT_API_KEY',
    'OPENAI_COMPAT_BASE_URL',
    'OPENAI_COMPAT_MODEL',
    'OPENROUTER_API_KEY',
  ];
  const vars = Object.entries(explicit);
  for (const key of passThroughKeys) {
    if (process.env[key] !== undefined) vars.push([key, process.env[key]]);
  }
  return vars.map(([key, value]) => `${key}=${shellSingleQuote(value)}`).join(' ');
}

function killTmuxSession(name) {
  try {
    execSync(`tmux kill-session -t ${name} 2>/dev/null || true`);
  } catch {}
}

function killProcessGroup(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGTERM');
    return;
  } catch {}
  try {
    process.kill(pid, 'SIGTERM');
  } catch {}
}

function cleanupRecordingServices() {
  killTmuxSession('agentic-terminal');
  killTmuxSession('agentic-app');
  killProcessGroup(activeTerminalPid);
  killProcessGroup(activeXvfbPid);
  try {
    execSync(`pkill -f ${shellSingleQuote(`Xvfb ${DISPLAY}`)} 2>/dev/null || true`);
  } catch {}
}

function xdo(cmd) {
  try {
    return execSync(cmd, { env: X_ENV }).toString().trim();
  } catch {
    return '';
  }
}

function startXvfb() {
  console.log(`[services] starting Xvfb on ${DISPLAY}`);
  try {
    execSync(`pkill -f ${shellSingleQuote(`Xvfb ${DISPLAY}`)} 2>/dev/null || true`);
  } catch {}
  const child = spawn('Xvfb', [DISPLAY, '-screen', '0', XVFB_RES, '-ac', '+extension', 'RANDR'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  activeXvfbPid = child.pid;
  return child.pid;
}

function startAppServerInTmux() {
  killTmuxSession('agentic-app');
  try {
    execSync('lsof -ti:3000 | xargs -r kill -9 2>/dev/null || true');
  } catch {}
  const cmd = [
    `cd ${shellSingleQuote(WORKSPACE_ROOT)}`,
    `export DISPLAY=${DISPLAY} WAYLAND_DISPLAY= XDG_SESSION_TYPE=x11`,
    `export ${buildLiveEnvBlock()}`,
    'node scripts/safe-next.mjs dev',
  ].join(' && ');
  console.log('[services] starting app server in tmux');
  execSync(`tmux new-session -d -s agentic-app bash -c ${shellSingleQuote(cmd)}`);
}

async function waitForServer(timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${INTERNAL_BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('Application server did not become ready');
}

function startTerminal() {
  if (!TERMINAL_ENABLED) return;
  killTmuxSession('agentic-terminal');
  const neutralShell = [
    'cd /tmp',
    'export HOME=/tmp',
    "export PS1='agentic$ '",
    'export PROMPT_COMMAND=',
    'exec bash --noprofile --norc -i',
  ].join(' && ');
  execSync(
    `tmux new-session -d -s agentic-terminal -x 62 -y 42 ${shellSingleQuote(neutralShell)}`,
    { env: X_ENV }
  );
  execSync('tmux set -t agentic-terminal status off', { env: X_ENV });
  execSync('tmux set -t agentic-terminal automatic-rename off', { env: X_ENV });
  execSync('tmux rename-window -t agentic-terminal proof', { env: X_ENV });

  const konsoleCmd = [
    `export DISPLAY=${DISPLAY}`,
    'WAYLAND_DISPLAY= XDG_SESSION_TYPE=x11',
    'konsole --separate --hide-menubar --hide-tabbar --hide-toolbars --notransparency',
    '--title "Agent IC proof"',
    '-p Font=Monospace,20',
    '-p ColorScheme=Linux',
    `--qwindowgeometry ${TERM_W}x${TERM_H}+${TERM_X}+0`,
    '-e tmux attach -t agentic-terminal',
  ].join(' && ');
  console.log('[services] starting proof terminal');
  const child = spawn('bash', ['-c', konsoleCmd], { detached: true, stdio: 'ignore', env: X_ENV });
  child.unref();
  activeTerminalPid = child.pid;
}

async function prepTerminal() {
  if (!TERMINAL_ENABLED) return;
  const helper = path.join(WORKSPACE_ROOT, 'scripts', 'agent-ic-proof.mjs');
  const initScript = [
    "PS1='agentic$ '",
    'PROMPT_COMMAND=',
    'cd /tmp',
    `export AGENT_IC_INTERNAL_BASE_URL=${shellSingleQuote(INTERNAL_BASE_URL)}`,
    `export AGENT_IC_STRIPE_ID_FILE=${shellSingleQuote(STRIPE_ID_FILE)}`,
    `export AGENT_IC_GATE_FILE=${shellSingleQuote(GATE_FILE)}`,
    `agent-ic(){ node ${shellSingleQuote(helper)} "$@"; }`,
    "printf '\\033]0;Agent IC proof\\007\\033[3J\\033[H\\033[2J'",
  ].join(' && ');
  execSync('tmux send-keys -t agentic-terminal C-u', { env: X_ENV });
  execSync(`tmux send-keys -t agentic-terminal -l ${shellSingleQuote(initScript)}`, { env: X_ENV });
  execSync('tmux send-keys -t agentic-terminal Enter', { env: X_ENV });
  await sleep(400);
  execSync('tmux clear-history -t agentic-terminal', { env: X_ENV });
  execSync('tmux send-keys -t agentic-terminal C-l', { env: X_ENV });
}

async function typeInTerminal(text, { enter = true, delayMs = 7 } = {}) {
  if (!TERMINAL_ENABLED) return;
  for (const char of text) {
    execSync(`tmux send-keys -t agentic-terminal -l ${shellSingleQuote(char)}`, { env: X_ENV });
    if (delayMs > 0) await sleep(delayMs);
  }
  if (enter) execSync('tmux send-keys -t agentic-terminal Enter', { env: X_ENV });
}

async function runTerminalCommand(text, { delayMs = 7, waitForOutputMs = 1000 } = {}) {
  if (!TERMINAL_ENABLED) {
    await sleep(waitForOutputMs);
    return;
  }
  await typeInTerminal(text, { enter: true, delayMs });
  await sleep(waitForOutputMs);
}

function startFfmpegCapture(outputPath) {
  console.log(`[capture] ffmpeg x11grab -> ${outputPath}`);
  const child = spawn('ffmpeg', [
    '-y',
    '-f', 'x11grab',
    '-framerate', String(FPS),
    '-video_size', '1920x1080',
    '-i', `${DISPLAY}.0+0,0`,
    '-t', String(MAX_RECORDING_SECONDS + 5),
    '-c:v', 'h264_nvenc',
    '-b:v', '9M',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    outputPath,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: X_ENV,
  });
  return child;
}

async function resetAudit() {
  for (const endpoint of ['/api/audit', '/api/live-trace']) {
    try {
      await fetch(`${INTERNAL_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reset: true, confirmReset: 'AGENT_IC_DEMO_RESET' }),
      });
    } catch {}
  }
}

async function assertLiveHandshake() {
  console.log('[handshake] strict live preflight');

  const nimRes = await fetch(`${INTERNAL_BASE_URL}/api/nemotron-smoke`);
  const nim = await nimRes.json().catch(() => ({}));
  if (!nimRes.ok || nim.state !== 'live') {
    throw new Error(`Nemotron smoke failed: ${nim.error || nimRes.status}`);
  }
  console.log(`[handshake] Nemotron live ${nim.model} ${maskId(nim.requestId)} ${nim.latencyMs}ms`);

  const runRes = await fetch(`${INTERNAL_BASE_URL}/api/run-capital-experiment-v8`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposalId: DEMO_PROPOSAL_ID, requireLiveProof: true }),
  });
  const run = await runRes.json().catch(() => ({}));
  if (!runRes.ok) {
    throw new Error(`Strict run preflight failed: ${JSON.stringify(run.failures || run).slice(0, 800)}`);
  }
  if (!run.providerReceipts?.hermes?.taskId || !['nemohermes-sandbox', 'hermes-gateway'].includes(run.providerReceipts?.hermes?.skillSource)) {
    throw new Error('Hermes live dispatch receipt missing');
  }
  if (!run.providerReceipts?.nemotron?.requestId) throw new Error('Decision-path Nemotron request ID missing');
  if (!run.stripe?.sessionId?.startsWith('cs_test')) throw new Error('Stripe test-mode Checkout Session missing');
  if (run.providerReceipts?.governance?.state !== 'live') {
    throw new Error('External NemoHermes/OpenShell 403 proof missing');
  }
  console.log(`[handshake] strict run ok Hermes ${maskId(run.providerReceipts.hermes.taskId)} Nemotron ${maskId(run.providerReceipts.nemotron.requestId)} Stripe ${maskId(run.stripe.sessionId)}`);
  return {
    requestId: run.providerReceipts.nemotron.requestId,
    model: run.providerReceipts.nemotron.model || run.nemotron?.model || null,
    state: 'live',
    latencyMs: run.providerReceipts.nemotron.latencyMs || run.nemotron?.latencyMs || null,
    rationale: run.providerReceipts.nemotron.rationale || run.nemotron?.rationale || null,
    confidence: run.providerReceipts.nemotron.confidence || run.nemotron?.confidence || null,
    score: run.providerReceipts.nemotron.score ?? run.nemotron?.score ?? null,
    governanceScore: run.providerReceipts.nemotron.governanceScore ?? run.nemotron?.governanceScore ?? null,
    evidenceScore: run.providerReceipts.nemotron.evidenceScore ?? run.nemotron?.evidenceScore ?? null,
  };
}

async function injectCursorOverlay(page) {
  await page.addInitScript(() => {
    function installAgentIcCursor() {
      if (window.__agentIcCursorInstalled) return;
      if (!document.body) {
        window.setTimeout(installAgentIcCursor, 25);
        return;
      }
      window.__agentIcCursorInstalled = true;

      const style = document.createElement('style');
      style.textContent = `
        #agent-ic-cursor {
          position: fixed;
          top: 96px; left: 96px;
          width: 34px; height: 34px;
          pointer-events: none;
          z-index: 2147483647;
          transform: translate(-3px, -3px);
        }
        #agent-ic-cursor svg {
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.65));
        }
        #agent-ic-cursor::after {
          content: '';
          position: absolute;
          left: 7px; top: 7px;
          width: 10px; height: 10px;
          border: 2px solid rgba(172, 255, 68, 0.95);
          border-radius: 999px;
          opacity: 0;
          transform: scale(0.4);
        }
        #agent-ic-cursor.clicked svg {
          animation: agent-ic-click-press 260ms ease-out;
        }
        #agent-ic-cursor.clicked::after {
          animation: agent-ic-click-pulse 900ms ease-out;
        }
        @keyframes agent-ic-click-pulse {
          0% { opacity: 1; transform: scale(0.35); }
          45% { opacity: 0.82; transform: scale(2.4); }
          100% { opacity: 0; transform: scale(4.4); }
        }
        @keyframes agent-ic-click-press {
          0% { transform: scale(1); }
          45% { transform: scale(0.86); }
          100% { transform: scale(1); }
        }
      `;
      (document.head || document.documentElement).appendChild(style);

      const cursor = document.createElement('div');
      cursor.id = 'agent-ic-cursor';
      cursor.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 3l7.5 18.5L12.5 12.5 18.5 10.5 3 3z" fill="#f7f8f8" stroke="#050608" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
      document.body.appendChild(cursor);
      window.__agentIcCursorX = 96;
      window.__agentIcCursorY = 96;

      document.addEventListener('mousemove', (e) => {
        window.__agentIcCursorX = e.clientX;
        window.__agentIcCursorY = e.clientY;
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
      }, { passive: true });
      document.addEventListener('mousedown', () => {
        cursor.classList.remove('clicked');
        void cursor.offsetWidth;
        cursor.classList.add('clicked');
      }, { passive: true });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installAgentIcCursor, { once: true });
      window.setTimeout(installAgentIcCursor, 50);
    } else {
      installAgentIcCursor();
    }
  });
}

function jitter(t) {
  const x = Math.sin(t * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

async function humanizedMove(page, selector, options = {}) {
  const el = await page.locator(selector).first();
  const box = await el.boundingBox();
  if (!box) throw new Error(`Element not found: ${selector}`);
  const targetX = box.x + (options.offsetX ?? box.width / 2);
  const targetY = box.y + (options.offsetY ?? box.height / 2);
  const start = await page.evaluate(() => ({ x: window.__agentIcCursorX || 80, y: window.__agentIcCursorY || 80 }));
  const steps = options.steps ?? 34;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const fade = 1 - t * t;
    const x = start.x + (targetX - start.x) * ease + (jitter(t + 1.1) - 0.5) * 4 * fade;
    const y = start.y + (targetY - start.y) * ease + (jitter(t + 7.3) - 0.5) * 4 * fade;
    await page.mouse.move(x, y);
    await sleep(6 + Math.sin(t * Math.PI) * 9);
  }
  if (options.pauseMs) await sleep(options.pauseMs);
}

async function humanizedClick(page, selector, options = {}) {
  await humanizedMove(page, selector, options);
  await sleep(options.preDownMs ?? 80);
  await page.mouse.down();
  await sleep(options.downMs ?? 180);
  await page.mouse.up();
  await sleep(options.afterMs ?? 200);
}

async function waitForLedgerDone(page, id, timeoutMs = 60_000) {
  await page.locator(`[data-testid="ledger-${id}"][data-status="done"]`).waitFor({ timeout: timeoutMs });
}

async function waitForStripeSessionId(page, timeoutMs = 70_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const sessionId = await page.evaluate(() => (
      document.querySelector('[data-testid="stripe-session-id"]')?.dataset?.sessionId ||
      window.__AGENT_IC_LAST_STRIPE_SESSION_ID__ ||
      window.__AGENT_IC_LAST_PAYLOAD__?.stripe?.sessionId ||
      ''
    ));
    if (sessionId.startsWith('cs_test')) {
      await page.locator('[data-testid="stripe-session-id"]').waitFor({ timeout: 5000 }).catch(() => {});
      return sessionId;
    }
    await sleep(300);
  }
  throw new Error('Stripe Checkout Session did not appear in the UI');
}

async function waitForPlaybookReplay(page, timeoutMs = 25_000) {
  const result = page.locator('[data-testid="run-from-playbook-result"][data-status="complete"], [data-testid="run-from-playbook-result"][data-status="error"]').first();
  await result.waitFor({ timeout: timeoutMs });
  await result.scrollIntoViewIfNeeded().catch(() => {});
}

async function scrollPlaybookReplayIntoView(page, timeoutMs = 4000) {
  const result = page.locator('[data-testid="run-from-playbook-result"]').first();
  await result.waitFor({ timeout: timeoutMs });
  await result.evaluate((el) => {
    const slide = el.closest('.v14-recording-slide');
    (slide || el).scrollIntoView({ block: 'start', inline: 'nearest' });
  }).catch(() => {});
}

async function scrollProofIntoView(page, selector, { holdMs = 900, timeoutMs = 5000 } = {}) {
  const target = page.locator(selector).first();
  await target.waitFor({ timeout: timeoutMs });
  await target.evaluate((el) => {
    const slide = el.closest('.v14-recording-slide');
    (slide || el).scrollIntoView({ block: 'start', inline: 'nearest' });
  }).catch(() => {});
  await sleep(holdMs);
}

async function focusProofTargets(page, selectors, { totalMs = 2400, timeoutMs = 1200 } = {}) {
  const started = Date.now();
  const targets = Array.isArray(selectors) ? selectors : [selectors];
  let moved = false;
  while (Date.now() - started < totalMs) {
    for (const selector of targets) {
      const remaining = totalMs - (Date.now() - started);
      if (remaining <= 0) break;
      try {
        await page.locator(selector).first().waitFor({ timeout: Math.min(timeoutMs, Math.max(250, remaining)) });
        await humanizedMove(page, selector, { steps: 18, pauseMs: Math.min(520, Math.max(180, remaining / 3)) });
        moved = true;
      } catch {}
    }
    if (!moved) break;
  }
  const remainingMs = totalMs - (Date.now() - started);
  if (remainingMs > 0) await sleep(remainingMs);
}

async function scrollNestedProof(page, selector, { durationMs = 4200, steps = 18 } = {}) {
  const target = page.locator(selector).first();
  await target.waitFor({ timeout: 5000 });
  await target.evaluate((el) => {
    const slide = el.closest('.v14-recording-slide');
    if (slide) slide.scrollIntoView({ block: 'start', inline: 'nearest' });
  }).catch(() => {});
  const canScroll = await target.evaluate((el) => el.scrollHeight > el.clientHeight).catch(() => false);
  if (!canScroll) {
    await sleep(durationMs);
    return;
  }
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await target.evaluate((el, progress) => {
      el.scrollTop = (el.scrollHeight - el.clientHeight) * progress;
    }, t);
    await sleep(Math.max(50, Math.round(durationMs / steps)));
  }
}

async function readBlockedMetrics(page) {
  const metrics = await page.evaluate(() => {
    const parseMoney = (value) => {
      const match = String(value || '').match(/-?[\d,]+(?:\.\d+)?/);
      return match ? Number(match[0].replace(/,/g, '')) : null;
    };
    const card = document.querySelector('[data-testid="blocked-card"]');
    const spans = Array.from(card?.querySelectorAll('span') || []).map((el) => el.textContent || '');
    const amountText = document.querySelector('[data-testid="metric-breach-amount"]')?.textContent || '';
    const capText = spans.find((text) => text.trim().startsWith('cap=')) || '';
    return {
      attemptedAmount: parseMoney(amountText),
      cap: parseMoney(capText),
      tool: spans.find((text) => text.trim().startsWith('tool='))?.replace(/^tool=/, '') || 'CARFAX vehicle-history report',
    };
  });
  if (metrics.attemptedAmount && metrics.cap) return metrics;

  const response = await fetch(`${INTERNAL_BASE_URL}/api/audit`);
  const audit = await response.json().catch(() => ({}));
  const denied = audit.audit?.find((row) => row.action === 'DENIED');
  return {
    attemptedAmount: Number(denied?.attemptedAmount || metrics.attemptedAmount || 0),
    cap: Number(denied?.cap || metrics.cap || 0),
    tool: denied?.attemptedTool || metrics.tool,
  };
}

async function readHermesReceipt(page) {
  return page.evaluate(() => {
    const receipt = window.__AGENT_IC_LAST_PROVIDER_RECEIPTS__?.hermes || window.__AGENT_IC_LAST_PAYLOAD__?.hermesExecutionReceipt || null;
    if (!receipt) return null;
    return {
      taskId: receipt.taskId || null,
      hermesSessionId: receipt.hermesSessionId || null,
      skillSource: receipt.skillSource || receipt.source || null,
      sandboxId: receipt.sandboxId || null,
      state: receipt.state || null,
      outputSha256: receipt.outputSha256 || null,
    };
  }).catch(() => null);
}

async function readNemotronReceipt(page) {
  return page.evaluate(() => {
    const receipt = window.__AGENT_IC_LAST_PROVIDER_RECEIPTS__?.nemotron || window.__AGENT_IC_LAST_PAYLOAD__?.nemotron || null;
    if (!receipt?.requestId) return null;
    return {
      requestId: receipt.requestId,
      model: receipt.model || null,
      state: receipt.state || null,
      latencyMs: receipt.latencyMs || null,
      rationale: receipt.rationale || window.__AGENT_IC_LAST_PAYLOAD__?.nemotron?.rationale || null,
      confidence: receipt.confidence || window.__AGENT_IC_LAST_PAYLOAD__?.nemotron?.confidence || null,
    };
  }).catch(() => null);
}

async function readEvidenceMetrics(page) {
  return page.evaluate(() => {
    const evidence = window.__AGENT_IC_LAST_PAYLOAD__?.evidence || null;
    if (!evidence) return null;
    return {
      casesProcessed: evidence.casesProcessed ?? null,
      autoTriaged: evidence.autoTriaged ?? null,
      manualHoursBaseline: evidence.manualHoursBaseline ?? null,
      agentHumanHours: evidence.agentHumanHours ?? null,
      hoursSaved: evidence.hoursSaved ?? null,
      productivityLift: evidence.productivityLift ?? null,
      baselineCostPerCase: evidence.baselineCostPerCase ?? null,
      agentCostPerCase: evidence.agentCostPerCase ?? null,
      humanCostDollars: evidence.humanCostDollars ?? null,
      agentReviewCostDollars: evidence.agentReviewCostDollars ?? null,
      governedEnvelopeDollars: evidence.governedEnvelopeDollars ?? null,
      governedCostDollars: evidence.governedCostDollars ?? null,
      qaAgreement: evidence.qaAgreement ?? null,
      criticalIncidents: evidence.criticalIncidents ?? null,
      netValue: evidence.netValue ?? null,
      humanReviewQueue: evidence.humanReviewQueue ?? evidence.manualReviewQueue ?? null,
      routingCoverage: evidence.routingCoverage ?? null,
      serviceRuntimeMs: evidence.serviceRuntimeMs ?? null,
      casesPerSecond: evidence.casesPerSecond ?? null,
      sourceUrl: evidence.sourceUrl ?? null,
      datasetId: evidence.datasetId ?? null,
    };
  }).catch(() => null);
}

async function writeProofFiles() {
  if (capturedStripeSessionId) {
    await fs.writeFile(STRIPE_ID_FILE, capturedStripeSessionId);
  }
  if (capturedBlockedMetrics || capturedPolicyGate || capturedGovernanceReceipt) {
    await fs.writeFile(GATE_FILE, JSON.stringify({
      metrics: capturedBlockedMetrics,
      gate: capturedPolicyGate,
      governance: capturedGovernanceReceipt,
      externalLive: capturedGovernanceReceipt?.state === 'live',
    }, null, 2));
  }
}

async function captureRunPayloadProof() {
  const response = await fetch(`${INTERNAL_BASE_URL}/api/audit`);
  const audit = await response.json().catch(() => ({}));
  const denied = audit.audit?.find((row) => row.action === 'DENIED');
  if (denied) {
    capturedPolicyGate = {
      status: denied.realBlockedCall?.status || 403,
      policy: denied.realBlockedCall?.policy || denied.policyBreach,
      attemptedAmount: denied.attemptedAmount,
      cap: denied.cap,
      actor: denied.actor,
    };
  }
}

async function writeRecordingProvenance() {
  const artifact = {
    mode: 'strict-live-recording',
    proposalId: DEMO_PROPOSAL_ID,
    startedAt: beats.start ? new Date(beats.start).toISOString() : null,
    endedAt: beats.ended ? new Date(beats.ended).toISOString() : null,
    durationMs: beats.start ? (beats.ended || Date.now()) - beats.start : null,
    stages: Object.fromEntries(Object.entries(beats.stages).map(([stage, ts]) => [stage, {
      ts,
      offsetMs: beats.start ? ts - beats.start : null,
    }])),
    stripe: {
      sessionIdMasked: capturedStripeSessionId ? maskId(capturedStripeSessionId) : null,
      testMode: capturedStripeSessionId ? capturedStripeSessionId.startsWith('cs_test') : null,
    },
    hermes: {
      taskIdMasked: capturedHermesReceipt?.taskId ? maskId(capturedHermesReceipt.taskId) : null,
      hermesSessionIdMasked: capturedHermesReceipt?.hermesSessionId ? maskId(capturedHermesReceipt.hermesSessionId) : null,
      skillSource: capturedHermesReceipt?.skillSource || capturedHermesReceipt?.source || null,
      sandboxId: capturedHermesReceipt?.sandboxId || null,
      state: capturedHermesReceipt?.state || null,
      outputSha256: capturedHermesReceipt?.outputSha256 || null,
    },
    nemotron: {
      requestIdMasked: capturedNemotronReceipt?.requestId ? maskId(capturedNemotronReceipt.requestId) : null,
      model: capturedNemotronReceipt?.model || null,
      state: capturedNemotronReceipt?.state || null,
      latencyMs: capturedNemotronReceipt?.latencyMs || null,
      rationale: capturedNemotronReceipt?.rationale || null,
      confidence: capturedNemotronReceipt?.confidence || null,
      timingVisibleInVideo: true,
      timingRecordedInProof: Boolean(capturedNemotronReceipt?.latencyMs),
    },
    blocked: capturedBlockedMetrics,
    evidence: capturedEvidenceMetrics,
    policyGate: {
      externalLive: capturedGovernanceReceipt?.state === 'live',
      state: capturedGovernanceReceipt?.state || null,
      status: capturedPolicyGate?.status || null,
      actor: capturedPolicyGate?.actor || null,
    },
    proof: {
      requireLiveProof: true,
      localPolicyProxyStarted: false,
      urlBarHidden: true,
      devToolsVisible: false,
    },
  };
  await fs.writeFile(path.join(OUT_DIR, 'stage-events-final.json'), JSON.stringify(artifact, null, 2));
  await fs.writeFile(path.join(OUT_DIR, 'provenance-final.json'), JSON.stringify(artifact, null, 2));
}

async function positionWindows() {
  const browserWid = xdo('xdotool search --onlyvisible --class "chromium" 2>/dev/null | head -1');
  const terminalWid = TERMINAL_ENABLED
    ? (
        xdo('xdotool search --onlyvisible --name "Agent IC proof" 2>/dev/null | tail -1') ||
        xdo('xdotool search --onlyvisible --class "konsole" 2>/dev/null | tail -1')
      )
    : '';
  if (browserWid) {
    xdo(`xdotool windowmap ${browserWid} windowraise ${browserWid} windowmove ${browserWid} 0 0 windowsize ${browserWid} ${BROWSER_W} ${BROWSER_H}`);
  }
  if (terminalWid) {
    xdo(`xdotool windowmap ${terminalWid} windowraise ${terminalWid} windowmove ${terminalWid} ${TERM_X} 0 windowsize ${terminalWid} ${TERM_W} ${TERM_H}`);
  }
}

async function main() {
  await loadEnvLocal();
  const sandboxName =
    process.env.AGENT_IC_NEMOHERMES_SANDBOX ||
    process.env.NEMOHERMES_SANDBOX ||
    process.env.NEMOCLAW_SANDBOX_NAME ||
    'agent-ic-hermes';
  Object.assign(process.env, {
    AGENT_IC_DEMO_MODE: 'false',
    AGENT_IC_RECORDING_MODE: 'true',
    AGENT_IC_RECORDING_NO_AUTORUN: 'true',
    AGENT_IC_RECORDING_FAST: 'false',
    AGENT_IC_REQUIRE_LIVE_PROOF: 'true',
    AGENT_IC_HERMES_NEMOHERMES_LIVE: 'true',
    AGENT_IC_NEMOCLAW_EXTERNAL_LIVE: 'true',
    AGENT_IC_ALLOW_LOCAL_POLICY_PROOF: 'false',
    AGENT_IC_NEMOHERMES_SANDBOX: sandboxName,
    AGENT_IC_HERMES_NEMOHERMES_SANDBOX: sandboxName,
    NEMOCLAW_SANDBOX_NAME: sandboxName,
  });

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.rm(STRIPE_ID_FILE, { force: true }).catch(() => {});
  await fs.rm(GATE_FILE, { force: true }).catch(() => {});

  const xvfbPid = startXvfb();
  await sleep(1200);
  startAppServerInTmux();
  await waitForServer();
  await resetAudit();
  const preflightNemotronReceipt = await assertLiveHandshake();
  await resetAudit();

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: BROWSER_W, height: BROWSER_H },
    deviceScaleFactor: 1,
    args: [
      `--app=${APP_URL}`,
      `--window-position=0,0`,
      `--window-size=${BROWSER_W},${BROWSER_H}`,
      '--no-first-run',
      '--disable-infobars',
      '--disable-features=TranslateUI',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
    env: X_ENV,
  });
  const appPage = context.pages()[0] || await context.newPage();
  await injectCursorOverlay(appPage);
  await appPage.goto(APP_URL, { waitUntil: 'load' });
  await appPage.evaluate((receipt) => {
    window.__AGENT_IC_PREFLIGHT_NEMOTRON_RECEIPT__ = receipt;
  }, preflightNemotronReceipt);
  await sleep(700);

  startTerminal();
  await sleep(1800);
  await positionWindows();
  await prepTerminal();
  await positionWindows();

  const ffmpegProc = startFfmpegCapture(RAW_VIDEO);
  await sleep(1500);

  const hardStopTimer = setTimeout(async () => {
    console.log(`[capture] hard stop after ${MAX_RECORDING_SECONDS}s`);
    try { ffmpegProc.kill('SIGINT'); } catch {}
    await sleep(800);
    try { ffmpegProc.kill('SIGKILL'); } catch {}
    try { await context.close(); } catch {}
    cleanupRecordingServices();
    process.exit(1);
  }, MAX_RECORDING_SECONDS * 1000);

  beats.start = Date.now();
  beat('loaded');
  const captionTargets = await loadCaptionTimingTargetsMs();
  const qrTargetMs = await loadQrTargetMs();
  console.log(`[timing] ${JSON.stringify({ qr: qrTargetMs, captions: captionTargets, stages: 'live-ledger-driven' })}`);

  await sleep(700);
  await humanizedClick(appPage, '[data-testid="run-capital-experiment"]', { pauseMs: 280, afterMs: 360 });
  await runTerminalCommand('echo "Agent IC - strict live proof"', { delayMs: 8, waitForOutputMs: 300 });
  await runTerminalCommand('echo "Product UI drives the run; proof wrapper shows raw receipts."', { delayMs: 5, waitForOutputMs: 300 });

  await waitForLedgerDone(appPage, 'hermes', 45_000);
  beat('stage', 'proposal');
  capturedHermesReceipt = await readHermesReceipt(appPage);
  await runTerminalCommand('agent-ic proof hermes', { delayMs: 4, waitForOutputMs: 1800 });

  await waitForLedgerDone(appPage, 'nemotron', 70_000);
  beat('stage', 'evaluate');
  capturedNemotronReceipt = await readNemotronReceipt(appPage);
  await runTerminalCommand('agent-ic proof nemotron', { delayMs: 4, waitForOutputMs: 1800 });

  await waitForLedgerDone(appPage, 'stripe', 70_000);
  beat('stage', 'fund');
  await runTerminalCommand('agent-ic proof stripe', { delayMs: 4, waitForOutputMs: 2200 });

  await waitForLedgerDone(appPage, 'policy', 70_000);
  beat('stage', 'govern');
  await appPage.locator('[data-testid="agent-tool-policy-panel"][data-status="blocked"]').waitFor({ timeout: 8000 }).catch(() => {});
  await appPage.locator('[data-testid="policy-rule-checks"]').waitFor({ timeout: 5000 }).catch(() => {});
  await scrollProofIntoView(appPage, '[data-testid="agent-tool-policy-panel"]', { holdMs: 2200, timeoutMs: 5000 }).catch(() => {});
  capturedBlockedMetrics = await readBlockedMetrics(appPage);
  await captureRunPayloadProof();
  await writeProofFiles();
  await runTerminalCommand('agent-ic proof policy', { delayMs: 4, waitForOutputMs: 2200 });
  await waitForLedgerDone(appPage, 'evidence', 45_000);

  await waitForLedgerDone(appPage, 'decision', 45_000);
  beat('stage', 'decide');
  await appPage.locator('[data-testid="decision-verdict"]').waitFor({ timeout: 10_000 }).catch(() => {});
  capturedHermesReceipt = await readHermesReceipt(appPage) || capturedHermesReceipt;
  capturedNemotronReceipt = await readNemotronReceipt(appPage) || capturedNemotronReceipt;
  capturedStripeSessionId = await waitForStripeSessionId(appPage).catch(() => capturedStripeSessionId);
  capturedEvidenceMetrics = await readEvidenceMetrics(appPage) || capturedEvidenceMetrics;
  capturedGovernanceReceipt = await appPage.evaluate(() => window.__AGENT_IC_LAST_PROVIDER_RECEIPTS__?.governance || null).catch(() => null);
  await writeProofFiles();

  // Compact proof tour: keep a new receipt or proof surface moving every few
  // seconds instead of waiting on long narration segment boundaries.
  await scrollProofIntoView(appPage, '[data-testid="decision-receipt-checklist"]', { holdMs: 350 });
  await focusProofTargets(appPage, [
    '[data-testid="decision-verdict"]',
    '[data-testid="decision-receipt-checklist"]',
    '[data-testid="next-cap-formula"]',
  ], { totalMs: 2000 });

  await scrollProofIntoView(appPage, '[data-testid="stripe-card"]', { holdMs: 350 });
  await focusProofTargets(appPage, [
    '[data-testid="stripe-session-id"]',
    '[data-testid="stripe-card"]',
  ], { totalMs: 2300 });

  await scrollProofIntoView(appPage, '[data-testid="agent-tool-policy-panel"]', { holdMs: 450, timeoutMs: 5000 }).catch(() => {});
  await focusProofTargets(appPage, [
    '[data-testid="metric-breach-amount"]',
    '[data-testid="policy-rule-checks"]',
    '[data-testid="blocked-card"]',
  ], { totalMs: 2500 });

  await scrollProofIntoView(appPage, '[data-testid="playbook-replay-banner"]', { holdMs: 450, timeoutMs: 12_000 }).catch(() => {});
  await focusProofTargets(appPage, [
    '[data-testid="playbook-replay-banner"]',
    '[data-testid="run-from-playbook"]',
  ], { totalMs: 1800 });
  await scrollPlaybookReplayIntoView(appPage, 16_000).catch(() => {});
  await waitForPlaybookReplay(appPage, 28_000).catch(() => {});
  await scrollProofIntoView(appPage, '[data-testid="run-from-playbook-result"]', { holdMs: 350, timeoutMs: 3000 }).catch(() => {});
  await focusProofTargets(appPage, [
    '[data-testid="run-from-playbook-result"]',
    '[data-testid="playbook-replay-banner"]',
  ], { totalMs: 2700 });

  const replaySampleHoldMs = 42_600 - (Date.now() - beats.start);
  if (replaySampleHoldMs > 500) {
    await focusProofTargets(appPage, [
      '[data-testid="playbook-replay-banner"]',
      '[data-testid="run-from-playbook-result"]',
    ], { totalMs: replaySampleHoldMs, timeoutMs: 700 });
  }

  await scrollProofIntoView(appPage, '[data-testid="decision-productivity"]', { holdMs: 250 });
  await focusProofTargets(appPage, [
    '[data-testid="decision-productivity"]',
    '[data-testid="roi-assumptions"]',
  ], { totalMs: 1800 });
  await scrollProofIntoView(appPage, '[data-testid="roi-assumptions"]', { holdMs: 250 });
  await focusProofTargets(appPage, [
    '[data-testid="roi-assumptions"]',
    '[data-testid="decision-productivity"]',
  ], { totalMs: 900 });

  await runTerminalCommand('agent-ic proof playbook', { delayMs: 4, waitForOutputMs: 650 });
  await scrollProofIntoView(appPage, '[data-testid="artifact-shot-panel"]', { holdMs: 250 });
  await scrollNestedProof(appPage, '[data-testid="artifact-shot-panel"] .v14-artifact-body', { durationMs: 2400, steps: 16 });
  await focusProofTargets(appPage, '[data-testid="artifact-shot-panel"]', { totalMs: 700 });
  await runTerminalCommand('agent-ic proof rerun', { delayMs: 4, waitForOutputMs: 550 });
  await runTerminalCommand('agent-ic proof gpu', { delayMs: 4, waitForOutputMs: 250 });

  const remainingProofMs = qrTargetMs - (Date.now() - beats.start);
  if (remainingProofMs > 1200) {
    await scrollProofIntoView(appPage, '[data-testid="run-from-playbook-result"]', { holdMs: 250, timeoutMs: 2000 }).catch(() => {});
    await focusProofTargets(appPage, [
      '[data-testid="run-from-playbook-result"]',
      '[data-testid="decision-productivity"]',
      '[data-testid="artifact-shot-panel"]',
    ], { totalMs: Math.min(remainingProofMs - 600, 5200) });
  }
  await sleep(PRE_QR_PROOF_HOLD_MS);
  await waitUntilElapsedMs(qrTargetMs);

  await appPage.goto(QR_URL, { waitUntil: 'load' });
  await positionWindows();
  await runTerminalCommand('echo "Scan to audit source and proof artifacts."', { delayMs: 5, waitForOutputMs: 600 });
  const minHoldMs = MIN_RAW_RECORDING_MS - (Date.now() - beats.start);
  await sleep(Math.max(QR_HOLD_MS, minHoldMs));

  beat('ended');
  await writeRecordingProvenance();
  clearTimeout(hardStopTimer);

  try { await context.close(); } catch {}
  ffmpegProc.kill('SIGINT');
  await sleep(1200);
  try { ffmpegProc.kill('SIGKILL'); } catch {}
  cleanupRecordingServices();

  const stats = existsSync(RAW_VIDEO) ? await fs.stat(RAW_VIDEO) : null;
  console.log(`[done] raw video: ${RAW_VIDEO} (${stats ? `${(stats.size / 1e6).toFixed(2)} MB` : 'missing'})`);
  console.log(`[beats] ${JSON.stringify({ durationMs: beats.ended - beats.start, stages: beats.stages }, null, 2)}`);
}

main().catch((error) => {
  console.error('[fatal]', error);
  cleanupRecordingServices();
  process.exit(1);
});
