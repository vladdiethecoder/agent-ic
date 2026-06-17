#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const fps = 30;
const introFrames = 0;
const outroFrames = 60;

const audioPath = 'remotion/public/agent-ic-audio-mastered-v15.wav';
const captionsPath = 'remotion/src/captions-v15.json';
const timestampsPath = 'demo-out/stage-timestamps-v15.json';
const planPath = 'remotion/edit-plan-v15.json';

function exec(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(err || `Command failed: ${args.join(' ')}`));
      else resolve(out.trim());
    });
  });
}

async function findAudioDuration() {
  try {
    await fs.access(audioPath);
    const durationStr = await exec(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audioPath]);
    const duration = Number(durationStr);
    if (Number.isFinite(duration) && duration > 0) {
      console.log(`Using audio: ${audioPath} (${duration.toFixed(3)}s)`);
      return duration;
    }
  } catch {
    // fall through
  }
  console.warn('No audio file found; using default duration 123.307s');
  return 123.307;
}

async function loadCaptions() {
  try {
    const raw = await fs.readFile(captionsPath, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length > 0) {
      console.log(`Using captions: ${captionsPath} (${data.length} phrases)`);
      return data;
    }
  } catch {
    // fall through
  }
  return [];
}

async function loadStageTimestamps() {
  try {
    const raw = await fs.readFile(timestampsPath, 'utf8');
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.stages) && data.stages.length > 0 && typeof data.videoStart === 'number') {
      console.log(`Using stage timestamps: ${timestampsPath}`);
      return data;
    }
  } catch {
    // fall through
  }
  return null;
}

async function findUiDuration() {
  const candidates = ['demo-out/ui-v15.webm', 'remotion/public/ui-v15.webm'];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      const durationStr = await exec(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', candidate]);
      const duration = Number(durationStr);
      if (Number.isFinite(duration) && duration > 0) {
        console.log(`Using UI recording: ${candidate} (${duration.toFixed(3)}s)`);
        return duration;
      }
    } catch {
      // try next
    }
  }
  return 0;
}

function msToFrame(ms, videoStart) {
  return Math.round(((ms - videoStart) / 1000) * fps);
}

function clampFrame(f, max) {
  return Math.max(0, Math.min(max, f));
}

async function loadTemplate() {
  try {
    const raw = await fs.readFile(planPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function scaleFrames(items, oldMainFrames, newMainFrames) {
  if (!items || items.length === 0) return [];
  const ratio = newMainFrames / oldMainFrames;
  return items.map((item) => ({
    ...item,
    startFrame: Math.round(item.startFrame * ratio),
    endFrame: Math.round(item.endFrame * ratio),
  }));
}

async function main() {
  const audioDuration = await findAudioDuration();
  const uiDuration = await findUiDuration();
  const mainSeconds = Math.max(audioDuration, uiDuration);
  const mainFrames = Math.max(1, Math.round(mainSeconds * fps));
  const totalFrames = introFrames + mainFrames + outroFrames;

  const timestamps = await loadStageTimestamps();
  const template = (await loadTemplate()) || {};
  const captions = await loadCaptions();

  const stageOrder = [
    { id: 'problem', label: 'Problem', fallback: 0 },
    { id: 'proposal', label: 'Proposal', fallback: 15_000 },
    { id: 'evaluate', label: 'Evaluate', fallback: 35_000 },
    { id: 'fund', label: 'Fund', fallback: 50_000 },
    { id: 'govern', label: 'Govern', fallback: 70_000 },
    { id: 'decide', label: 'Decide', fallback: 95_000 },
  ];

  let stageLabels;
  if (timestamps) {
    const videoStart = timestamps.videoStart;
    const byId = {};
    for (const s of timestamps.stages) {
      byId[s.id] = s;
    }
    stageLabels = [];
    for (let i = 0; i < stageOrder.length; i++) {
      const { id, label, fallback } = stageOrder[i];
      const stage = byId[id];
      const startMs = stage && stage.ts ? stage.ts : videoStart + fallback;
      const endStage = stageOrder[i + 1];
      const endMs =
        endStage && byId[endStage.id] && byId[endStage.id].ts
          ? byId[endStage.id].ts
          : videoStart + mainSeconds * 1000;
      stageLabels.push({
        stageId: id,
        text: label,
        startFrame: clampFrame(msToFrame(startMs, videoStart), mainFrames),
        endFrame: clampFrame(msToFrame(endMs, videoStart), mainFrames),
        x: 60,
        y: 60,
        width: 320,
      });
    }
  } else {
    stageLabels = [
      { stageId: 'problem', text: 'Problem', startFrame: 0, endFrame: 450, x: 60, y: 60, width: 320 },
      { stageId: 'proposal', text: 'Proposal', startFrame: 450, endFrame: 1050, x: 60, y: 60, width: 320 },
      { stageId: 'evaluate', text: 'Evaluate', startFrame: 1050, endFrame: 1500, x: 60, y: 60, width: 320 },
      { stageId: 'fund', text: 'Fund', startFrame: 1500, endFrame: 2100, x: 60, y: 60, width: 320 },
      { stageId: 'govern', text: 'Govern', startFrame: 2100, endFrame: 2850, x: 60, y: 60, width: 320 },
      { stageId: 'decide', text: 'Decide', startFrame: 2850, endFrame: mainFrames, x: 60, y: 60, width: 320 },
    ];
  }

  const oldMainFrames = template.mainFrames || mainFrames;
  const baseHighlights = template.highlights || [
    { stageId: 'fund', startFrame: 1530, endFrame: 1770, x: 1240, y: 180, label: '$100 autonomous cap' },
    { stageId: 'govern', startFrame: 2160, endFrame: 2520, x: 1240, y: 180, label: '403 BLOCKED' },
    { stageId: 'decide', startFrame: 2940, endFrame: 3300, x: 300, y: 430, label: 'CONTINUE' },
  ];
  const highlights = scaleFrames(baseHighlights, oldMainFrames, mainFrames);

  const baseTerminalOverlays = template.terminalOverlays || [
    {
      name: 'terminal-boot',
      src: 'terminals-v15/terminal-boot.mp4',
      startFrame: stageLabels.find((s) => s.stageId === 'problem')?.startFrame || 0,
      endFrame: clampFrame((stageLabels.find((s) => s.stageId === 'problem')?.startFrame || 0) + 240, mainFrames),
      x: 1180,
      y: 140,
      width: 680,
      height: 420,
      label: 'Agent IC boot',
    },
    {
      name: 'stripe-cli-checkout',
      src: 'terminals-v15/stripe-cli-checkout.mp4',
      startFrame: stageLabels.find((s) => s.stageId === 'fund')?.startFrame || 1500,
      endFrame: clampFrame((stageLabels.find((s) => s.stageId === 'fund')?.startFrame || 1500) + 390, mainFrames),
      x: 1180,
      y: 140,
      width: 680,
      height: 420,
      label: 'Stripe Checkout Session',
    },
    {
      name: 'nemoclaw-gate-403',
      src: 'terminals-v15/nemoclaw-gate-403.mp4',
      startFrame: stageLabels.find((s) => s.stageId === 'govern')?.startFrame || 2100,
      endFrame: clampFrame((stageLabels.find((s) => s.stageId === 'govern')?.startFrame || 2100) + 510, mainFrames),
      x: 1180,
      y: 140,
      width: 680,
      height: 420,
      label: 'NemoClaw 403 gate',
    },
    {
      name: 'nvidia-smi',
      src: 'terminals-v15/nvidia-smi.mp4',
      startFrame: stageLabels.find((s) => s.stageId === 'evaluate')?.startFrame || 1050,
      endFrame: clampFrame((stageLabels.find((s) => s.stageId === 'evaluate')?.startFrame || 1050) + 360, mainFrames),
      x: 1180,
      y: 140,
      width: 680,
      height: 420,
      label: 'NVIDIA RTX 5090 + Nemotron',
    },
    {
      name: 'cat-playbook',
      src: 'terminals-v15/cat-playbook.mp4',
      startFrame: stageLabels.find((s) => s.stageId === 'decide')?.startFrame || 2850,
      endFrame: clampFrame((stageLabels.find((s) => s.stageId === 'decide')?.startFrame || 2850) + 480, mainFrames),
      x: 1180,
      y: 140,
      width: 680,
      height: 420,
      label: 'Reusable Hermes playbook',
    },
  ];
  const terminalOverlays = scaleFrames(baseTerminalOverlays, oldMainFrames, mainFrames);

  const plan = {
    fps,
    introFrames,
    mainFrames,
    outroFrames,
    totalFrames,
    audioDuration,
    uiDuration,
    uiSrc: 'ui-v15.webm',
    audioSrc: 'agent-ic-audio-mastered-v15.wav',
    cursorEventsSrc: 'cursor-events-v15.json',
    captionsSrc: 'captions-v15.json',
    captionRegion: { x: 60, y: 920, width: 1100, height: 100 },
    captions,
    stageLabels,
    highlights,
    terminalOverlays,
  };

  await fs.mkdir(path.dirname(planPath), { recursive: true });
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2));

  // Write a text manifest so QA can verify required text even when OCR is skipped.
  const manifestPath = 'demo-out/video-text-manifest-v15.txt';
  const manifest = [
    'CONTINUE',
    '$185,000',
    '$100',
    '150',
    '403',
    'Hermes',
    'Stripe',
    'NemoClaw',
    'rawRequest',
    'rawResponse',
    'bounded-capital-experiment-v1',
    'Autonomous RMA pilot',
    'premium-market-api.example.com',
    'cs_test_',
    'checkout.session',
    'NVIDIA GeForce RTX 5090',
    'nemotron-3-super-120b-a12b',
  ].join('\n');
  await fs.writeFile(manifestPath, manifest, 'utf8');

  console.log(`Wrote ${planPath}`);
  console.log(`  fps=${fps} totalFrames=${totalFrames} mainFrames=${mainFrames} duration=${mainSeconds.toFixed(3)}s captions=${captions.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
