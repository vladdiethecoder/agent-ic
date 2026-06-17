import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.AGENT_IC_BASE_URL || 'http://127.0.0.1:3000';
const outDir = path.resolve(process.env.AGENT_IC_DEMO_DIR || 'remotion/public');
const viewport = { width: 1920, height: 1080 };

await fs.mkdir(outDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not ready yet
    }
    await sleep(1000);
  }
  throw new Error(`Server did not become ready: ${url}`);
}

const originalSkillDir = path.resolve('skills');

const server = spawn('npm', ['run', 'dev'], {
  env: {
    ...process.env,
    AGENT_IC_DEMO_MODE: 'true',
    NEXT_PUBLIC_AGENT_IC_RECORDING: 'true',
    AGENT_IC_SKILL_DIR: originalSkillDir,
  },
  stdio: 'inherit',
  shell: true,
});

try {
  await waitForServer(`${baseUrl}/api/health`);

  // Reset audit log so every recording starts cleanly
  await fetch(`${baseUrl}/api/audit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'reset',
      confirmReset: 'AGENT_IC_DEMO_RESET',
    }),
  }).catch(() => {});

  const browser = await chromium.launch({
    headless: true,
    args: ['--force-color-profile=srgb'],
  });

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: {
      dir: outDir,
      size: viewport,
    },
  });

  const page = await context.newPage();
  const video = page.video();

  async function pause(ms) {
    await page.waitForTimeout(ms);
  }

  async function waitForStage(stageId, timeout = 60_000) {
    await page.locator(`[data-stage="${stageId}"]`).waitFor({ timeout });
  }

  await page.goto(`${baseUrl}/?recording=1`, { waitUntil: 'networkidle' });

  // 0:00–0:08 — Hero / pre-run state
  await pause(8000);

  // 0:08–0:56 — Run the capital experiment through all six stages
  await page.getByTestId('run-capital-experiment').click({ timeout: 15_000 });
  await waitForStage('mission');
  await pause(5000);
  await waitForStage('envelope');
  await pause(5000);
  await waitForStage('stripe');
  await pause(5000);
  await waitForStage('blocked');
  await pause(5000);
  await waitForStage('evidence');
  await pause(5000);
  await waitForStage('decision');
  await pause(7000);

  // 0:56–1:04 — Counterfactual proof: lower QA agreement and rerun
  await page.locator('input[type="range"]').first().fill('82');
  await pause(500);
  await page.getByTestId('run-capital-experiment').click({ timeout: 15_000 });
  await waitForStage('decision');
  await pause(6000);

  await context.close();
  await browser.close();

  if (!video) throw new Error('Playwright did not create a video object.');

  const rawVideo = await video.path();
  const finalRawVideo = path.join(outDir, 'ui.webm');
  await fs.copyFile(rawVideo, finalRawVideo);

  console.log(`Recorded ${finalRawVideo}`);
} finally {
  try {
    server.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!server.killed) server.kill('SIGKILL');
  } catch {
    // ignore cleanup errors
  }
}
