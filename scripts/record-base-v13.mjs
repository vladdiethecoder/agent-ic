import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const userBaseUrl = process.env.AGENT_IC_BASE_URL;
const outDir = path.resolve(process.env.AGENT_IC_DEMO_DIR || 'demo-out');
const rawDir = path.join(outDir, 'raw');
const viewport = { width: 1920, height: 1080 };

const TARGET_RECORDING_SECONDS = 100;
const MAX_RECORDING_SECONDS = 110;
const MIN_RECORDING_SECONDS = 90;

const STAGES = ['problem', 'proposal', 'evaluate', 'fund', 'govern', 'decide'];
const TERMINAL_STAGES = new Set(['proposal', 'fund', 'govern']);

const isLiveMode = Boolean(process.env.STRIPE_SECRET_KEY) && process.env.AGENT_IC_DEMO_MODE === 'false';

const beats = {};
function beat(name) {
  if (beats[name]) return;
  beats[name] = Date.now();
  console.log(`[beat] ${name} @ ${beats[name] - beats.start}ms`);
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

async function getActiveStage(page) {
  return page.evaluate(() => {
    const active = document.querySelector('.v12-stage-pill.active');
    return active?.getAttribute('data-testid')?.replace('stage-', '') || null;
  });
}

async function waitForStage(page, stageId, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const active = await getActiveStage(page);
    if (active === stageId) {
      beat(`stage-${stageId}`);
      return;
    }
    await sleep(200);
  }
  throw new Error(`Stage ${stageId} did not become active within ${timeoutMs}ms`);
}

async function isTerminalOpen(page) {
  return page.evaluate(() => {
    const drawer = document.querySelector('[data-testid="terminal-drawer"]');
    return drawer?.classList.contains('open') || false;
  });
}

async function ensureTerminalOpen(page) {
  if (await isTerminalOpen(page)) return;
  const toggle = await page.locator('[data-testid="toggle-terminal"]').first().boundingBox();
  if (toggle) {
    await page.mouse.move(toggle.x + toggle.width / 2, toggle.y + toggle.height / 2);
    await page.mouse.click(toggle.x + toggle.width / 2, toggle.y + toggle.height / 2);
    await sleep(300);
  }
}

async function getCenter(page, testId) {
  const box = await page.locator(`[data-testid="${testId}"]`).first().boundingBox();
  if (!box) return null;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function moveTo(page, target, durationMs = 600) {
  const start = {
    x: (await page.evaluate(() => window.__lastMouseX)) || viewport.width / 2,
    y: (await page.evaluate(() => window.__lastMouseY)) || viewport.height / 2,
  };
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

await fs.mkdir(rawDir, { recursive: true });

const serverEnv = {
  ...process.env,
  NEXT_PUBLIC_AGENT_IC_RECORDING: 'true',
  AGENT_IC_AUDIT_FILE: '.agent-ic/demo-audit-log.jsonl',
};
// Demo mode is the safe default; live Stripe/Nemotron paths activate only when
// credentials are explicitly present and demo mode is disabled.
serverEnv.AGENT_IC_DEMO_MODE = isLiveMode ? 'false' : 'true';

console.log(`[record] mode: ${isLiveMode ? 'live' : 'deterministic fallback'}`);

const server = spawn(process.execPath, ['scripts/safe-next.mjs', 'dev'], {
  env: serverEnv,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let context;
let browser;

try {
  const baseUrl = await detectServerUrl(server);
  beat('start');
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

  await page.goto(`${baseUrl}/run-v12?recording=1`, { waitUntil: 'load' });
  beat('loaded');

  await page.addStyleTag({ content: '* { cursor: none !important; }' });
  await page.mouse.move(viewport.width / 2, viewport.height / 2);

  // Event-driven stage capture: wait for the UI to advance via SSE audit events
  // or its built-in fallback timers, recording each transition timestamp.
  for (const stage of STAGES) {
    const elapsed = Date.now() - beats.start;
    const remaining = MAX_RECORDING_SECONDS * 1000 - elapsed;
    if (remaining <= 0) break;

    await waitForStage(page, stage, remaining);

    if (TERMINAL_STAGES.has(stage)) {
      await ensureTerminalOpen(page);
    }

    // Subtle cursor cue toward the active stage pill.
    await moveTo(page, `stage-${stage}`, 400);
  }

  // Hold until the target recording length, but never exceed the maximum.
  const elapsedAtDecide = Date.now() - beats.start;
  const hold = Math.max(0, Math.min(TARGET_RECORDING_SECONDS * 1000 - elapsedAtDecide, MAX_RECORDING_SECONDS * 1000 - elapsedAtDecide));
  if (hold > 0) {
    await sleep(hold);
  }
  beat('ended');

  // Retrieve cursor events and make timestamps relative to navigation start.
  const navTime = beats.loaded - beats.start;
  const rawEvents = await page.evaluate(() => window.__mouseEvents || []);
  const cursorEvents = rawEvents
    .map((e) => ({ ...e, t: Math.max(0, Math.round(e.t - navTime)) }))
    .sort((a, b) => a.t - b.t);

  await context.close();
  await browser.close();

  if (!video) throw new Error('Playwright did not create a video object.');

  const rawVideo = await video.path();
  const finalVideo = path.join(outDir, 'ui-v13.webm');
  await fs.copyFile(rawVideo, finalVideo);

  const remotionPublic = path.resolve('remotion/public');
  await fs.mkdir(remotionPublic, { recursive: true });
  await fs.copyFile(rawVideo, path.join(remotionPublic, 'ui-v13.webm'));

  const timestampsPath = path.join(outDir, 'stage-timestamps-v13.json');
  await fs.writeFile(timestampsPath, JSON.stringify(beats, null, 2));
  await fs.copyFile(timestampsPath, path.join(remotionPublic, 'stage-timestamps-v13.json'));

  const cursorPath = path.join(outDir, 'cursor-events-v13.json');
  await fs.writeFile(
    cursorPath,
    JSON.stringify(
      {
        viewport,
        recordedAt: new Date().toISOString(),
        mode: isLiveMode ? 'live' : 'fallback',
        count: cursorEvents.length,
        events: cursorEvents,
      },
      null,
      2
    )
  );
  await fs.copyFile(cursorPath, path.join(remotionPublic, 'cursor-events-v13.json'));

  const totalSeconds = (beats.ended - beats.start) / 1000;
  console.log(`\nRecorded base video: ${finalVideo} (${totalSeconds.toFixed(1)}s)`);
  console.log(`Cursor events:     ${cursorPath} (${cursorEvents.length} events)`);
  console.log(`Timestamps JSON:   ${timestampsPath}`);
  if (totalSeconds < MIN_RECORDING_SECONDS) {
    console.warn(`[warn] recording shorter than minimum ${MIN_RECORDING_SECONDS}s`);
  }
  console.log('Beats:');
  for (const [name, ts] of Object.entries(beats)) {
    console.log(`  ${name}: ${ts - beats.start}ms`);
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
