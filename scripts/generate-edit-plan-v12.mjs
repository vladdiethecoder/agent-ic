#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const fps = 30;
const introFrames = 90;
const outroFrames = 90;

const audioCandidates = [
  'remotion/public/agent-ic-audio-mastered-v12.wav',
  'remotion/public/voiceover-v11.wav',
];

const captionsCandidates = [
  'remotion/src/captions-v12.json',
  'remotion/src/captions-v11.json',
];

const timestampsCandidates = [
  'demo-out/stage-timestamps-v12.json',
  'demo-out/stage-timestamps-v11.json',
];

const planPath = 'remotion/edit-plan-v12.json';

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
  for (const candidate of audioCandidates) {
    try {
      await fs.access(candidate);
      const durationStr = await exec(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', candidate]);
      const duration = Number(durationStr);
      if (Number.isFinite(duration) && duration > 0) {
        console.log(`Using audio: ${candidate} (${duration.toFixed(3)}s)`);
        return duration;
      }
    } catch {
      // try next candidate
    }
  }
  console.warn('No audio file found; using default duration 154.219s');
  return 154.219;
}

async function loadCaptions() {
  for (const candidate of captionsCandidates) {
    try {
      const raw = await fs.readFile(candidate, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0) {
        console.log(`Using captions: ${candidate} (${data.length} phrases)`);
        return data;
      }
    } catch {
      // try next candidate
    }
  }
  return [];
}

async function loadStageTimestamps() {
  for (const candidate of timestampsCandidates) {
    try {
      const raw = await fs.readFile(candidate, 'utf8');
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.stages) && data.stages.length > 0 && typeof data.videoStart === 'number') {
        console.log(`Using stage timestamps: ${candidate}`);
        return data;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
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
  const duration = await findAudioDuration();
  const totalFrames = introFrames + Math.round(duration * fps) + outroFrames;
  const mainFrames = totalFrames - introFrames - outroFrames;

  const timestamps = await loadStageTimestamps();
  const template = (await loadTemplate()) || {};
  const captions = await loadCaptions();

  const stageOrder = [
    { id: 'problem', label: 'Problem', fallback: 0 },
    { id: 'onboard', label: 'Onboard', fallback: 20000 },
    { id: 'evaluate', label: 'Evaluate', fallback: 50000 },
    { id: 'fund', label: 'Fund', fallback: 65000 },
    { id: 'govern', label: 'Govern', fallback: 80000 },
    { id: 'decide', label: 'Decide', fallback: 115000 },
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
      const startMs = stage ? stage.ts : videoStart + fallback;
      const endStage = stageOrder[i + 1];
      const endMs = endStage && byId[endStage.id] ? byId[endStage.id].ts : videoStart + duration * 1000;
      stageLabels.push({
        stageId: id,
        text: label,
        startFrame: clampFrame(msToFrame(startMs, videoStart), introFrames + mainFrames),
        endFrame: clampFrame(msToFrame(endMs, videoStart), introFrames + mainFrames),
        x: 80,
        y: 80,
        width: 320,
      });
    }
  } else {
    stageLabels = [
      { stageId: 'problem', text: 'Problem', startFrame: 0, endFrame: 600, x: 80, y: 80, width: 320 },
      { stageId: 'onboard', text: 'Onboard', startFrame: 600, endFrame: 1500, x: 80, y: 80, width: 320 },
      { stageId: 'evaluate', text: 'Evaluate', startFrame: 1500, endFrame: 1950, x: 80, y: 80, width: 320 },
      { stageId: 'fund', text: 'Fund', startFrame: 1950, endFrame: 2400, x: 80, y: 80, width: 320 },
      { stageId: 'govern', text: 'Govern', startFrame: 2400, endFrame: 3450, x: 80, y: 80, width: 320 },
      { stageId: 'decide', text: 'Decide', startFrame: 3450, endFrame: mainFrames, x: 80, y: 80, width: 320 },
    ];
  }

  const callouts = [
    { stageId: 'problem', startFrame: 0, endFrame: 600, x: 80, y: 260, width: 560, text: 'Problem — ungoverned AI pilot spend' },
    { stageId: 'onboard', startFrame: 600, endFrame: 1500, x: 80, y: 260, width: 560, text: 'Onboard — NemoClaw + Hermes sandbox' },
    { stageId: 'evaluate', startFrame: 1500, endFrame: 1950, x: 80, y: 260, width: 560, text: 'Evaluate — Nemotron scores ROI proof' },
    { stageId: 'fund', startFrame: 1950, endFrame: 2400, x: 80, y: 260, width: 560, text: 'Fund — $185K budget · ~$35K cap · Stripe auth' },
    { stageId: 'govern', startFrame: 2400, endFrame: 3450, x: 80, y: 260, width: 560, text: 'Govern — evidence gates decide continuation' },
    { stageId: 'decide', startFrame: 3450, endFrame: mainFrames, x: 80, y: 260, width: 560, text: 'Decide — Continue, reusable playbook saved' },
  ];

  const oldMainFrames = template.mainFrames || mainFrames;
  const baseHighlights = template.highlights || [
    { stageId: 'evaluate', startFrame: 1560, endFrame: 1890, x: 320, y: 430, label: '$185,000 pilot budget' },
    { stageId: 'fund', startFrame: 2010, endFrame: 2340, x: 320, y: 430, label: 'Autonomous cap' },
    { stageId: 'govern', startFrame: 2610, endFrame: 3150, x: 220, y: 540, label: '403 Forbidden block' },
    { stageId: 'decide', startFrame: 3510, endFrame: 3840, x: 300, y: 430, label: 'CONTINUE verdict' },
  ];
  const highlights = scaleFrames(baseHighlights, oldMainFrames, mainFrames);

  const plan = {
    fps,
    introFrames,
    mainFrames,
    outroFrames,
    totalFrames,
    audioDuration: duration,
    uiSrc: 'ui-v12.webm',
    audioSrc: 'agent-ic-audio-mastered-v12.wav',
    cursorEventsSrc: 'cursor-events-v12.json',
    captionsSrc: 'captions-v12.json',
    captionRegion: { x: 80, y: 920, width: 1200, height: 100 },
    captions,
    stageLabels,
    callouts,
    highlights,
    terminalOverlays: [],
  };

  await fs.mkdir(path.dirname(planPath), { recursive: true });
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2));
  console.log(`Wrote ${planPath}`);
  console.log(`  fps=${fps} totalFrames=${totalFrames} mainFrames=${mainFrames} duration=${duration.toFixed(3)}s captions=${captions.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
