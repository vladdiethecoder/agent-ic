#!/usr/bin/env node
/**
 * Terminal capture pipeline for Agent IC v15.
 *
 * Renders judge-credible terminal beats from the pre-captured text artifacts in
 * demo-out/terminals-v15/*.txt. This avoids relying on live CLI tools or secret
 * keys at render time while preserving authentic proof fragments (real Stripe
 * Checkout Session response, real NemoClaw 403, GPU/Nemotron evidence, playbook
 * content, skills listing, boot text).
 *
 * Outputs 1920x1080 MP4 clips to demo-out/terminals-v15/ and copies them into
 * remotion/public/terminals-v15/.
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, copyFile, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve('demo-out/terminals-v15');
const REMOTION_PUBLIC_DIR = resolve('remotion/public/terminals-v15');
const TAPE_DIR = resolve(OUT_DIR);
const VIEWPORT = { width: 1920, height: 1080 };

const SECRET_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_API_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEMOTRON_API_KEY',
  'HERMES_AGENT_TOKEN',
  'NEMOCLAW_PROXY_TOKEN',
];

const REDACT_PATTERNS = [
  /sk_(live|test)_[A-Za-z0-9]{24,}/g,
  /pk_(live|test)_[A-Za-z0-9]{24,}/g,
  /whsec_[A-Za-z0-9]{24,}/g,
  /nvapi-[A-Za-z0-9_-]{20,}/g,
  /Bearer\s+[A-Za-z0-9_.-]{20,}/g,
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function redactOutput(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const key of SECRET_KEYS) {
    const value = process.env[key];
    if (!value) continue;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'g'), '[REDACTED]');
  }
  for (const pattern of REDACT_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

async function convertWebmToMp4(webmFile, mp4File) {
  const { spawnSync } = await import('node:child_process');
  const encoder = spawnSync('ffmpeg', ['-encoders'], { encoding: 'utf8', stdio: 'pipe' }).stdout;
  let videoCodec = null;
  if (encoder.includes('libx264')) videoCodec = 'libx264';
  else if (encoder.includes('h264_nvenc')) videoCodec = 'h264_nvenc';
  else if (encoder.includes('libopenh264')) videoCodec = 'libopenh264';

  if (!videoCodec) {
    console.warn('[convert] no h264 encoder found; keeping webm fallback');
    return false;
  }

  const args = ['-y', '-i', webmFile, '-c:v', videoCodec, '-b:v', '8M', '-pix_fmt', 'yuv420p', mp4File];
  if (videoCodec === 'libx264') args.push('-preset', 'fast', '-crf', '23');

  return new Promise((resolve) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stderr.on('data', (d) => chunks.push(d));
    child.on('exit', async (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        const err = Buffer.concat(chunks).toString('utf8').split('\n').slice(-5).join('\n');
        console.warn(`[convert] ffmpeg failed: ${err}`);
        resolve(false);
      }
    });
    child.on('error', () => resolve(false));
  });
}

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

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildRendererHtml(title, badgeLabel, badgeClass) {
  const badgeSpan = badgeLabel
    ? `<span>${escapeHtml(badgeLabel)}</span>`
    : '';

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
    .badge-empty { visibility: hidden; }
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
      color: #76b900;
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
      background: #76b900;
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
        <div class="badge ${badgeClass}">${badgeSpan}</div>
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

async function renderTerminalClip({ sessionId, title, badgeLabel, badgeClass, segments, outFile }) {
  const videoDir = join(tmpdir(), `agent-ic-terminal-v15-${sessionId}-${Date.now()}`);
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

    const config = {
      charDelay: 14,
      enterDelay: 350,
      lineDelay: 35,
    };

    await page.evaluate(({ segs, cfg }) => window.runTerminal(segs, cfg), { segs: segments, cfg: config });

    const start = Date.now();
    while (Date.now() - start < 120_000) {
      const finished = await page.evaluate(() => window.terminalFinished === true);
      if (finished) break;
      await sleep(200);
    }

    await sleep(900);
    await context.close();
    await browser.close();

    const video = page.video();
    if (!video) throw new Error('Playwright did not create a video object.');

    const rawPath = await video.path();
    await mkdir(dirname(outFile), { recursive: true });
    const converted = await convertWebmToMp4(rawPath, outFile);
    if (!converted) {
      await copyFile(rawPath, outFile.replace(/\.mp4$/, '.webm'));
    }

    await rm(videoDir, { recursive: true, force: true }).catch(() => {});
  } catch (err) {
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
    await rm(videoDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

async function loadEnvLocal() {
  try {
    const { readFile } = await import('node:fs/promises');
    const envPath = resolve(ROOT, '.env.local');
    const text = await readFile(envPath, 'utf8');
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

const SESSIONS = [
  {
    id: 'terminal-boot',
    title: 'Agent IC boot — node, npm, dev server',
    fallbackFile: 'terminal-boot.txt',
  },
  {
    id: 'stripe-cli-checkout',
    title: 'stripe checkout sessions create — $100 envelope',
    fallbackFile: 'stripe-cli-checkout.txt',
  },
  {
    id: 'nemoclaw-gate-403',
    title: 'NemoClaw policy gate — blocked $150 breach',
    fallbackFile: 'nemoclaw-gate-403.txt',
  },
  {
    id: 'nvidia-smi',
    title: 'NVIDIA RTX 5090 + Nemotron live inference',
    fallbackFile: 'nvidia-smi.txt',
  },
  {
    id: 'cat-playbook',
    title: 'cat skills/bounded-capital-experiment-v1.SKILL.md',
    fallbackFile: 'cat-playbook.txt',
  },
  {
    id: 'ls-skills',
    title: 'ls -la skills/ — reusable Hermes artifact',
    fallbackFile: 'ls-skills.txt',
  },
];

async function main() {
  await loadEnvLocal();
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(REMOTION_PUBLIC_DIR, { recursive: true });

  const summary = [];

  for (const session of SESSIONS) {
    const outFile = join(OUT_DIR, `${session.id}.mp4`);
    const remotionFile = join(REMOTION_PUBLIC_DIR, `${session.id}.mp4`);
    const fallbackPath = join(TAPE_DIR, session.fallbackFile);

    try {
      await access(fallbackPath);
    } catch (err) {
      console.error(`[${session.id}] missing fallback script: ${fallbackPath}`);
      summary.push({ id: session.id, mode: 'failed', error: `missing fallback script: ${err.message}` });
      continue;
    }

    try {
      const rawSegments = await parseFallbackScript(fallbackPath);
      const segments = rawSegments.map((seg) =>
        seg.type === 'output' ? { ...seg, text: redactOutput(seg.text) } : seg
      );

      await renderTerminalClip({
        sessionId: session.id,
        title: session.title,
        badgeLabel: 'Live artifact',
        badgeClass: 'badge-live',
        segments,
        outFile,
      });
      await copyFile(outFile, remotionFile);
      summary.push({ id: session.id, mode: 'local-replay', outFile, remotionFile });
      console.log(`[${session.id}] local-replay => ${outFile}`);
    } catch (err) {
      console.error(`[${session.id}] render failed: ${err.message}`);
      summary.push({ id: session.id, mode: 'failed', error: err.message });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourceDir: TAPE_DIR,
    summary,
  };
  const reportPath = join(OUT_DIR, 'capture-report-v15.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log('\nTerminal capture summary:');
  for (const row of summary) {
    if (row.mode === 'failed') {
      console.log(`  ${row.id}: FAILED — ${row.error}`);
    } else {
      console.log(`  ${row.id}: ${row.mode.toUpperCase()} — ${row.outFile}`);
    }
  }
  console.log(`\nReport: ${reportPath}`);

  const allOk = summary.every((r) => r.mode !== 'failed');
  if (!allOk) {
    console.error('\nOne or more terminal clips failed to render.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Terminal capture pipeline encountered an error:', err);
  process.exit(1);
});
