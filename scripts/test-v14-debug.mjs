import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const server = spawn(process.execPath, ['scripts/safe-next.mjs', 'dev'], {
  env: { ...process.env, NEXT_PUBLIC_AGENT_IC_NO_AUTORUN: 'true', AGENT_IC_AUDIT_FILE: '.agent-ic/demo-audit-log.jsonl' },
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function detectUrl(child) {
  const chunks = [];
  const localRe = /-\s*Local:\s+(http:\/\/\S+)/;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 60_000);
    const onData = (data) => {
      chunks.push(data);
      const text = Buffer.concat(chunks).toString('utf8');
      const m = text.match(localRe);
      if (m) { clearTimeout(timer); child.stdout.off('data', onData); resolve(m[1]); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => process.stderr.write(d));
  });
}

async function waitForServer(url) {
  for (let i = 0; i < 60; i++) {
    try { const res = await fetch(`${url}/api/health`); if (res.ok) return; } catch {}
    await sleep(500);
  }
  throw new Error('server not ready');
}

try {
  const baseUrl = await detectUrl(server);
  console.log('Server at', baseUrl);
  await waitForServer(baseUrl);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  await page.goto(`${baseUrl}/run-v14?recording=1`, { waitUntil: 'load' });
  await sleep(3000);
  const active = await page.evaluate(() => {
    const el = document.querySelector('.v14-stage-pill.active');
    return el ? el.getAttribute('data-testid') : 'none';
  });
  console.log('active stage:', active);
  const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('.v14-stage-pill')).map(b => b.getAttribute('data-testid')));
  console.log('stage buttons:', buttons);
  const runBtn = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="run-capital-experiment"]');
    return el ? { text: el.textContent, disabled: el.disabled, visible: el.offsetParent !== null } : 'none';
  });
  console.log('run button:', runBtn);
  await context.close();
  await browser.close();
} catch (e) {
  console.error(e);
} finally {
  try { if (server.pid) process.kill(-server.pid, 'SIGTERM'); } catch {}
  await sleep(1000);
  try { if (server.pid) process.kill(-server.pid, 'SIGKILL'); } catch {}
}
