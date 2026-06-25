#!/usr/bin/env node
/**
 * Agent IC v18 — Professional headed-browser demo recorder
 *
 * Records the real Chromium window with ffmpeg/x11grab instead of
 * Playwright's viewport-only recordVideo. The resulting video preserves a
 * headed browser surface with a clean product URL and no localhost/dev-server
 * address-bar chrome. No crop/brightness drift is applied here or in muxing.
 */

import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(process.env.AGENT_IC_DEMO_DIR || 'demo-out');
const RAW_VIDEO = path.join(OUT_DIR, 'agent-ic-demo-raw-v18.mp4');
const BASE_URL = (process.env.AGENT_IC_INTERNAL_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const BROWSER_BASE_URL = (process.env.AGENT_IC_BROWSER_BASE_URL || 'http://app.agenticontrolplane.com').replace(/\/$/, '');
const HEALTH_URL = `${BASE_URL}/trial`;
const TRIAL_URL = `${BROWSER_BASE_URL}/trial`;
const REQUIRE_LIVE_PROOF = process.env.AGENT_IC_REQUIRE_LIVE_PROOF === 'true';
const INTERNAL_URL = new URL(BASE_URL);
const BROWSER_URL = new URL(BROWSER_BASE_URL);
const INTERNAL_PORT = INTERNAL_URL.port || (INTERNAL_URL.protocol === 'https:' ? '443' : '80');
const BROWSER_PORT = BROWSER_URL.port || (BROWSER_URL.protocol === 'https:' ? '443' : '80');

const DISPLAY = process.env.AGENT_IC_DISPLAY || ':99';
const XVFB_RES = '1920x1080x24';
const CAPTURE_SIZE = '1920x1080';
const X_ENV = { ...process.env, DISPLAY, WAYLAND_DISPLAY: '', XDG_SESSION_TYPE: 'x11' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let xvfbStartedByUs = false;

function maskId(id) {
  const text = String(id || '');
  if (text.length <= 14) return text;
  return `${text.slice(0, 8)}…${text.slice(-4)}`;
}

async function ensureXvfb() {
  try {
    execFileSync('pgrep', ['-f', `Xvfb ${DISPLAY}`], { stdio: 'pipe' });
  } catch {
    const xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', XVFB_RES, '-ac'], {
      env: X_ENV, detached: true, stdio: 'ignore',
    });
    xvfb.unref();
    xvfbStartedByUs = true;
    await sleep(2000);
  }
}

function startScreenCapture() {
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'warning',
    '-f', 'x11grab',
    '-draw_mouse', '0',
    '-framerate', '25',
    '-video_size', CAPTURE_SIZE,
    '-i', `${DISPLAY}.0+0,0`,
    '-an',
    '-c:v', 'libopenh264',
    '-profile:v', 'high',
    '-rc_mode', 'bitrate',
    '-allow_skip_frames', '0',
    '-b:v', '8M',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    RAW_VIDEO,
  ];

  console.log('[recorder] starting x11grab capture...');
  const proc = spawn('ffmpeg', args, { env: X_ENV, stdio: ['pipe', 'inherit', 'inherit'] });
  proc.on('exit', (code, signal) => {
    console.log(`[recorder] ffmpeg exited code=${code} signal=${signal || ''}`);
  });
  return proc;
}

function findChromeExecutable() {
  const configured =
    process.env.CHROME_BIN ||
    process.env.CHROME_EXECUTABLE_PATH ||
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (configured) return configured;

  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      return execFileSync('bash', ['-lc', `command -v ${bin}`], { encoding: 'utf8' }).trim();
    } catch {
      // Try the next common binary name.
    }
  }

  return undefined;
}

async function stopScreenCapture(proc) {
  if (!proc) return;
  if (proc.exitCode !== null) return;
  await new Promise((resolve) => {
    const done = () => resolve();
    proc.once('exit', done);
    try {
      proc.stdin.write('q');
      proc.stdin.end();
    } catch {
      proc.kill('SIGINT');
    }
    setTimeout(() => {
      if (proc.exitCode === null) proc.kill('SIGTERM');
    }, 5000).unref();
  });
}

async function instantScroll(page, targetY) {
  await page.evaluate((target) => window.scrollTo({ top: target, behavior: 'instant' }), targetY);
}

async function animatedScroll(page, targetY, durationMs = 1800) {
  await page.evaluate(async ({ target, duration }) => {
    const start = window.scrollY;
    const maxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
      document.body.scrollHeight - window.innerHeight
    );
    const clampedTarget = Math.max(0, Math.min(target, maxScroll));
    const delta = clampedTarget - start;
    const started = performance.now();
    await new Promise((resolve) => {
      function step(now) {
        const t = Math.min(1, (now - started) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
        window.scrollTo(0, start + delta * eased);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }, { target: targetY, duration: durationMs });
}

async function waitUntil(startTime, targetSeconds) {
  const remaining = Math.round(targetSeconds * 1000 - (Date.now() - startTime));
  if (remaining > 0) await sleep(remaining);
}

async function normalizeVisibleTrialUrl(page) {
  await page.evaluate(() => {
    if (window.location.pathname !== '/trial' || window.location.hash) {
      window.history.replaceState(null, '', '/trial');
    }
  });
}

async function cursorTour(page, positions, holdMs = 900) {
  for (const [x, y] of positions) {
    await page.mouse.move(x, y, { steps: 22 });
    await sleep(holdMs);
  }
}

function startCursorLoop(page) {
  let active = true;
  const positions = [
    [280, 326], [680, 326], [1080, 326], [1480, 326],
    [360, 520], [820, 520], [1280, 520], [620, 770], [1180, 770],
  ];
  const done = (async () => {
    while (active) {
      await cursorTour(page, positions, 650);
    }
  })().catch(() => {});
  return () => {
    active = false;
    void done;
  };
}

async function highlightPanel(page, selectorText) {
  await page.evaluate((text) => {
    const panels = document.querySelectorAll('.ic-panel-title');
    for (const p of panels) {
      if (p.textContent.includes(text)) {
        const panel = p.closest('.ic-panel');
        if (panel) {
          panel.style.transition = 'border-color 120ms ease';
          panel.style.borderColor = 'var(--ic-amber)';
          setTimeout(() => { panel.style.borderColor = ''; }, 1800);
        }
        break;
      }
    }
  }, selectorText);
}

async function pulseElements(page, selector, durationMs = 3000, intervalMs = 450) {
  await page.evaluate(async ({ selector: targetSelector, duration, interval }) => {
    const elements = Array.from(document.querySelectorAll(targetSelector));
    if (elements.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, duration));
      return;
    }

    const originals = elements.map((el) => ({
      el,
      borderColor: el.style.borderColor,
      boxShadow: el.style.boxShadow,
      transform: el.style.transform,
      transition: el.style.transition,
    }));

    function resetAll() {
      for (const item of originals) {
        item.el.style.borderColor = item.borderColor;
        item.el.style.boxShadow = item.boxShadow;
        item.el.style.transform = item.transform;
        item.el.style.transition = item.transition;
      }
    }

    let index = 0;
    function tick() {
      resetAll();
      const el = elements[index % elements.length];
      el.style.transition = 'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease';
      el.style.borderColor = 'var(--ic-amber)';
      el.style.boxShadow = '0 0 0 2px rgba(240, 200, 90, 0.28)';
      el.style.transform = 'translateY(-2px)';
      index += 1;
    }

    tick();
    const timer = setInterval(tick, interval);
    await new Promise((resolve) => setTimeout(resolve, duration));
    clearInterval(timer);
    resetAll();
  }, { selector, duration: durationMs, interval: intervalMs });
}

async function recordDemo() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await ensureXvfb();

  console.log('[recorder] checking server health...');
  try {
    const resp = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    console.log('[recorder] server reachable');
  } catch (error) {
    console.error(`[recorder] FATAL: server not reachable at ${HEALTH_URL}`);
    process.exit(1);
  }

  console.log('[recorder] launching headed Chromium...');
  const chromeExecutable = findChromeExecutable();
  const browser = await chromium.launch({
    headless: false,
    executablePath: chromeExecutable,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--force-device-scale-factor=1',
      '--window-position=0,0',
      '--window-size=1920,1080',
      '--disable-infobars',
      '--disable-session-crashed-bubble',
      '--disable-features=TranslateUI',
      `--host-resolver-rules=MAP ${BROWSER_URL.hostname}:${BROWSER_PORT} ${INTERNAL_URL.hostname}:${INTERNAL_PORT},MAP agent.ic:80 ${INTERNAL_URL.hostname}:${INTERNAL_PORT}`,
      `--unsafely-treat-insecure-origin-as-secure=${BROWSER_BASE_URL}`,
    ],
    env: X_ENV,
  });

  const context = await browser.newContext({ viewport: null, locale: 'en-US' });
  const page = await context.newPage();
  const trialResponses = [];
  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (!url.includes('/api/enterprise-trial') || response.request().method() !== 'POST') return;
      const payload = await response.json().catch(() => null);
      trialResponses.push({
        url,
        status: response.status(),
        capturedAt: new Date().toISOString(),
        payload,
      });
      console.log(`[recorder] captured enterprise-trial response status=${response.status()}`);
    } catch (error) {
      console.log(`[recorder] response capture skipped: ${error.message}`);
    }
  });
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('favicon') || url.includes('sourceMap')) return route.abort();
    return route.continue();
  });

  await page.goto(TRIAL_URL, { waitUntil: 'domcontentloaded' });
  await normalizeVisibleTrialUrl(page);
  await page.evaluate((requireLiveProof) => {
    window.__AGENT_IC_REQUIRE_LIVE_PROOF__ = requireLiveProof;
  }, REQUIRE_LIVE_PROOF);
  await page.bringToFront();
  const textarea = page.locator('.ic-mission-input');
  await textarea.click();
  await sleep(150);

  const beats = {};
  const startTime = Date.now();
  function beat(name) {
    beats[name] = Date.now() - startTime;
    console.log(`[beat] ${name} @ ${beats[name]}ms`);
  }

  const capture = startScreenCapture();
  await sleep(120);
  beat('typing_started');

  const mission = 'Evaluate RouteGuard AI for complaint triage before signing a $14,400 annual contract';
  await page.evaluate(() => {
    const bars = Array.from(document.querySelectorAll('.ic-intake-motion-lane span'));
    let tick = 0;
    window.__icIntroMotion = setInterval(() => {
      tick += 1;
      bars.forEach((bar, i) => {
        const wave = (Math.sin((tick + i * 1.7) / 2.2) + 1) / 2;
        bar.style.height = `${18 + Math.round(wave * 76)}%`;
        bar.style.opacity = `${0.58 + wave * 0.42}`;
      });
    }, 80);
  });
  const missionInput = page.locator('.ic-mission-input');
  await missionInput.fill('');
  await missionInput.focus();
  await page.keyboard.type(mission, { delay: 50 });
  beat('mission_typed');
  await page.evaluate(() => clearInterval(window.__icIntroMotion));
  await waitUntil(startTime, 12.45);

  await page.locator('.ic-btn-primary').click();
  beat('analyze_clicked');

  await page.waitForSelector('.ic-ops-feed', { timeout: 5_000 });
  beat('ops_feed_visible');

  const stopRunningCursor = startCursorLoop(page);

  await page.waitForSelector('.ic-decision-badge', { timeout: 180_000 });
  stopRunningCursor();
  beat('decision_visible');
  await highlightPanel(page, 'Procurement Decision');
  await pulseElements(page, '.ic-decision-proof .ic-proof-metric', 500, 250);

  const decisionSeconds = (Date.now() - startTime) / 1000;
  const compressedPostDecision = decisionSeconds > 91;
  const policyScrollMs = compressedPostDecision ? 1200 : 6800;
  const policyReceiptMs = compressedPostDecision ? 1400 : 8400;
  const providerReceiptMs = compressedPostDecision ? 900 : 4800;
  const renewalScrollMs = compressedPostDecision ? 900 : 6200;
  const closePulseMs = compressedPostDecision ? 1000 : 4500;

  if (!compressedPostDecision) await waitUntil(startTime, 79.15);
  await animatedScroll(page, 520, policyScrollMs);
  beat('blocked_action_visible');
  await highlightPanel(page, 'Policy Receipt');
  await Promise.all([
    pulseElements(page, '.ic-policy-receipt .ic-receipt-card, .ic-provider-receipts .ic-receipt-card', policyReceiptMs, compressedPostDecision ? 220 : 420),
    animatedScroll(page, 980, policyReceiptMs),
  ]);
  beat('evidence_visible');
  await highlightPanel(page, 'Provider Receipts');
  await pulseElements(page, '.ic-provider-receipts .ic-receipt-card, .ic-formula-panel .ic-receipt-card', providerReceiptMs, compressedPostDecision ? 220 : 420);

  if (!compressedPostDecision) await waitUntil(startTime, 101.25);
  else await sleep(120);
  const renewalsNav = page.locator('.ic-nav-item', { hasText: 'Vendor Renewals' });
  await renewalsNav.click();
  await normalizeVisibleTrialUrl(page);
  beat('renewals_clicked');
  await page.waitForSelector('.ic-panel-title', { timeout: 15_000 });
  await pulseElements(page, '.ic-metrics-grid .ic-metric-cell', compressedPostDecision ? 500 : 800, 240);
  await animatedScroll(page, 520, renewalScrollMs);
  beat('renewals_scrolled');

  if (!compressedPostDecision) await waitUntil(startTime, 110.0);
  else await sleep(120);
  const trialNav = page.locator('.ic-nav-item', { hasText: 'Trial Console' });
  await trialNav.click();
  await normalizeVisibleTrialUrl(page);
  beat('close_trial_visible');
  await page.waitForSelector('.ic-mission-input', { timeout: 8_000 });
  await instantScroll(page, 0);
  await page.locator('.ic-btn-secondary', { hasText: 'Browse Vendor Cases' }).click();
  await page.waitForSelector('.ic-case-card', { timeout: 8_000 });
  beat('close_cases_visible');
  await pulseElements(page, '.ic-intake-proof-strip .ic-proof-chip, .ic-case-card', closePulseMs, compressedPostDecision ? 220 : 430);
  beat('close_cases_scrolled');

  const captionTimingPath = path.join(OUT_DIR, 'caption-timing-v18.json');
  const captionTiming = JSON.parse(await fs.readFile(captionTimingPath, 'utf8'));
  await waitUntil(startTime, Math.max(117.35, Number(captionTiming.audioDuration || 0) + 0.35));

  beat('end');
  await stopScreenCapture(capture);
  await context.close();
  await browser.close();

  await fs.writeFile(path.join(OUT_DIR, 'v18-beats.json'), JSON.stringify(beats, null, 2));
  const duration = (Date.now() - startTime) / 1000;
  const trialPayload = trialResponses.at(-1)?.payload || null;
  const evidence = trialPayload?.workerResult?.evidence || {};
  const policyResult = trialPayload?.policyBlock?.result || {};
  const proofReport = await fetch(`${BASE_URL}/api/proof-report`).then((r) => r.json()).catch(() => null);
  const provenance = {
    mode: 'fresh-v18-trial-recording',
    video: path.relative(process.cwd(), RAW_VIDEO),
    browserUrl: TRIAL_URL.replace(/127\.0\.0\.1|localhost/g, '[local]'),
    internalBaseUrl: BASE_URL.replace(/127\.0\.0\.1|localhost/g, '[local]'),
    startedAt: new Date(startTime).toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    beats,
    trialResponse: trialPayload ? {
      runId: trialPayload.runId,
      caseId: trialPayload.caseId,
      domain: trialPayload.domain,
      verdict: trialPayload.decision?.verdict,
      stripe: trialPayload.stripe ? {
        mode: trialPayload.stripe.mode,
        testMode: trialPayload.stripe.testMode,
        sessionIdMasked: maskId(trialPayload.stripe.sessionId || ''),
        amountDollars: trialPayload.stripe.amountDollars,
      } : null,
      policyBlock: {
        blocked: policyResult.blocked,
        status: policyResult.status,
        enforcementEngine: policyResult.enforcementEngine,
        attemptedAmount: policyResult.attemptedAmount,
        cap: policyResult.cap,
        policyRule: policyResult.policyRule,
      },
      evidence: {
        casesProcessed: evidence.casesProcessed,
        autoRouted: evidence.autoRouted,
        humanReviewQueue: evidence.humanReviewQueue,
        dataHash: evidence.dataHash,
        classificationMethod: evidence.classificationMethod,
        netValue: trialPayload.decision?.metrics?.profitability?.netValue,
        riskAdjustedROI: trialPayload.decision?.metrics?.riskAdjustedROI?.multiple,
      },
      playbook: trialPayload.playbook ? {
        name: trialPayload.playbook.name,
        steps: trialPayload.playbook.steps?.length || 0,
        version: trialPayload.playbook.version,
        hermesNative: trialPayload.playbook.hermesNative === true,
      } : null,
      hermesExecutionReceipt: trialPayload.hermesExecutionReceipt ? {
        state: trialPayload.hermesExecutionReceipt.state,
        skillSource: trialPayload.hermesExecutionReceipt.skillSource,
        provider: trialPayload.hermesExecutionReceipt.provider,
        taskIdMasked: trialPayload.hermesExecutionReceipt.taskIdMasked,
        hermesSessionIdMasked: trialPayload.hermesExecutionReceipt.hermesSessionIdMasked,
        sandboxId: trialPayload.hermesExecutionReceipt.sandboxId,
        outputSha256: trialPayload.hermesExecutionReceipt.outputSha256,
        outputSummary: trialPayload.hermesExecutionReceipt.outputSummary,
      } : null,
    } : null,
    providerProof: proofReport?.providers || null,
    workloadEvidence: proofReport?.workloadEvidence || null,
  };
  await fs.writeFile(path.join(OUT_DIR, 'stage-events-v18.json'), JSON.stringify(provenance, null, 2));
  console.log(`[recorder] done in ${duration.toFixed(1)}s`);
  console.log(`[recorder] raw video: ${RAW_VIDEO}`);
}

recordDemo().catch(async (error) => {
  console.error('[recorder] FAILED:', error.message);
  process.exit(1);
}).finally(() => {
  if (xvfbStartedByUs) { /* Xvfb cleaned by OS */ }
});
