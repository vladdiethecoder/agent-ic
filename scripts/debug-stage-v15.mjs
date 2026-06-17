#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const viewport = { width: 1920, height: 1080 };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function detectServerUrl(child, timeoutMs = 90_000) {
  const chunks = [];
  const localRe = /-\s*Local:\s+(http:\/\/\S+)/;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for Next.js local URL`));
    }, timeoutMs);

    const onData = (data) => {
      chunks.push(data);
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
  });
}

const server = spawn(process.execPath, ['scripts/safe-next.mjs', 'dev'], {
  env: { ...process.env, NEXT_PUBLIC_AGENT_IC_NO_AUTORUN: 'true' },
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  const baseUrl = await detectServerUrl(server);
  console.log(`Server ready at ${baseUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('console', (msg) => console.log('[browser]', msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message, err.stack));
  page.on('requestfailed', (req) => console.log('[requestfailed]', req.url(), req.failure()?.errorText));

  await page.goto(`${baseUrl}/run-v14?recording=1`, { waitUntil: 'load' });
  console.log('Page loaded');

  // Click run
  await page.waitForSelector('[data-testid="run-capital-experiment"]', { state: 'visible', timeout: 15_000 });
  await page.click('[data-testid="run-capital-experiment"]');
  console.log('Clicked run');

  // Log active stage every second for 60s
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const active = await page.evaluate(() => {
      const el = document.querySelector('.v14-stage-pill.active');
      return el?.getAttribute('data-testid')?.replace('stage-', '') || null;
    });
    const ts = (i + 1).toString().padStart(2, '0');
    console.log(`t=${ts}s active=${active}`);
  }

  await browser.close();
} catch (err) {
  console.error('Debug failed:', err);
} finally {
  try {
    if (server && server.pid) process.kill(-server.pid, 'SIGTERM');
  } catch {}
  await sleep(2000);
  try {
    if (server && server.pid && server.exitCode === null) process.kill(-server.pid, 'SIGKILL');
  } catch {}
}
