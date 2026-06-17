#!/usr/bin/env node
/**
 * Live single-take screencast recorder for Agent IC v16.
 *
 * Records a real browser at 1920x1080 showing the live Next.js app and
 * pre-captured terminal proof pages, then saves the raw WebM for post-production.
 */

import { chromium } from '@playwright/test';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const WORKSPACE_ROOT = process.cwd();
const OUT_DIR = path.resolve(process.env.AGENT_IC_DEMO_DIR || 'demo-out');
const RAW_DIR = path.join(OUT_DIR, 'raw');
const RAW_VIDEO = path.join(OUT_DIR, 'agent-ic-demo-v16-raw.webm');
const VIEWPORT = { width: 1920, height: 1080 };

const TARGET_RECORDING_SECONDS = 78;
const MAX_RECORDING_SECONDS = 82;

const APP_URL = 'http://localhost:3000/run-v14?recording=1&noAutoRun=1';
const TERMINAL_BASE = 'http://localhost:4000';
const TERMINAL_PAGES = [
  { id: 'stripe-checkout', path: '/stripe-checkout.html', title: 'Stripe Checkout Session' },
  { id: 'nemoclaw-gate-403', path: '/nemoclaw-gate-403.html', title: 'NemoClaw 403 gate' },
  { id: 'nvidia-smi', path: '/nvidia-smi.html', title: 'nvidia-smi + Nemotron' },
  { id: 'cat-playbook', path: '/cat-playbook.html', title: 'cat SKILL.md' },
  { id: 'ls-skills', path: '/ls-skills.html', title: 'ls skills/' },
];

const STAGES = ['problem', 'proposal', 'evaluate', 'fund', 'govern', 'decide'];

const beats = { stages: {} };
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadEnvLocal() {
  try {
    const envPath = path.resolve(WORKSPACE_ROOT, '.env.local');
    const text = await fs.readFile(envPath, 'utf8');
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
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local is optional
  }
}

async function waitForServer(url, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // not ready
    }
    await sleep(500);
  }
  throw new Error(`Server did not become ready: ${url}`);
}

async function resetAudit() {
  try {
    await fetch('http://localhost:3000/api/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'reset', confirmReset: 'AGENT_IC_DEMO_RESET' }),
    });
  } catch (err) {
    console.warn(`[warn] audit reset failed: ${err.message}`);
  }
}

async function ensureTerminalServer() {
  try {
    const res = await fetch(`${TERMINAL_BASE}/terminal-pages-report-v16.json`);
    if (res.ok) {
      console.log('[services] terminal server already running');
      return;
    }
  } catch {
    // not running
  }
  console.log('[services] starting terminal static server...');
  const child = spawn('python3', ['-m', 'http.server', '4000'], {
    cwd: path.join(OUT_DIR, 'terminals-v16'),
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  await waitForServer(TERMINAL_BASE, 15_000);
}

function shellSingleQuote(value) {
  if (value == null) return "''";
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function buildLiveEnvBlock() {
  const keys = [
    'AGENT_IC_DEMO_MODE',
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEMOTRON_API_KEY',
    'NEMOTRON_BASE_URL',
    'NEMOTRON_MODEL',
    'NEMOCLAW_PROXY_URL',
    'HERMES_AGENT_URL',
    'HERMES_AGENT_TOKEN',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_GITHUB_REPO_URL',
    'AGENT_IC_STRIPE_POLL_PAYMENT',
  ];
  const vars = [];
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) {
      vars.push(`${key}=${shellSingleQuote(value)}`);
    }
  }
  // Force demo mode off when any live keys are present, unless explicitly set.
  if (!process.env.AGENT_IC_DEMO_MODE && (process.env.STRIPE_SECRET_KEY || process.env.NEMOTRON_API_KEY || process.env.NEMOCLAW_PROXY_URL)) {
    vars.unshift(`AGENT_IC_DEMO_MODE=${shellSingleQuote('false')}`);
  }
  return vars.join(' ');
}

async function waitForPortFree(url, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 500);
      await fetch(`${url}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      await sleep(300);
    } catch {
      return;
    }
  }
  throw new Error(`Port did not become free within ${timeoutMs}ms`);
}

async function assertLiveHandshake() {
  console.log('[services] verifying live integration handshake...');
  const res = await fetch('http://localhost:3000/api/run-capital-experiment-v8', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposalId: 'atlas-freight-rma-copilot' }),
  });
  if (!res.ok) {
    throw new Error(`Live handshake failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  const stripeState = data?.providerReceipts?.stripe?.state;
  const nemotronState = data?.providerReceipts?.nemotron?.state;
  if (stripeState !== 'live' || nemotronState !== 'live') {
    throw new Error(
      `Live handshake failed: stripe=${stripeState || 'missing'}, nemotron=${nemotronState || 'missing'}. Check env vars and integration credentials.`
    );
  }
  console.log('[services] live handshake confirmed');
}

async function startAppServerInTmux() {
  console.log('[services] (re)starting Next.js dev server in tmux...');
  try {
    execSync('tmux kill-session -t agent-ic-dev 2>/dev/null');
  } catch {
    // ignore if session did not exist
  }
  await sleep(500);
  await waitForPortFree('http://localhost:3000', 15_000);

  const skillDir = path.join(WORKSPACE_ROOT, 'skills');
  const artifactDir = path.join(WORKSPACE_ROOT, 'demo-out', 'artifacts');
  const liveEnv = buildLiveEnvBlock();
  const tmuxCmd = `tmux new-session -d -s agent-ic-dev -c '${WORKSPACE_ROOT}' 'AGENT_IC_SKILL_DIR="${skillDir}" AGENT_IC_ARTIFACT_DIR="${artifactDir}" ${liveEnv} node scripts/safe-next.mjs dev'`;
  execSync(tmuxCmd);
  await waitForServer('http://localhost:3000', 90_000);
  await assertLiveHandshake();
}

async function appServerHasLatestCode() {
  try {
    const res = await fetch('http://localhost:3000/run-v14?recording=1&noAutoRun=1');
    const html = await res.text();
    return html.includes('noAutoRun') && html.includes('artifact-shot-panel');
  } catch {
    return false;
  }
}

async function ensureAppServer() {
  const alreadyRunning = await (async () => {
    try {
      await waitForServer('http://localhost:3000', 3_000);
      return true;
    } catch {
      return false;
    }
  })();

  if (alreadyRunning && (await appServerHasLatestCode())) {
    console.log('[services] Next.js already running with latest code');
    return;
  }

  await startAppServerInTmux();
}

async function getCenter(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return null;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function getCurrentCursor(page) {
  return page.evaluate((vp) => {
    return {
      x: window.__lastMouseX || vp.width / 2,
      y: window.__lastMouseY || vp.height / 2,
    };
  }, VIEWPORT);
}

function cubicBezier(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return p0 * u * u * u + 3 * p1 * u * u * t + 3 * p2 * u * t * t + p3 * t * t * t;
}

function jitter(amount = 3) {
  return (Math.random() - 0.5) * amount;
}

// 1D Perlin-ish noise for organic micro-jitter.
function noise1D(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

async function humanizedMove(page, target, durationMs = 650) {
  const start = await getCurrentCursor(page);
  const end = typeof target === 'string' ? await getCenter(page, target) : target;
  if (!end) return start;

  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  // Humans move faster on long trips and slower on precise landings.
  const humanDuration = Math.max(280, Math.min(1100, durationMs * (0.6 + Math.random() * 0.5) + distance * 0.25));
  const seed = Math.random() * 1000;

  // Arc control points with deliberate asymmetry.
  const arc = (Math.random() - 0.5) * 0.4;
  const control1 = {
    x: start.x + (end.x - start.x) * (0.2 + Math.random() * 0.2) + jitter(120),
    y: start.y + (end.y - start.y) * (0.15 + Math.random() * 0.2) + jitter(120) + arc * distance,
  };
  const control2 = {
    x: start.x + (end.x - start.x) * (0.65 + Math.random() * 0.2) + jitter(120),
    y: start.y + (end.y - start.y) * (0.7 + Math.random() * 0.15) + jitter(120) - arc * distance,
  };

  const steps = Math.max(16, Math.round(humanDuration / 12));
  const stepSleep = humanDuration / steps;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = cubicBezier(t, start.x, control1.x, control2.x, end.x);
    const y = cubicBezier(t, start.y, control1.y, control2.y, end.y);
    // Micro-jitter increases mid-flight and settles near target.
    const jitterAmount = 2 + 4 * Math.sin(Math.PI * t);
    await page.mouse.move(
      Math.round(x + jitter(jitterAmount) + noise1D(seed + i * 0.7) * jitterAmount),
      Math.round(y + jitter(jitterAmount) + noise1D(seed + i * 0.9 + 100) * jitterAmount)
    );
    await sleep(stepSleep);
  }

  // Overshoot + corrective settle.
  const overshoot = Math.max(2, Math.round(distance * 0.015));
  await page.mouse.move(Math.round(end.x + jitter(overshoot)), Math.round(end.y + jitter(overshoot)));
  await sleep(60 + Math.random() * 70);
  await page.mouse.move(Math.round(end.x), Math.round(end.y));
  return end;
}

async function clickTarget(page, selector, { move = true, pauseMs = 350, double = false } = {}) {
  const center = await getCenter(page, selector);
  if (!center) {
    console.warn(`[click] selector not found: ${selector}`);
    return false;
  }
  if (move) await humanizedMove(page, center, 550);
  if (double) {
    await page.mouse.dblclick(center.x, center.y);
  } else {
    await page.mouse.click(center.x, center.y);
  }
  await sleep(pauseMs);
  beat('click');
  return true;
}

async function waitForActiveStage(page, stageId, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const active = await page.evaluate((sid) => {
      const el = document.querySelector(`[data-testid="stage-${sid}"]`);
      return el?.classList?.contains('active') || false;
    }, stageId);
    if (active) return;
    await sleep(200);
  }
  throw new Error(`Stage ${stageId} did not become active within ${timeoutMs}ms`);
}

async function waitForLiveTrace403(page, timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = await page.evaluate(() => {
      const sidecar = document.querySelector('[data-testid="terminal-sidecar"]');
      return sidecar ? sidecar.textContent : '';
    });
    if (text.includes('403') && text.includes('150')) {
      beat('live-trace-403');
      return true;
    }
    await sleep(300);
  }
  console.warn('[warn] live 403 trace not observed');
  return false;
}

async function waitForArtifactContent(page, timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="artifact-shot-panel"] pre');
      return panel ? panel.textContent : '';
    });
    if (text && text.includes('name:') && text.includes('Bounded Capital Experiment')) {
      return true;
    }
    await sleep(400);
  }
  console.warn('[warn] artifact panel content not observed');
  return false;
}

async function injectCursorOverlay(page) {
  await page.addInitScript((vp) => {
    window.__lastMouseX = vp.width / 2;
    window.__lastMouseY = vp.height / 2;

    const style = document.createElement('style');
    style.textContent = `
      * { cursor: none !important; }
      #agent-ic-cursor {
        position: fixed;
        top: 0;
        left: 0;
        width: 22px;
        height: 22px;
        border: 2px solid rgba(255, 255, 255, 0.92);
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.18);
        box-shadow: 0 0 8px rgba(0, 0, 0, 0.45);
        pointer-events: none;
        z-index: 999999;
        transform: translate(-50%, -50%);
        transition: width 0.08s, height 0.08s, background 0.08s;
      }
      #agent-ic-cursor.clicking {
        width: 16px;
        height: 16px;
        background: rgba(255, 255, 255, 0.45);
      }
    `;
    document.head.appendChild(style);

    const cursor = document.createElement('div');
    cursor.id = 'agent-ic-cursor';
    document.body.appendChild(cursor);

    document.addEventListener('mousemove', (e) => {
      window.__lastMouseX = e.clientX;
      window.__lastMouseY = e.clientY;
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    }, { passive: true });
    document.addEventListener('mousedown', () => cursor.classList.add('clicking'), { passive: true });
    document.addEventListener('mouseup', () => cursor.classList.remove('clicking'), { passive: true });
  }, VIEWPORT);
}

async function openTerminalTabs(context) {
  const tabs = new Map();
  for (const pageDef of TERMINAL_PAGES) {
    const p = await context.newPage();
    await p.goto(`${TERMINAL_BASE}${pageDef.path}`, { waitUntil: 'load' });
    await p.addStyleTag({ content: '* { cursor: none !important; }' });
    tabs.set(pageDef.id, p);
    console.log(`[tabs] opened ${pageDef.id}`);
  }
  return tabs;
}

async function switchToTab(pages, id) {
  const page = pages.get(id);
  if (!page) {
    console.warn(`[tabs] unknown page ${id}`);
    return null;
  }
  await page.bringToFront();
  return page;
}

async function captureRawVideo() {
  await fs.mkdir(RAW_DIR, { recursive: true });

  let browser;
  let context;
  let appPage;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--hide-scrollbars', '--disable-background-timer-throttling'],
    });

    context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      recordVideo: {
        dir: RAW_DIR,
        size: VIEWPORT,
      },
    });

    appPage = await context.newPage();
    await injectCursorOverlay(appPage);
    await appPage.goto(APP_URL, { waitUntil: 'load' });
    beat('loaded');

    // Open terminal proof tabs in the background.
    const terminalTabs = await openTerminalTabs(context);
    await appPage.bringToFront();

    // 1. Click "Run capital experiment".
    await appPage.waitForSelector('[data-testid="run-capital-experiment"]', { state: 'visible', timeout: 15_000 });
    await clickTarget(appPage, '[data-testid="run-capital-experiment"]', { move: true, pauseMs: 500 });

    // 2. Click the Live trace tab in the sidecar.
    try {
      await appPage.waitForSelector('.v14-terminal-toggle', { state: 'visible', timeout: 10_000 });
      await clickTarget(appPage, '.v14-terminal-toggle', { move: true, pauseMs: 250 });
    } catch (err) {
      console.warn(`[warn] could not click live trace tab: ${err.message}`);
    }

    // Timeline: let fixed recording stage timers advance while we cut to proof tabs.
    const stagePromises = [
      waitForActiveStage(appPage, 'evaluate', 25_000),
      waitForActiveStage(appPage, 'fund', 35_000),
      waitForActiveStage(appPage, 'govern', 45_000),
      waitForActiveStage(appPage, 'decide', 60_000),
    ];

    // Around the Fund stage, show the real Stripe Checkout Session terminal page.
    await sleep(17_000);
    await switchToTab(terminalTabs, 'stripe-checkout');
    await sleep(4_000);
    await appPage.bringToFront();

    // Around Govern, show the NemoClaw 403 gate.
    await sleep(6_000);
    await switchToTab(terminalTabs, 'nemoclaw-gate-403');
    await sleep(4_500);
    await appPage.bringToFront();

    // Wait for the red vignette / govern content.
    await waitForActiveStage(appPage, 'govern', 20_000);
    await sleep(2_500);

    // Manual interaction: expand the raw intercept response to prove the UI is live.
    try {
      await clickTarget(appPage, '[data-testid="intercept-card"] .v14-intercept-toggle', {
        move: true,
        pauseMs: 600,
      });
    } catch (err) {
      console.warn(`[warn] could not click intercept toggle: ${err.message}`);
    }

    // Around Decide, show GPU/Nemotron evidence and playbook artifact.
    await switchToTab(terminalTabs, 'nvidia-smi');
    await sleep(3_500);
    await switchToTab(terminalTabs, 'cat-playbook');
    await sleep(3_500);
    await switchToTab(terminalTabs, 'ls-skills');
    await sleep(2_500);
    await appPage.bringToFront();

    // Make sure Decide stage is visible and scroll artifact panel into view.
    await waitForActiveStage(appPage, 'decide', 25_000);
    await sleep(1_000);

    const artifactPanel = await appPage.locator('[data-testid="artifact-shot-panel"]').first();
    if (artifactPanel) {
      await artifactPanel.scrollIntoViewIfNeeded();
      await sleep(800);
    }

    // Wait for playbook content to populate, but don't exceed the raw max.
    const artifactWaitBudget = Math.max(5_000, MAX_RECORDING_SECONDS * 1000 - (Date.now() - beats.start) - 5_000);
    const hasArtifact = await waitForArtifactContent(appPage, artifactWaitBudget);
    if (hasArtifact) {
      console.log('[record] artifact panel populated');
    }

    // Hover / move over the final CTAs.
    try {
      await humanizedMove(appPage, await getCenter(appPage, '[data-testid="open-live-demo"]'), 500);
      await sleep(250);
      await humanizedMove(appPage, await getCenter(appPage, '[data-testid="view-source"]'), 500);
      await sleep(250);
      await humanizedMove(appPage, await getCenter(appPage, '[data-testid="view-playbook"]'), 500);
      await sleep(250);
    } catch (err) {
      console.warn(`[warn] final CTA hover failed: ${err.message}`);
    }

    // Hold until target length, capped by max.
    const elapsed = Date.now() - beats.start;
    const remaining = MAX_RECORDING_SECONDS * 1000 - elapsed;
    const targetHold = TARGET_RECORDING_SECONDS * 1000 - elapsed;
    const hold = Math.max(0, Math.min(targetHold, remaining));
    if (hold > 0) {
      console.log(`[record] holding final frame for ${(hold / 1000).toFixed(1)}s`);
      await sleep(hold);
    }
    beat('ended');

    // Wait for any pending stage promises.
    await Promise.allSettled(stagePromises);

    await context.close();
    await browser.close();

    const video = appPage.video();
    if (!video) throw new Error('Playwright did not create a video object.');
    const rawPath = await video.path();
    await fs.copyFile(rawPath, RAW_VIDEO);

    const totalSeconds = (beats.ended - beats.start) / 1000;
    console.log(`\nRaw recording saved: ${RAW_VIDEO} (${totalSeconds.toFixed(1)}s)`);
    console.log('Stage beats:');
    for (const s of STAGES) {
      const ts = beats.stages[s];
      console.log(`  ${s}: ${ts ? `${ts - beats.start}ms` : 'not reached'}`);
    }
  } catch (err) {
    console.error('Recording failed:', err);
    process.exitCode = 1;
  } finally {
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
  }
}

async function main() {
  await loadEnvLocal();
  beat('start');

  await ensureAppServer();
  await ensureTerminalServer();
  await resetAudit();

  await captureRawVideo();

  process.exit(process.exitCode || 0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
