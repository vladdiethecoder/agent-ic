#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

async function loadEnvLocal() {
  try {
    const envPath = path.resolve('.env.local');
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

await loadEnvLocal();

const userBaseUrl = process.env.AGENT_IC_BASE_URL;
const outDir = path.resolve(process.env.AGENT_IC_DEMO_DIR || 'demo-out');
const rawDir = path.join(outDir, 'raw');
const viewport = { width: 1920, height: 1080 };

const TARGET_RECORDING_SECONDS = 125;
const MAX_RECORDING_SECONDS = 135;
const MIN_RECORDING_SECONDS = 100;

const STAGES = ['problem', 'proposal', 'evaluate', 'fund', 'govern', 'decide'];

const isLiveMode = Boolean(process.env.STRIPE_SECRET_KEY) && process.env.AGENT_IC_DEMO_MODE === 'false';

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
    const active = document.querySelector('.v14-stage-pill.active');
    return active?.getAttribute('data-testid')?.replace('stage-', '') || null;
  });
}

async function pollStagesUntilDecide(page, startTimeMs, maxDurationMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Stage polling timed out before Decide'));
    }, maxDurationMs);

    const interval = setInterval(async () => {
      const active = await getActiveStage(page).catch(() => null);
      if (active && STAGES.includes(active)) {
        beat('stage', active);
      }
      if (active === 'decide') {
        // Wait a short stabilization window, then stop.
        await sleep(800);
        clearInterval(interval);
        clearTimeout(timer);
        resolve();
      }
    }, 200);
  });
}

async function waitForLiveTrace(page, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = await page.evaluate(() => {
      const sidecar = document.querySelector('[data-testid="terminal-sidecar"]');
      return sidecar ? sidecar.textContent : '';
    });
    if (/"amount"\s*:\s*150/.test(text) && text.includes('403')) {
      beat('live-trace-403');
      return;
    }
    await sleep(300);
  }
  throw new Error('Live trace did not show blocked request/response within timeout');
}

async function getCenter(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
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

async function clickTarget(page, selector, { move = true, pauseMs = 300 } = {}) {
  const center = await getCenter(page, selector);
  if (!center) return false;
  if (move) await moveTo(page, center, 500);
  await page.mouse.click(center.x, center.y);
  await sleep(pauseMs);
  return true;
}

function execFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(err || `ffmpeg failed: ${args.join(' ')}`));
      else resolve(out.trim());
    });
  });
}

async function transcodeToStableFps(input, output, targetFps) {
  await execFfmpeg([
    '-y', '-i', input,
    '-r', String(targetFps),
    '-c:v', 'libvpx',
    '-b:v', '8M',
    '-pix_fmt', 'yuv420p',
    '-auto-alt-ref', '0',
    '-an',
    output,
  ]);
}

await fs.mkdir(rawDir, { recursive: true });

const workspaceRoot = process.cwd();
const serverEnv = {
  ...process.env,
  NEXT_PUBLIC_AGENT_IC_RECORDING: 'true',
  NEXT_PUBLIC_AGENT_IC_NO_AUTORUN: 'true',
  AGENT_IC_AUDIT_FILE: '.agent-ic/demo-audit-log.jsonl',
  AGENT_IC_SKILL_DIR: path.join(workspaceRoot, 'skills'),
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

  await page.goto(`${baseUrl}/run-v14?recording=1`, { waitUntil: 'load' });
  beat('loaded');

  await page.addStyleTag({ content: '* { cursor: none !important; }' });
  await page.mouse.move(viewport.width / 2, viewport.height / 2);

  // Wait for the primary CTA to be visible and enabled.
  await page.waitForSelector('[data-testid="run-capital-experiment"]', { state: 'visible', timeout: 15_000 });

  // Start stage polling immediately so we don't miss fast transitions.
  const stagePoller = pollStagesUntilDecide(page, beats.start, MAX_RECORDING_SECONDS * 1000);

  // 1. Click "Run capital experiment".
  await clickTarget(page, '[data-testid="run-capital-experiment"]', { move: true, pauseMs: 500 });
  beat('click-run');

  // 2. Click terminal toggle (Live trace tab) once the sidecar is visible.
  await page.waitForSelector('.v14-terminal-toggle', { state: 'visible', timeout: 15_000 });
  await clickTarget(page, '.v14-terminal-toggle', { move: true, pauseMs: 300 });
  beat('click-terminal');

  // 3. Optionally click a stage pill during the run (Evaluate or Govern).
  const stageClicker = (async () => {
    for (const stage of ['evaluate', 'govern']) {
      try {
        await page.waitForSelector(`[data-testid="stage-${stage}"].active`, { state: 'visible', timeout: 60_000 });
        await clickTarget(page, `[data-testid="stage-${stage}"]`, { move: true, pauseMs: 250 });
        beat('click-stage', stage);
      } catch (err) {
        console.warn(`[warn] could not click stage ${stage}: ${err.message}`);
      }
    }
  })();

  // Wait for the live-trace sidecar to show the blocked request/response pair.
  const liveTraceWaiter = waitForLiveTrace(page, 60_000).catch((err) => {
    console.warn(`[warn] ${err.message}`);
  });

  // Wait for the run to reach the Decide stage.
  await Promise.all([stagePoller, stageClicker, liveTraceWaiter]);

  // Hold until the target recording length, but never exceed the maximum.
  const elapsedAtDecide = Date.now() - beats.start;
  const hold = Math.max(0, Math.min(TARGET_RECORDING_SECONDS * 1000 - elapsedAtDecide, MAX_RECORDING_SECONDS * 1000 - elapsedAtDecide));
  if (hold > 0) {
    console.log(`[record] holding final frame for ${(hold / 1000).toFixed(1)}s`);
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
  const finalVideo = path.join(outDir, 'ui-v15.webm');
  const publicVideo = path.join(path.resolve('remotion/public'), 'ui-v15.webm');

  // Re-encode to a fixed frame rate to avoid 25→30 fps jitter / flicker in Remotion.
  console.log('[record] transcoding UI recording to 30 fps...');
  try {
    const tempTranscoded = path.join(rawDir, `ui-v15-30fps-${Date.now()}.webm`);
    await transcodeToStableFps(rawVideo, tempTranscoded, 30);
    await fs.copyFile(tempTranscoded, finalVideo);
    await fs.copyFile(tempTranscoded, publicVideo);
    await fs.unlink(tempTranscoded).catch(() => {});
  } catch (err) {
    console.warn(`[warn] transcode failed, using raw webm: ${err.message}`);
    await fs.copyFile(rawVideo, finalVideo);
    await fs.copyFile(rawVideo, publicVideo);
  }

  const remotionPublic = path.resolve('remotion/public');
  await fs.mkdir(remotionPublic, { recursive: true });

  const timestampsPath = path.join(outDir, 'stage-timestamps-v15.json');
  const timestampPayload = {
    videoStart: beats.loaded,
    ended: beats.ended,
    durationSeconds: (beats.ended - beats.start) / 1000,
    stages: STAGES.map((id) => ({
      id,
      ts: beats.stages[id] || null,
      msFromStart: beats.stages[id] ? beats.stages[id] - beats.start : null,
    })),
  };
  await fs.writeFile(timestampsPath, JSON.stringify(timestampPayload, null, 2));
  await fs.copyFile(timestampsPath, path.join(remotionPublic, 'stage-timestamps-v15.json'));

  const cursorPath = path.join(outDir, 'cursor-events-v15.json');
  await fs.writeFile(
    cursorPath,
    JSON.stringify(
      {
        viewport,
        recordedAt: new Date().toISOString(),
        mode: isLiveMode ? 'live' : 'deterministic fallback',
        count: cursorEvents.length,
        clicks: cursorEvents.filter((e) => e.type === 'click').length,
        events: cursorEvents,
      },
      null,
      2
    )
  );
  await fs.copyFile(cursorPath, path.join(remotionPublic, 'cursor-events-v15.json'));

  const totalSeconds = (beats.ended - beats.start) / 1000;
  console.log(`\nRecorded base video: ${finalVideo} (${totalSeconds.toFixed(1)}s)`);
  console.log(`Cursor events:     ${cursorPath} (${cursorEvents.length} events, ${cursorEvents.filter((e) => e.type === 'click').length} clicks)`);
  console.log(`Timestamps JSON:   ${timestampsPath}`);
  if (totalSeconds < MIN_RECORDING_SECONDS) {
    console.warn(`[warn] recording shorter than minimum ${MIN_RECORDING_SECONDS}s`);
  }
  console.log('Beats:');
  for (const [name, ts] of Object.entries(beats)) {
    if (name === 'stages') continue;
    console.log(`  ${name}: ${ts - beats.start}ms`);
  }
  console.log('Stages:');
  for (const s of timestampPayload.stages) {
    console.log(`  ${s.id}: ${s.msFromStart !== null ? s.msFromStart + 'ms' : 'not reached'}`);
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
