#!/usr/bin/env node
/**
 * Terminal capture pipeline for Agent IC v11.
 *
 * Detects installed CLI tools and either records real command output or renders
 * deterministic fallback terminal sessions. Every session is exported as a
 * 1920x1080 WebM clip to demo-out/terminals-v11/ and copied into
 * remotion/public/terminals-v11/ for the Remotion composition.
 *
 * Exit code is always 0 in normal operation, even when every tool is missing.
 * Real commands run only when the tool is installed AND an explicit enablement
 * environment variable is set; otherwise the deterministic fallback is used.
 *
 * Real-credential rules:
 * - Secrets are read from process.env only.
 * - Rendered command lines show environment-variable references, never raw keys.
 * - Command output is redacted before it is written to the video frame or logs.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdir, rm, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));

const OUT_DIR = resolve('demo-out/terminals-v11');
const REMOTION_PUBLIC_DIR = resolve('remotion/public/terminals-v11');
const VIEWPORT = { width: 1920, height: 1080 };

// Secrets whose literal values must never appear in a rendered frame or log.
const SECRET_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEMOTRON_API_KEY',
  'HERMES_AGENT_TOKEN',
];

const REDACT_PATTERNS = [
  /sk_(live|test)_[A-Za-z0-9]{24,}/g,
  /pk_(live|test)_[A-Za-z0-9]{24,}/g,
  /whsec_[A-Za-z0-9]{24,}/g,
  /nvapi-[A-Za-z0-9_-]{20,}/g,
  /Bearer\s+[A-Za-z0-9_.-]{20,}/g,
];

// -----------------------------------------------------------------------------
// Utility helpers
// -----------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function commandExists(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${name}`], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0 && Boolean(result.stdout.trim());
}

function redactOutput(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const key of SECRET_KEYS) {
    const value = process.env[key];
    if (!value) continue;
    // Escape regex-special characters in the secret value.
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'g'), '[REDACTED]');
  }
  for (const pattern of REDACT_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

function maskCommand(cmd) {
  // Replace literal secret values that may have leaked into the display string.
  let out = cmd;
  for (const key of SECRET_KEYS) {
    const value = process.env[key];
    if (!value) continue;
    out = out.split(value).join(`\${${key}}`);
  }
  return out;
}

async function runShellCommand(command, { env = {}, timeoutMs = 20_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], {
      env: {
        ...process.env,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        TERM: 'dumb',
        CI: '1',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    const chunks = [];
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));

    let settled = false;
    const finish = (code, timedOut = false) => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      resolve({
        ok: code === 0 && !timedOut,
        timedOut,
        exitCode: code,
        output: redactOutput(raw),
      });
    };

    child.on('exit', (code) => finish(code ?? -1, false));
    child.on('error', () => finish(-1, false));
    child.on('timeout', () => {
      child.kill('SIGKILL');
      finish(-1, true);
    });
  });
}

// -----------------------------------------------------------------------------
// Fallback script parser
// -----------------------------------------------------------------------------

async function parseFallbackScript(filePath) {
  const text = await readFile(filePath, 'utf8');
  const segments = [];
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    if (line.startsWith('$ ')) {
      segments.push({ type: 'command', text: line.slice(2) });
    } else if (line.startsWith('# ')) {
      segments.push({ type: 'output', text: line, class: 'comment-line' });
    } else if (line.trim() === '') {
      segments.push({ type: 'blank' });
    } else {
      segments.push({ type: 'output', text: line });
    }
  }

  return segments;
}

// -----------------------------------------------------------------------------
// Playwright terminal renderer
// -----------------------------------------------------------------------------

function buildRendererHtml(title, badgeLabel, badgeClass) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: ${VIEWPORT.width}px;
      height: ${VIEWPORT.height}px;
      background: #0b0d10;
      font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', Menlo, Consolas, 'Liberation Mono', monospace;
      overflow: hidden;
    }
    .scene {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 60px;
    }
    .terminal-window {
      width: 1800px;
      height: 960px;
      background: #0d1117;
      border-radius: 16px;
      border: 1px solid #30363d;
      box-shadow: 0 24px 80px rgba(0,0,0,0.55);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .terminal-header {
      height: 52px;
      background: #161b22;
      border-bottom: 1px solid #30363d;
      display: flex;
      align-items: center;
      padding: 0 20px;
      flex-shrink: 0;
    }
    .window-controls {
      display: flex;
      gap: 10px;
      width: 180px;
    }
    .dot { width: 14px; height: 14px; border-radius: 50%; }
    .dot-red { background: #ff5f56; }
    .dot-yellow { background: #ffbd2e; }
    .dot-green { background: #27c93f; }
    .window-title {
      flex: 1;
      text-align: center;
      color: #8b949e;
      font-size: 16px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .badge {
      width: 180px;
      text-align: right;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .badge span {
      padding: 5px 10px;
      border-radius: 6px;
    }
    .badge-simulated span { background: #7d4e00; color: #ffdf5d; }
    .badge-live span { background: #1f6feb; color: #ffffff; }
    .terminal-body {
      flex: 1;
      padding: 24px 28px;
      overflow-y: auto;
      overflow-x: hidden;
      font-size: 23px;
      line-height: 32px;
      color: #c9d1d9;
    }
    .command-line { margin-bottom: 2px; }
    .prompt {
      color: #3fb950;
      font-weight: 700;
      margin-right: 10px;
      user-select: none;
    }
    .command-text {
      color: #79c0ff;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .output-line {
      white-space: pre-wrap;
      word-break: break-word;
      margin-bottom: 2px;
    }
    .comment-line { color: #8b949e; }
    .error-line { color: #f85149; }
    .cursor {
      display: inline-block;
      width: 11px;
      height: 24px;
      background: #58a6ff;
      vertical-align: middle;
      margin-left: 2px;
      animation: blink 1s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }
    ::-webkit-scrollbar { width: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 5px; }
  </style>
</head>
<body>
  <div class="scene">
    <div class="terminal-window">
      <div class="terminal-header">
        <div class="window-controls">
          <div class="dot dot-red"></div>
          <div class="dot dot-yellow"></div>
          <div class="dot dot-green"></div>
        </div>
        <div class="window-title">${escapeHtml(title)}</div>
        <div class="badge ${badgeClass}"><span>${escapeHtml(badgeLabel)}</span></div>
      </div>
      <div class="terminal-body" id="terminal-body"></div>
    </div>
  </div>
  <script>
    function escapeHtml(text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    window.runTerminal = async function(segments, config) {
      const body = document.getElementById('terminal-body');
      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      window.terminalFinished = false;

      function addLine(className) {
        const line = document.createElement('div');
        line.className = className || 'output-line';
        body.appendChild(line);
        return line;
      }

      function scroll() {
        body.scrollTop = body.scrollHeight;
      }

      function wait(ms) {
        return new Promise((r) => setTimeout(r, ms));
      }

      for (const seg of segments) {
        if (seg.type === 'command') {
          const line = addLine('command-line');
          const prompt = document.createElement('span');
          prompt.className = 'prompt';
          prompt.textContent = '$ ';
          line.appendChild(prompt);
          const textSpan = document.createElement('span');
          textSpan.className = 'command-text';
          line.appendChild(textSpan);
          line.appendChild(cursor);
          scroll();

          for (let i = 0; i < seg.text.length; i++) {
            textSpan.textContent += seg.text[i];
            scroll();
            await wait(config.charDelay);
          }
          await wait(config.enterDelay);
          cursor.remove();
          scroll();
        } else if (seg.type === 'output') {
          const line = addLine(seg.class || 'output-line');
          line.textContent = seg.text;
          scroll();
          await wait(config.lineDelay);
        } else if (seg.type === 'blank') {
          const line = addLine('output-line');
          line.innerHTML = '&nbsp;';
          scroll();
          await wait(config.lineDelay);
        } else if (seg.type === 'wait') {
          await wait(seg.ms);
        }
      }

      const last = addLine('output-line');
      last.appendChild(cursor);
      scroll();
      window.terminalFinished = true;
    };
  </script>
</body>
</html>`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function renderTerminalClip({
  sessionId,
  title,
  badgeLabel,
  badgeClass,
  segments,
  outFile,
}) {
  const videoDir = join(tmpdir(), `agent-ic-terminal-v11-${sessionId}-${Date.now()}`);
  await mkdir(videoDir, { recursive: true });

  let browser;
  let context;
  try {
    browser = await chromium.launch({ headless: true, args: ['--hide-scrollbars'] });
    context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      recordVideo: { dir: videoDir, size: VIEWPORT },
    });

    const page = await context.newPage();
    const html = buildRendererHtml(title, badgeLabel, badgeClass);
    await page.setContent(html, { waitUntil: 'load' });

    // Keep animation deterministic: fixed typing and reveal timings.
    const config = {
      charDelay: 18,
      enterDelay: 450,
      lineDelay: 45,
    };

    await page.evaluate(({ segs, cfg }) => window.runTerminal(segs, cfg), { segs: segments, cfg: config });

    // Wait for the in-page animation to finish.
    const start = Date.now();
    while (Date.now() - start < 120_000) {
      const finished = await page.evaluate(() => window.terminalFinished === true);
      if (finished) break;
      await sleep(200);
    }

    // Hold the final frame briefly so the last line is readable.
    await sleep(900);

    await context.close();
    await browser.close();

    const video = page.video();
    if (!video) throw new Error('Playwright did not create a video object.');

    const rawPath = await video.path();
    await mkdir(dirname(outFile), { recursive: true });
    await copyFile(rawPath, outFile);

    // Cleanup temporary video directory.
    await rm(videoDir, { recursive: true, force: true }).catch(() => {});
  } catch (err) {
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
    await rm(videoDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Session definitions
// -----------------------------------------------------------------------------

const SESSIONS = [
  {
    id: 'nemoclaw-onboard',
    title: 'nemohermes onboard — atlas-freight-sandbox',
    fallbackFile: 'nemoclaw-onboard.txt',
    async isRealAvailable() {
      return commandExists('nemohermes') && Boolean(process.env.CAPTURE_REAL_NEMOCLAW);
    },
    async buildRealSegments() {
      const args = process.env.NEMOCLAW_ONBOARD_ARGS || '--provider hermes --sandbox-name atlas-freight-sandbox --yes';
      const displayCmd = `NEMOCLAW_AGENT=hermes nemohermes onboard ${args}`;
      const { output, ok, timedOut } = await runShellCommand(displayCmd);
      const segments = [{ type: 'command', text: maskCommand(displayCmd) }];
      for (const line of output.split(/\n/)) {
        segments.push({ type: 'output', text: line });
      }
      if (timedOut) segments.push({ type: 'output', text: '[timed out — switching to fallback]', class: 'error-line' });
      return { segments, ok };
    },
  },
  {
    id: 'hermes-dispatch',
    title: 'Hermes dispatch — agent-ic-evaluate',
    fallbackFile: 'hermes-dispatch.txt',
    async isRealAvailable() {
      const hasUrl = Boolean(process.env.HERMES_AGENT_URL || process.env.HERMES_GATEWAY_URL || process.env.HERMES_WEBHOOK_URL);
      return (commandExists('hermes-agent') || hasUrl) && Boolean(process.env.CAPTURE_REAL_HERMES);
    },
    async buildRealSegments() {
      const url = process.env.HERMES_AGENT_URL || process.env.HERMES_GATEWAY_URL || process.env.HERMES_WEBHOOK_URL || 'http://localhost:8080/webhooks/agent-ic-evaluate';
      const payload = JSON.stringify({ proposalId: 'atlas-freight-rma-copilot' });
      const displayCmd = `curl -sS -X POST "${url}" -H "Content-Type: application/json" -H "Authorization: Bearer \${HERMES_AGENT_TOKEN}" -d '${payload}'`;
      const { output, ok, timedOut } = await runShellCommand(displayCmd);
      const segments = [{ type: 'command', text: maskCommand(displayCmd) }];
      for (const line of output.split(/\n/)) {
        segments.push({ type: 'output', text: line });
      }
      if (timedOut) segments.push({ type: 'output', text: '[timed out — switching to fallback]', class: 'error-line' });
      return { segments, ok };
    },
  },
  {
    id: 'mpp-payment',
    title: 'mppx — 402 probe + payment',
    fallbackFile: 'mpp-payment.txt',
    async isRealAvailable() {
      return commandExists('mppx') && Boolean(process.env.CAPTURE_REAL_MPP);
    },
    async buildRealSegments() {
      const payUrl = process.env.MPPX_PAY_URL || 'http://localhost:3000/api/run-capital-experiment';
      const probeCmd = `mppx probe ${payUrl}`;
      const payCmd = `mppx pay --amount 35000 --currency USD --reason "Atlas Freight autonomous RMA pilot" --test-mode`;
      const segments = [];

      segments.push({ type: 'command', text: maskCommand(probeCmd) });
      const probe = await runShellCommand(probeCmd);
      for (const line of probe.output.split(/\n/)) segments.push({ type: 'output', text: line });
      if (probe.timedOut) segments.push({ type: 'output', text: '[timed out]', class: 'error-line' });

      segments.push({ type: 'command', text: maskCommand(payCmd) });
      const pay = await runShellCommand(payCmd);
      for (const line of pay.output.split(/\n/)) segments.push({ type: 'output', text: line });
      if (pay.timedOut) segments.push({ type: 'output', text: '[timed out]', class: 'error-line' });

      return { segments, ok: probe.ok && pay.ok };
    },
  },
  {
    id: 'stripe-link-spend',
    title: 'link-cli — Stripe Link spend request',
    fallbackFile: 'stripe-link-spend.txt',
    async isRealAvailable() {
      return commandExists('link-cli') && Boolean(process.env.CAPTURE_REAL_STRIPE_LINK);
    },
    async buildRealSegments() {
      const authCmd = 'link-cli auth login';
      const spendCmd = 'link-cli spend-request create --amount 35000 --currency usd --reason "Atlas Freight autonomous RMA pilot" --project atlas-freight';
      const segments = [];

      segments.push({ type: 'command', text: maskCommand(authCmd) });
      const auth = await runShellCommand(authCmd, { timeoutMs: 15_000 });
      for (const line of auth.output.split(/\n/)) segments.push({ type: 'output', text: line });
      if (auth.timedOut) segments.push({ type: 'output', text: '[timed out — using test mode]', class: 'error-line' });

      segments.push({ type: 'command', text: maskCommand(spendCmd) });
      const spend = await runShellCommand(spendCmd);
      for (const line of spend.output.split(/\n/)) segments.push({ type: 'output', text: line });
      if (spend.timedOut) segments.push({ type: 'output', text: '[timed out]', class: 'error-line' });

      return { segments, ok: auth.ok && spend.ok };
    },
  },
  {
    id: 'stripe-projects-provision',
    title: 'stripe projects — add neon/postgres',
    fallbackFile: 'stripe-projects-provision.txt',
    async isRealAvailable() {
      return commandExists('stripe') && Boolean(process.env.CAPTURE_REAL_STRIPE);
    },
    async buildRealSegments() {
      // Use --dry-run when available to avoid provisioning real resources.
      const cmd = 'stripe projects add neon/postgres --name atlas-freight-db --description "Postgres for Atlas Freight pilot" --dry-run';
      const { output, ok, timedOut } = await runShellCommand(cmd);
      const segments = [{ type: 'command', text: maskCommand(cmd) }];
      for (const line of output.split(/\n/)) segments.push({ type: 'output', text: line });
      if (timedOut) segments.push({ type: 'output', text: '[timed out]', class: 'error-line' });
      return { segments, ok };
    },
  },
  {
    id: 'blocked-tool-403',
    title: 'NemoClaw policy gate — blocked tool call',
    fallbackFile: 'blocked-tool-403.txt',
    async isRealAvailable() {
      const proxy = process.env.NEMOCLAW_PROXY_URL || process.env.OPENSHELL_COMMAND || process.env.NEMOCLAW_POLICY_MODE;
      return commandExists('curl') && Boolean(proxy) && Boolean(process.env.CAPTURE_REAL_BLOCKED);
    },
    async buildRealSegments() {
      const proxy = process.env.NEMOCLAW_PROXY_URL || process.env.OPENSHELL_COMMAND || process.env.NEMOCLAW_POLICY_MODE || 'http://localhost:9000';
      const payload = JSON.stringify({
        targetUri: 'https://unapproved-vendor.example/api/charge',
        method: 'POST',
        amount: 50000,
        proposalId: 'atlas-freight-rma-copilot',
      });
      const displayCmd = `curl -sS -X POST "${proxy.replace(/\/$/, '')}/v1/gate" -H "Content-Type: application/json" -d '${payload}'`;
      const { output, ok, timedOut } = await runShellCommand(displayCmd);
      const segments = [{ type: 'command', text: maskCommand(displayCmd) }];
      for (const line of output.split(/\n/)) segments.push({ type: 'output', text: line });
      if (timedOut) segments.push({ type: 'output', text: '[timed out]', class: 'error-line' });
      return { segments, ok };
    },
  },
];

// -----------------------------------------------------------------------------
// Main pipeline
// -----------------------------------------------------------------------------

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(REMOTION_PUBLIC_DIR, { recursive: true });

  const summary = [];

  for (const session of SESSIONS) {
    const outFile = join(OUT_DIR, `${session.id}.webm`);
    const remotionFile = join(REMOTION_PUBLIC_DIR, `${session.id}.webm`);
    let mode = 'simulated';
    let segments = null;

    try {
      const realAvailable = await session.isRealAvailable();
      if (realAvailable) {
        const real = await session.buildRealSegments();
        if (real.ok && real.segments.length > 1) {
          segments = real.segments;
          mode = 'live';
        } else {
          console.log(`[${session.id}] real command failed or produced no output; using fallback`);
        }
      }
    } catch (err) {
      console.log(`[${session.id}] real capture error: ${err.message}; using fallback`);
    }

    if (!segments) {
      const fallbackPath = join(__dirname, 'terminals-v11', session.fallbackFile);
      segments = await parseFallbackScript(fallbackPath);
      mode = 'simulated';
    }

    try {
      await renderTerminalClip({
        sessionId: session.id,
        title: session.title,
        badgeLabel: mode === 'live' ? 'Live capture' : 'Simulated',
        badgeClass: mode === 'live' ? 'badge-live' : 'badge-simulated',
        segments,
        outFile,
      });
      await copyFile(outFile, remotionFile);
      summary.push({ id: session.id, mode, outFile, remotionFile });
      console.log(`[${session.id}] ${mode} => ${outFile}`);
    } catch (err) {
      console.error(`[${session.id}] render failed: ${err.message}`);
      summary.push({ id: session.id, mode: 'failed', error: err.message });
    }
  }

  console.log('\nTerminal capture summary:');
  for (const row of summary) {
    if (row.mode === 'failed') {
      console.log(`  ${row.id}: FAILED — ${row.error}`);
    } else {
      console.log(`  ${row.id}: ${row.mode.toUpperCase()} — ${row.outFile}`);
    }
  }

  const allOk = summary.every((r) => r.mode !== 'failed');
  if (!allOk) {
    console.warn('\nOne or more terminal clips failed to render, but pipeline continues.');
  }
}

main().catch((err) => {
  console.error('Terminal capture pipeline encountered an error:', err);
  // The spec requires exit 0 even when every tool is missing.
  process.exit(0);
});
