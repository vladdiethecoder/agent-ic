import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const userBaseUrl = process.env.AGENT_IC_BASE_URL;
const outDir = path.resolve(process.env.AGENT_IC_DEMO_DIR || 'demo-out');
const rawDir = path.join(outDir, 'raw');
const viewport = { width: 1920, height: 1080 };

const TOTAL_RECORDING_SECONDS = 130; // covers all stage delays + outro hold

const beats = {};
function beat(name) {
  beats[name] = Date.now();
  console.log(`[beat] ${name} @ ${beats[name]}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function detectServerUrl(child, timeoutMs = 90_000) {
  if (userBaseUrl) return userBaseUrl;
  const chunks = [];
  const localRe = /-\s*Local:\s+(http:\/\/\S+)/;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for Next.js local URL in stdout. Captured:\n${Buffer.concat(chunks).toString('utf8')}`
        )
      );
    }, timeoutMs);

    const onData = (data) => {
      chunks.push(data);
      process.stdout.write(data);
      const text = Buffer.concat(chunks).toString('utf8');
      const m = text.match(localRe);
      if (m) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve(m[1]);
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', (data) => process.stderr.write(data));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
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

let context;
let browser;

async function getCenter(page, testId) {
  const box = await page.locator(`[data-testid="${testId}"]`).first().boundingBox();
  if (!box) return null;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function moveTo(page, target, durationMs = 600) {
  const start = { x: (await page.evaluate(() => window.__lastMouseX)) || viewport.width / 2, y: (await page.evaluate(() => window.__lastMouseY)) || viewport.height / 2 };
  const end = typeof target === 'string' ? await getCenter(page, target) : target;
  if (!end) return start;
  const steps = Math.max(12, Math.round(durationMs / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(start.x + (end.x - start.x) * t);
    const y = Math.round(start.y + (end.y - start.y) * t);
    await page.mouse.move(x, y);
    await sleep(durationMs / steps);
  }
  return end;
}

async function clickTarget(page, target) {
  const center = await moveTo(page, target, 400);
  await page.mouse.click(center.x, center.y);
  return center;
}

async function stageClick(page, stageId, delayMs) {
  await sleep(delayMs);
  await clickTarget(page, `stage-${stageId}`);
  beat(`click-${stageId}`);
}

try {
  const baseUrl = await detectServerUrl(server);
  console.log(`[record] Next.js ready at ${baseUrl}`);
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

  // Inject cursor tracker and hide the native cursor.
  await page.addInitScript(() => {
    window.__mouseEvents = [];
    window.__lastMouseX = window.innerWidth / 2;
    window.__lastMouseY = window.innerHeight / 2;

    const push = (type, x, y) => {
      const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
      window.__lastMouseX = x;
      window.__lastMouseY = y;
      window.__mouseEvents.push({ t: Math.round(t), type, x: Math.round(x), y: Math.round(y) });
    };

    document.addEventListener('mousemove', (e) => push('move', e.clientX, e.clientY), { passive: true });
    document.addEventListener('mousedown', (e) => push('down', e.clientX, e.clientY), { passive: true });
    document.addEventListener('mouseup', (e) => push('up', e.clientX, e.clientY), { passive: true });
    document.addEventListener('click', (e) => push('click', e.clientX, e.clientY), { passive: true });
  });

  beat('start');
  await page.goto(`${baseUrl}/run-v12?recording=1`, { waitUntil: 'load' });
  beat('loaded');

  // Ensure native cursor is hidden even if CSS loaded late.
  await page.addStyleTag({ content: '* { cursor: none !important; }' });

  // Initial position: center of screen.
  await page.mouse.move(viewport.width / 2, viewport.height / 2);

  // Stage choreography aligned to RECORDING_STAGE_DELAYS in the component.
  // Problem (0s) -> Proposal/Onboard (20s) -> Evaluate (50s) -> Fund (65s) -> Govern (80s) -> Decide (115s)
  const stagePlan = [
    { stage: 'proposal', at: 20_000 },
    { stage: 'evaluate', at: 50_000 },
    { stage: 'fund', at: 65_000 },
    { stage: 'govern', at: 80_000 },
    { stage: 'decide', at: 115_000 },
  ];

  // Pre-warm mouse to the stage nav before the first click.
  await moveTo(page, 'stage-nav', 800);
  await sleep(200);

  let lastActionTime = 0;
  for (const { stage, at } of stagePlan) {
    const wait = Math.max(0, at - (Date.now() - beats.start));
    await stageClick(page, stage, wait);
    lastActionTime = Date.now() - beats.start;

    // Hover a relevant metric/callout for a moment to guide the eye.
    if (stage === 'evaluate') {
      await moveTo(page, 'metric-budget', 500);
    } else if (stage === 'fund') {
      await moveTo(page, 'stripe-card', 500);
    } else if (stage === 'govern') {
      await moveTo(page, 'blocked-card', 500);
    } else if (stage === 'decide') {
      await moveTo(page, 'decision-verdict', 500);
      await moveTo(page, 'metric-next-cap', 500);
    }
  }

  // Hold until the total recording length is reached.
  const remaining = Math.max(0, TOTAL_RECORDING_SECONDS * 1000 - (Date.now() - beats.start));
  if (remaining > 0) {
    await sleep(remaining);
  }
  beat('ended');

  // Retrieve cursor events and make timestamps relative to navigation.
  const navTime = beats.loaded - beats.start;
  const rawEvents = await page.evaluate(() => window.__mouseEvents || []);
  const cursorEvents = rawEvents.map((e) => ({
    ...e,
    t: Math.max(0, Math.round(e.t - navTime)),
  })).sort((a, b) => a.t - b.t);

  await context.close();
  await browser.close();

  if (!video) throw new Error('Playwright did not create a video object.');

  const rawVideo = await video.path();
  const finalVideo = path.join(outDir, 'ui-v12.webm');
  await fs.copyFile(rawVideo, finalVideo);

  // Also copy into remotion/public so the render step can find it.
  const remotionPublic = path.resolve('remotion/public');
  await fs.mkdir(remotionPublic, { recursive: true });
  await fs.copyFile(rawVideo, path.join(remotionPublic, 'ui-v12.webm'));

  const timestampsPath = path.join(outDir, 'stage-timestamps-v12.json');
  await fs.writeFile(timestampsPath, JSON.stringify(beats, null, 2));

  const cursorPath = path.join(outDir, 'cursor-events-v12.json');
  await fs.writeFile(cursorPath, JSON.stringify({
    viewport,
    recordedAt: new Date().toISOString(),
    count: cursorEvents.length,
    events: cursorEvents,
  }, null, 2));
  await fs.copyFile(cursorPath, path.join(remotionPublic, 'cursor-events-v12.json'));

  console.log(`\nRecorded base video: ${finalVideo}`);
  console.log(`Cursor events:     ${cursorPath} (${cursorEvents.length} events)`);
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
