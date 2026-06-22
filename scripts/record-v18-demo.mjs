#!/usr/bin/env node
/**
 * Agent IC v18 — Enterprise Trial Demo Recorder
 * Synced to narration: visuals appear WHEN narrated, not before or after.
 */

import { chromium } from '@playwright/test';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(process.env.AGENT_IC_DEMO_DIR || 'demo-out');
const RAW_VIDEO = path.join(OUT_DIR, 'agent-ic-demo-raw-v18.mp4');
const BASE_URL = (process.env.AGENT_IC_INTERNAL_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const TRIAL_URL = `${BASE_URL}/trial`;

const DISPLAY = process.env.AGENT_IC_DISPLAY || ':99';
const XVFB_RES = '1920x1080x24';
const X_ENV = { ...process.env, DISPLAY, WAYLAND_DISPLAY: '', XDG_SESSION_TYPE: 'x11' };
const VIEWPORT = { width: 1920, height: 1080 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let xvfbStartedByUs = false;

async function ensureXvfb() {
  try {
    execSync(`pgrep -f "Xvfb ${DISPLAY}"`, { stdio: 'pipe' });
  } catch {
    const xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', XVFB_RES], {
      env: X_ENV, detached: true, stdio: 'ignore',
    });
    xvfb.unref();
    xvfbStartedByUs = true;
    await sleep(2000);
  }
}

async function recordDemo() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await ensureXvfb();

  // Health check
  console.log('[recorder] checking server health...');
  try {
    const resp = await fetch(TRIAL_URL, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    console.log('[recorder] server reachable');
  } catch (error) {
    console.error(`[recorder] FATAL: server not reachable at ${TRIAL_URL}`);
    process.exit(1);
  }

  console.log('[recorder] launching chromium...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
  });

  const context = await browser.newContext({
    viewport: VIEWPORT, locale: 'en-US', deviceScaleFactor: 1,
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
  });

  const page = await context.newPage();
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('favicon') || url.includes('sourceMap')) return route.abort();
    return route.continue();
  });

  const startTime = Date.now();
  const beats = {};
  function beat(name) {
    beats[name] = Date.now() - startTime;
    console.log(`[beat] ${name} @ ${beats[name]}ms`);
  }

  beat('navigate');

  // ═══════════════════════════════════════════════════════════════
  // SEGMENT 1 (0-5s): Hero intake — "Agent IC is the control plane..."
  // ═══════════════════════════════════════════════════════════════
  await page.goto(TRIAL_URL, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  beat('hero_visible');

  // ═══════════════════════════════════════════════════════════════
  // SEGMENT 2 (5-13s): Type mission — "RouteGuard AI claims 90%..."
  // ═══════════════════════════════════════════════════════════════
  const textarea = page.locator('.ic-mission-input');
  await textarea.click();
  await sleep(500);
  const mission = 'Evaluate RouteGuard AI for complaint triage before signing a $14,400 annual contract';
  await textarea.pressSequentially(mission, { delay: 40 });
  beat('mission_typed');
  await sleep(1500);

  // Click analyze
  const analyzeBtn = page.locator('.ic-btn-primary');
  await analyzeBtn.click();
  beat('analyze_clicked');

  // ═══════════════════════════════════════════════════════════════
  // SEGMENT 3 (13-22s): Loading — "A one-hundred-dollar Stripe envelope..."
  // Show the reasoning trace building. Keep this SHORT (~8s).
  // ═══════════════════════════════════════════════════════════════
  await page.waitForSelector('.ic-reasoning-container', { timeout: 5_000 });
  beat('reasoning_started');

  // Wait for the trial to complete — but cap at 15s for the loading screen
  // The actual API call happens in background; we just need the result
  await page.waitForSelector('.ic-decision-badge', { timeout: 60_000 });
  beat('decision_visible');

  // ═══════════════════════════════════════════════════════════════
  // SEGMENT 4 (22-33s): Decision + metrics visible while narrating
  // "The worker routes 301 complaints... Nemotron classifies 12..."
  // ═══════════════════════════════════════════════════════════════
  await sleep(8000); // Hold on decision card through segment 8 narration

  // Scroll to metrics
  await page.evaluate(() => window.scrollBy(0, 400));
  await sleep(3000);
  beat('metrics_visible');

  // ═══════════════════════════════════════════════════════════════
  // SEGMENT 5 (33-40s): Blocked action visible while narrating
  // "CARFAX lookup... OpenShell blocks it... Spend cap exceeded"
  // ═══════════════════════════════════════════════════════════════
  await page.evaluate(() => window.scrollBy(0, 400));
  await sleep(7000);
  beat('blocked_action_visible');

  // ═══════════════════════════════════════════════════════════════
  // SEGMENT 6 (40-53s): Evidence visible while narrating
  // "Three headline metrics... Net value $2,504..."
  // ═══════════════════════════════════════════════════════════════
  await page.evaluate(() => window.scrollBy(0, 200));
  await sleep(13000);
  beat('evidence_visible');

  // ═══════════════════════════════════════════════════════════════
  // SEGMENT 7 (53-59s): Vendor claims visible while narrating
  // "One of one measurable claims validated... 91% accuracy"
  // ═══════════════════════════════════════════════════════════════
  await page.evaluate(() => window.scrollBy(0, 200));
  await sleep(6000);
  beat('claims_visible');

  // ═══════════════════════════════════════════════════════════════
  // SEGMENT 8 (59-64s): Decision recap — stay on top
  // "Decision: continue... more than twice its annual cost"
  // ═══════════════════════════════════════════════════════════════
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(8000); // Extended: wait until segment 9 starts before navigating

  // ═══════════════════════════════════════════════════════════════
  // SEGMENT 9 (64-74s): Renewals page while narrating
  // "Renewal ledger... Vendors that prove their value... lose funding"
  // ═══════════════════════════════════════════════════════════════
  const renewalsNav = page.locator('.ic-nav-item', { hasText: 'Vendor Renewals' });
  await renewalsNav.click();
  beat('renewals_clicked');
  await page.waitForSelector('.ic-panel-title', { timeout: 15_000 });
  await sleep(9000);
  beat('renewals_visible');

  // Scroll to show all vendor cards
  await page.evaluate(() => window.scrollBy(0, 600));
  await sleep(5000);
  beat('renewals_scrolled');

  // ═══════════════════════════════════════════════════════════════
  // SEGMENTS 10-11 (74-83s): Close on hero/intake
  // "Four enterprise domains... Agent IC: fund the right AI pilots..."
  // ═══════════════════════════════════════════════════════════════
  const trialNav = page.locator('.ic-nav-item', { hasText: 'Trial Console' });
  await trialNav.click();
  await sleep(14000);
  beat('end');

  // ═══════════════════════════════════════════════════════════════
  // Save video
  // ═══════════════════════════════════════════════════════════════
  await context.close();
  await browser.close();

  const files = await fs.readdir(OUT_DIR);
  const webmFiles = files
    .filter((f) => f.endsWith('.webm') && !f.includes('stale'))
    .map((f) => ({ name: f, path: path.join(OUT_DIR, f) }));

  if (webmFiles.length === 0) {
    console.error('[recorder] No webm video found');
    process.exit(1);
  }

  const sorted = await Promise.all(
    webmFiles.map(async (f) => ({ ...f, stat: await fs.stat(f.path) }))
  ).then((arr) => arr.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs));

  const webmPath = sorted[0].path;

  console.log('[recorder] converting', sorted[0].name, '→ mp4...');
  execSync(
    `ffmpeg -y -i "${webmPath}" -c:v libopenh264 ` +
    `-pix_fmt yuv420p -movflags +faststart ` +
    `"${RAW_VIDEO}"`,
    { stdio: 'inherit', env: process.env }
  );

  await fs.unlink(webmPath).catch(() => {});

  await fs.writeFile(path.join(OUT_DIR, 'v18-beats.json'), JSON.stringify(beats, null, 2));

  const duration = (Date.now() - startTime) / 1000;
  console.log(`[recorder] done in ${duration.toFixed(1)}s`);
  console.log(`[recorder] raw video: ${RAW_VIDEO}`);
}

recordDemo().catch((error) => {
  console.error('[recorder] FAILED:', error.message);
  process.exit(1);
}).finally(() => {
  if (xvfbStartedByUs) { /* Xvfb cleaned by OS */ }
});
