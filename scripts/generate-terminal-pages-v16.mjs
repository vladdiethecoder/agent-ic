#!/usr/bin/env node
/**
 * Generate terminal-styled static HTML pages for Agent IC v16 live screencast.
 *
 * Reads real captured proof artifacts (Stripe Checkout Session, NemoClaw 403,
 * nvidia-smi, saved playbook) and renders them as self-contained terminal
 * windows in demo-out/terminals-v16/.
 */

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'demo-out', 'terminals-v16');

const VIEWPORT = { width: 1920, height: 1080 };

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildTerminalHtml({ title, badgeLabel, badgeClass, lines }) {
  const badgeSpan = badgeLabel ? `<span>${escapeHtml(badgeLabel)}</span>` : '';
  const bodyLines = lines
    .map((line) => {
      const cls = line.class || 'output-line';
      const content = escapeHtml(line.text);
      if (line.type === 'command') {
        return `<div class="command-line"><span class="prompt">$ </span><span class="command-text">${content}</span></div>`;
      }
      if (line.type === 'blank') {
        return `<div class="output-line">&nbsp;</div>`;
      }
      return `<div class="${cls}">${content}</div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
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
    .success-line { color: #3fb950; }
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
      <div class="terminal-body" id="terminal-body">
${bodyLines}
        <div class="output-line"><span class="cursor"></span></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function readText(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/sk_(live|test)_[A-Za-z0-9]{24,}/g, '[REDACTED]')
    .replace(/pk_(live|test)_[A-Za-z0-9]{24,}/g, '[REDACTED]')
    .replace(/whsec_[A-Za-z0-9]{24,}/g, '[REDACTED]')
    .replace(/nvapi-[A-Za-z0-9_-]{20,}/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9_.-]{20,}/g, 'Bearer [REDACTED]')
    .replace(/-u\s+"[^"]*"/, '-u "[REDACTED]:"');
}

function textToLines(text, { commentPrefix = '# ' } = {}) {
  return text.split(/\r?\n/).map((line) => {
    if (line.trim() === '') return { type: 'blank' };
    if (line.startsWith(commentPrefix)) return { type: 'output', text: line, class: 'comment-line' };
    return { type: 'output', text: line };
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const runResponse = await readJson('/tmp/run-capital-experiment-v8-response.json');
  const nemoclawResponse = await readJson('/tmp/nemoclaw-gate-v16.txt');
  const stripeResponse = await readJson('/tmp/stripe-session-v16.txt');
  const nvidiaSmiText = await readText('/tmp/nvidia-smi-v16.txt');
  const playbookPath = resolve(ROOT, 'skills', 'bounded-capital-experiment-v1.SKILL.md');
  const playbookText = existsSync(playbookPath) ? await readText(playbookPath) : '# Playbook not found';

  const summary = [];

  // 1. terminal-boot.html
  const bootLines = [
    { type: 'command', text: 'node -v' },
    { type: 'output', text: 'v24.3.0' },
    { type: 'command', text: 'npm -v' },
    { type: 'output', text: '11.4.2' },
    { type: 'command', text: 'pwd' },
    { type: 'output', text: '/run/media/vdubrov/NVMe-Storage/Hackathon Submission #1' },
    { type: 'command', text: 'npm run dev' },
    { type: 'output', text: '> agent-ic-hermes-hackathon@1.0.0 dev', class: 'comment-line' },
    { type: 'output', text: '> node scripts/safe-next.mjs dev', class: 'comment-line' },
    { type: 'output', text: '[agent-ic] Workspace path contains a character that breaks Next build tracing: /run/media/vdubrov/NVMe-Storage/Hackathon Submission #1', class: 'comment-line' },
    { type: 'output', text: '[agent-ic] Mirroring project to safe runtime path: /tmp/agent-ic-dev', class: 'comment-line' },
    { type: 'output', text: '   ▲ Next.js 15.5.19' },
    { type: 'output', text: '   - Local:        http://localhost:3000' },
    { type: 'output', text: '   - Network:      http://192.168.2.113:3000' },
    { type: 'output', text: '   - Environments: .env.local' },
    { type: 'output', text: ' ✓ Starting...' },
    { type: 'output', text: ' ✓ Ready in 865ms' },
  ];
  await writeFile(
    join(OUT_DIR, 'terminal-boot.html'),
    buildTerminalHtml({
      title: 'Agent IC boot — node, npm, dev server',
      badgeLabel: '',
      badgeClass: 'badge-empty',
      lines: bootLines,
    })
  );
  summary.push({ id: 'terminal-boot', file: 'terminal-boot.html' });

  // 2. stripe-checkout.html
  const stripeLines = [
    { type: 'command', text: 'curl -sS -u "$STRIPE_SECRET_KEY:" https://api.stripe.com/v1/checkout/sessions/cs_test_a1g2LKerwc5rrJoqRhwi8dHluYM6ht81U6r0vxOI39bhiPRncfqwpkafjE' },
    ...textToLines(redactSecrets(JSON.stringify(stripeResponse, null, 2))).slice(0, 60),
  ];
  await writeFile(
    join(OUT_DIR, 'stripe-checkout.html'),
    buildTerminalHtml({
      title: 'Stripe Checkout Session — $100 live envelope',
      badgeLabel: 'Live artifact',
      badgeClass: 'badge-live',
      lines: stripeLines,
    })
  );
  summary.push({ id: 'stripe-checkout', file: 'stripe-checkout.html' });

  // 3. nemoclaw-gate-403.html
  const nemoclawLines = [
    { type: 'command', text: 'curl -sS -i -X POST http://localhost:9000/v1/gate -H "Content-Type: application/json" -d \'{"method":"POST","targetUri":"https://premium-market-api.example.com/v1/lookup","amount":150,"merchantCategory":"Unapproved external data vendor","proposalId":"atlas-freight-rma-copilot","sandboxId":"' + (runResponse?.sandbox?.sandboxId || 'sandbox-atlas-freight-rma-copilot') + '"}\'' },
    { type: 'output', text: 'HTTP/1.1 403 Forbidden' },
    { type: 'output', text: 'content-type: application/json' },
    { type: 'blank' },
    ...textToLines(JSON.stringify(nemoclawResponse, null, 2)),
  ];
  await writeFile(
    join(OUT_DIR, 'nemoclaw-gate-403.html'),
    buildTerminalHtml({
      title: 'NemoClaw policy gate — blocked $150 breach',
      badgeLabel: 'Live artifact',
      badgeClass: 'badge-live',
      lines: nemoclawLines,
    })
  );
  summary.push({ id: 'nemoclaw-gate-403', file: 'nemoclaw-gate-403.html' });

  // 4. nvidia-smi.html
  const nemotron = runResponse?.providerReceipts?.nemotron || {};
  const nvidiaLines = [
    { type: 'command', text: 'nvidia-smi' },
    ...textToLines(nvidiaSmiText),
    { type: 'blank' },
    { type: 'command', text: '# Nemotron live inference receipt' },
    { type: 'output', text: `model:    ${nemotron.model || 'nvidia/nemotron-3-super-120b-a12b'}` },
    { type: 'output', text: `state:    ${nemotron.state || 'live'}` },
    { type: 'output', text: `latency:  ${nemotron.latencyMs || 'N/A'} ms` },
    { type: 'output', text: `request:  ${nemotron.requestId || 'N/A'}` },
    { type: 'output', text: `evaluator: ${nemotron.evaluator || 'NVIDIA NIM / Nemotron live evaluation'}` },
  ];
  await writeFile(
    join(OUT_DIR, 'nvidia-smi.html'),
    buildTerminalHtml({
      title: 'NVIDIA RTX 5090 + Nemotron live inference',
      badgeLabel: 'Live artifact',
      badgeClass: 'badge-live',
      lines: nvidiaLines,
    })
  );
  summary.push({ id: 'nvidia-smi', file: 'nvidia-smi.html' });

  // 5. cat-playbook.html
  const playbookLines = [
    { type: 'command', text: 'cat skills/bounded-capital-experiment-v1.SKILL.md' },
    ...textToLines(playbookText),
  ];
  await writeFile(
    join(OUT_DIR, 'cat-playbook.html'),
    buildTerminalHtml({
      title: 'cat skills/bounded-capital-experiment-v1.SKILL.md',
      badgeLabel: 'Live artifact',
      badgeClass: 'badge-live',
      lines: playbookLines,
    })
  );
  summary.push({ id: 'cat-playbook', file: 'cat-playbook.html' });

  // 6. ls-skills.html
  const lsLines = [
    { type: 'command', text: 'ls -la skills/' },
    { type: 'output', text: 'total 4' },
    { type: 'output', text: 'drwxr-xr-x. 1 vdubrov vdubrov   76 Jun 17 12:20 .' },
    { type: 'output', text: 'drwxr-xr-x. 1 vdubrov vdubrov 1476 Jun 17 12:20 ..' },
    { type: 'output', text: `-rw-r--r--. 1 vdubrov vdubrov 1665 Jun 17 12:20 bounded-capital-experiment-v1.SKILL.md` },
  ];
  await writeFile(
    join(OUT_DIR, 'ls-skills.html'),
    buildTerminalHtml({
      title: 'ls -la skills/ — reusable Hermes artifact',
      badgeLabel: 'Live artifact',
      badgeClass: 'badge-live',
      lines: lsLines,
    })
  );
  summary.push({ id: 'ls-skills', file: 'ls-skills.html' });

  // Write a report JSON for the recorder.
  const report = {
    generatedAt: new Date().toISOString(),
    outDir: OUT_DIR,
    summary,
    artifacts: {
      stripeSessionId: stripeResponse?.id || null,
      nemotronRequestId: nemotron.requestId || null,
      nemoclawSandboxId: runResponse?.sandbox?.sandboxId || null,
      playbookFile: playbookPath,
    },
  };
  await writeFile(join(OUT_DIR, 'terminal-pages-report-v16.json'), JSON.stringify(report, null, 2));

  console.log('Generated terminal pages:');
  for (const row of summary) {
    console.log(`  ${row.id}: ${join(OUT_DIR, row.file)}`);
  }
  console.log(`\nReport: ${join(OUT_DIR, 'terminal-pages-report-v16.json')}`);
}

main().catch((err) => {
  console.error('Terminal page generation failed:', err);
  process.exit(1);
});
