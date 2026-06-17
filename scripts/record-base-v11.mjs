import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.AGENT_IC_BASE_URL || 'http://localhost:3000';
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

  beat('start');
  await page.goto(`${baseUrl}/run-v11?recording=1`, { waitUntil: 'load' });
  beat('loaded');

  // Wait for the full staged recording to play out.
  await sleep(TOTAL_RECORDING_SECONDS * 1000);
  beat('ended');

  await context.close();
  await browser.close();

  if (!video) throw new Error('Playwright did not create a video object.');

  const rawVideo = await video.path();
  const finalVideo = path.join(outDir, 'ui-v11.webm');
  await fs.copyFile(rawVideo, finalVideo);

  // Also copy into remotion/public so the render step can find it.
  const remotionPublic = path.resolve('remotion/public');
  await fs.mkdir(remotionPublic, { recursive: true });
  await fs.copyFile(rawVideo, path.join(remotionPublic, 'ui-v11.webm'));

  const timestampsPath = path.join(outDir, 'stage-timestamps-v11.json');
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
