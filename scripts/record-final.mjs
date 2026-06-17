#!/usr/bin/env node
/**
 * Record the final Agent IC demo base UI.
 *
 * 1. Exports the v8 orchestration payload to remotion/src/payload-final.json.
 * 2. Starts the dev server in demo/recording mode.
 * 3. Captures /run?recording=1 with Playwright at 1920x1080/30 fps.
 * 4. Writes remotion/public/ui-final.webm and remotion/stage-timestamps-final.json.
 */

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { POST as runPost } from '../app/api/run-capital-experiment-v8/route.js';

const baseUrl = process.env.AGENT_IC_BASE_URL || 'http://127.0.0.1:3000';
const outDir = path.resolve(process.env.AGENT_IC_DEMO_DIR || 'remotion/public');
const viewport = { width: 1920, height: 1080 };
const FPS = 30;
const STAGE_TIMEOUT = 60_000;

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

async function exportPayload() {
  const response = await runPost(
    new Request('http://localhost:3000/api/run-capital-experiment-v8', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposalId: 'atlas-freight-rma-copilot' }),
    })
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('Failed to export payload', err);
    return false;
  }
  const payload = await response.json();
  const payloadPath = path.resolve('remotion/src/payload-final.json');
  await fs.writeFile(payloadPath, JSON.stringify(payload, null, 2));
  console.log(`Exported ${payloadPath}`);
  return true;
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

const stageIds = [
  'mission',
  'governance',
  'envelope',
  'timeline',
  'blocked',
  'evidence',
  'decision',
  'receipts',
  'audit',
];

async function cleanup() {
  try {
    server.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!server.killed) server.kill('SIGKILL');
  } catch {
    // ignore cleanup errors
  }
}

let context;
let browser;

try {
  await waitForServer(`${baseUrl}/api/health`);

  await exportPayload();

  await fetch(`${baseUrl}/api/audit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'reset',
      confirmReset: 'AGENT_IC_DEMO_RESET',
    }),
  }).catch(() => {});

  browser = await chromium.launch({
    headless: true,
    args: ['--force-color-profile=srgb'],
  });

  context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    recordVideo: {
      dir: outDir,
      size: viewport,
    },
  });

  const page = await context.newPage();
  const video = page.video();

  await page.goto(`${baseUrl}/run?recording=1`, { waitUntil: 'load' });

  // Wait for the console to render and the first mission stage to become active.
  await page.locator('section.run-stage[data-stage="mission"].active').waitFor({ timeout: 30_000 });

  const videoStart = Date.now();
  const timestamps = [];

  for (const stageId of stageIds) {
    const locator = page.locator(`section.run-stage[data-stage="${stageId}"].active`);
    await locator.waitFor({ timeout: STAGE_TIMEOUT });
    const ts = Date.now();
    timestamps.push({ id: stageId, frame: Math.round((ts - videoStart) * FPS / 1000), ts });
    // Hold on each stage for a moment so the composition can anchor captions.
    await sleep(stageId === 'audit' ? 4000 : 2500);
  }

  // Counterfactual proof: expose the slider, lower QA threshold, and rerun.
  const counterButton = page.getByTestId('run-counterfactual');
  await counterButton.waitFor({ timeout: 15_000 });
  const slider = page.locator('input[type="range"]').first();
  await slider.fill('82');
  await sleep(500);
  await counterButton.click({ timeout: 15_000 });

  const killLocator = page.locator('section.run-stage[data-stage="decision"] .verdict.kill');
  await killLocator.waitFor({ timeout: STAGE_TIMEOUT });
  const counterTs = Date.now();
  timestamps.push({ id: 'counterfactual', frame: Math.round((counterTs - videoStart) * FPS / 1000), ts: counterTs });
  await sleep(5000);

  await context.close();
  await browser.close();
  context = null;
  browser = null;

  if (!video) throw new Error('Playwright did not create a video object.');

  const rawVideo = await video.path();
  const finalRawVideo = path.join(outDir, 'ui-final.webm');
  await fs.copyFile(rawVideo, finalRawVideo);

  const timestampsPath = path.join(outDir, '..', 'stage-timestamps-final.json');
  await fs.writeFile(timestampsPath, JSON.stringify({ stages: timestamps, fps: FPS, videoStart }, null, 2));

  console.log(`Recorded ${finalRawVideo}`);
  console.log(`Wrote ${timestampsPath}`);
} catch (error) {
  console.error('Recording failed:', error);
  try {
    if (context) await context.close();
    if (browser) await browser.close();
  } catch {
    // ignore cleanup errors
  }
  process.exitCode = 1;
} finally {
  await cleanup();
}
