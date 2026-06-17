import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.AGENT_IC_BASE_URL || 'http://localhost:3000';
const outDir = path.resolve(process.env.AGENT_IC_DEMO_DIR || 'demo-out');
const rawDir = path.join(outDir, 'raw');
const viewport = { width: 1920, height: 1080 };

const beats = {};
function beat(name) {
  beats[name] = Date.now();
  console.log(`[beat] ${name} @ ${beats[name]}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // server not ready yet
    }
    await sleep(500);
  }
  throw new Error(`Server did not become ready: ${url}`);
}

async function smoothScrollTo(page, selector, block = 'center') {
  await page.evaluate(({ sel, blk }) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: blk });
  }, { sel: selector, blk: block });
  await sleep(800);
}

async function waitForEnabled(locator, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await locator.isEnabled().catch(() => false)) return;
    await sleep(200);
  }
  throw new Error('Button did not become enabled in time');
}

async function resetAudit(url) {
  await fetch(`${url}/api/audit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'reset', confirmReset: 'AGENT_IC_DEMO_RESET' }),
  }).catch(() => {});
}

await fs.mkdir(rawDir, { recursive: true });

const server = spawn(process.execPath, ['scripts/safe-next.mjs', 'dev'], {
  env: {
    ...process.env,
    AGENT_IC_DEMO_MODE: 'true',
    NEXT_PUBLIC_AGENT_IC_RECORDING: 'true',
    AGENT_IC_AUDIT_FILE: '.agent-ic/demo-audit-log.jsonl',
  },
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

server.stdout.on('data', (data) => process.stdout.write(data));
server.stderr.on('data', (data) => process.stderr.write(data));

let context;
let browser;

try {
  await waitForServer(baseUrl);
  await resetAudit(baseUrl);

  browser = await chromium.launch({
    headless: true,
    args: ['--hide-scrollbars'],
  });

  context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: {
      dir: rawDir,
      size: viewport,
    },
  });

  const page = await context.newPage();
  const video = page.video();

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="hero-section"]').waitFor({ timeout: 15_000 });
  beat('hero');

  // Apply a slight zoom so the full layout fits without horizontal scrollbars.
  await page.evaluate(() => {
    document.body.style.zoom = '90%';
  });

  await sleep(12_000);

  await smoothScrollTo(page, '[data-testid="workbench-section"]');
  beat('workbench');

  await page.locator('[data-testid="proposal-atlas-freight"]').click();
  beat('select_atlas');
  await sleep(1_500);

  const evaluateBtn = page.locator('[data-testid="evaluate-agent-ic"]');
  await waitForEnabled(evaluateBtn);
  await evaluateBtn.click();
  beat('evaluate_click');

  // Wait for the CONTINUE decision and budget line to render.
  await page.locator('.big-verdict .decision').filter({ hasText: /CONTINUE/ }).waitFor({ timeout: 10_000 });
  await page.locator('[data-testid="budget-line"]').first().waitFor({ state: 'visible', timeout: 10_000 });
  beat('result_visible');

  await sleep(18_000);

  // Center the budget / cap / payback area in the IC output panel.
  await smoothScrollTo(page, '.ic-output .metric-grid', 'center');
  beat('budget_visible');
  await sleep(18_000);

  await smoothScrollTo(page, '[data-testid="authorize-stripe-spend"]');
  const authorizeBtn = page.locator('[data-testid="authorize-stripe-spend"]');
  await waitForEnabled(authorizeBtn);
  await authorizeBtn.click();
  beat('stripe_click');

  await page.locator('[data-testid="stripe-result"]').waitFor({ state: 'visible', timeout: 15_000 });
  beat('stripe_result');
  await sleep(18_000);

  await smoothScrollTo(page, '.evidence-section');
  beat('evidence_start');

  // Advance through the four evidence gates (weeks 2, 4, 6, 8).
  const weekBeats = ['week_2', 'week_4', 'week_6', 'week_8'];
  for (let i = 0; i < weekBeats.length; i++) {
    await page.locator('[data-testid="advance-roi-evidence"]').click();
    beat(weekBeats[i]);
    if (i < weekBeats.length - 1) {
      await sleep(6_000);
    } else {
      await sleep(10_000);
    }
  }

  await page.locator('[data-testid="final-decision"]').scrollIntoViewIfNeeded();
  beat('decision');
  await sleep(14_000);

  await smoothScrollTo(page, '[data-testid="governance-section"]');
  beat('governance');
  await sleep(12_000);

  await smoothScrollTo(page, '[data-testid="audit-section"]');
  beat('audit');
  await sleep(12_000);

  await smoothScrollTo(page, '[data-testid="storyboard-section"]');
  beat('storyboard');
  await sleep(10_000);

  await smoothScrollTo(page, '[data-testid="hero-section"]');
  beat('final_lockup');
  await sleep(10_000);

  await context.close();
  await browser.close();

  if (!video) throw new Error('Playwright did not create a video object.');

  const rawVideo = await video.path();
  const finalVideo = path.join(outDir, 'ui-final.webm');
  await fs.copyFile(rawVideo, finalVideo);

  // Also copy into remotion/public so the render step can find it.
  const remotionPublic = path.resolve('remotion/public');
  await fs.mkdir(remotionPublic, { recursive: true });
  await fs.copyFile(rawVideo, path.join(remotionPublic, 'ui-final.webm'));

  const timestampsPath = path.join(outDir, 'stage-timestamps-final.json');
  await fs.writeFile(timestampsPath, JSON.stringify(beats, null, 2));

  console.log(`\nRecorded base video: ${finalVideo}`);
  console.log(`Timestamps JSON:   ${timestampsPath}`);
  console.log('Beats:');
  for (const [name, ts] of Object.entries(beats)) {
    console.log(`  ${name}: ${ts}`);
  }
} catch (err) {
  console.error('Recording failed:', err);
  process.exitCode = 1;
} finally {
  if (context) {
    try {
      await context.close();
    } catch {}
  }
  if (browser) {
    try {
      await browser.close();
    } catch {}
  }
  // Best-effort cleanup of the dev server process group.
  try {
    if (server && server.pid) process.kill(-server.pid, 'SIGTERM');
  } catch {}
  await sleep(2000);
  try {
    if (server && server.pid && server.exitCode === null) process.kill(-server.pid, 'SIGKILL');
  } catch {
    // ignore cleanup errors
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
process.exit(0);
