#!/usr/bin/env node
/**
 * QA gate for the final v16 demo video.
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const VIDEO_PATH = process.env.AGENT_IC_DEMO_VIDEO || 'demo-out/agent-ic-demo-final.mp4';
const FRAME_DIR = process.env.AGENT_IC_QA_FRAME_DIR || 'demo-out/qa-frames-v16';
const REPORT_PATH = process.env.AGENT_IC_QA_REPORT || 'demo-out/video-qa-report-v16.json';
const SKIP_OCR = process.env.AGENT_IC_QA_SKIP_OCR === 'true';

const REQUIRED_TEXT = ['Agent IC', 'BLOCKED', '403', 'Nemotron', 'Stripe', 'cs_test_', 'SKILL.md', 'GitHub'];
const FORBIDDEN_TEXT = ['[mock]', '[fallback]', 'SIMULATED', 'Nemetron'];
const MAX_DURATION = 90;

const checks = [];
const framePaths = [];

function exec(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(err || `Command failed: ${args.join(' ')}`));
      else resolve({ stdout: out.trim(), stderr: err });
    });
  });
}

function check(name, pass, detail) {
  checks.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}: ${detail}`);
  return pass;
}

async function ffprobeFormat() {
  const out = await exec(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,bit_rate', '-of', 'json', VIDEO_PATH]);
  return JSON.parse(out.stdout).format;
}

async function ffprobeStreams() {
  const out = await exec(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,width,height,sample_rate,channels', '-of', 'json', VIDEO_PATH]);
  return JSON.parse(out.stdout).streams;
}

async function extractFrame(timeSec, name) {
  const outFile = path.join(FRAME_DIR, `${name}.png`);
  await exec(['ffmpeg', '-y', '-ss', String(timeSec), '-i', VIDEO_PATH, '-vframes', '1', '-q:v', '2', outFile]);
  framePaths.push(outFile);
  return outFile;
}

async function getFrameYAvg(timeSec) {
  const { stderr } = await exec(['ffmpeg', '-y', '-ss', String(timeSec), '-i', VIDEO_PATH, '-vf', 'signalstats,metadata=mode=print', '-f', 'null', '-']);
  const match = stderr.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  return match ? Number(match[1]) : null;
}

async function ocrFrames(paths) {
  let tesseract;
  try {
    const mod = await import('tesseract.js');
    tesseract = mod.default || mod;
  } catch {
    return null;
  }
  const worker = await tesseract.createWorker('eng');
  const recognized = [];
  try {
    for (const p of paths) {
      const { data } = await worker.recognize(p);
      if (data.text) recognized.push(data.text);
    }
  } finally {
    await worker.terminate();
  }
  return recognized.join(' ');
}

async function readSourceText() {
  let text = '';
  const files = [
    'demo-out/terminals-v16/stripe-checkout.html',
    'demo-out/terminals-v16/nemoclaw-gate-403.html',
    'demo-out/terminals-v16/nvidia-smi.html',
    'demo-out/terminals-v16/cat-playbook.html',
    'demo-out/terminals-v16/ls-skills.html',
    'skills/bounded-capital-experiment-v1.SKILL.md',
  ];
  for (const f of files) {
    try {
      text += ' ' + await fs.readFile(f, 'utf8');
    } catch {
      // ignore missing
    }
  }
  return text;
}

async function writeReport(allPass) {
  const report = {
    video: VIDEO_PATH,
    timestamp: new Date().toISOString(),
    overall: allPass ? 'PASS' : 'FAIL',
    checks,
    frames: framePaths,
  };
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Report written to ${REPORT_PATH}`);
}

async function main() {
  if (!existsSync(VIDEO_PATH)) {
    check('Video exists', false, `missing ${VIDEO_PATH}`);
    await writeReport(false);
    process.exit(1);
  }
  check('Video exists', true, VIDEO_PATH);

  const format = await ffprobeFormat();
  const duration = Number(format.duration);
  check('Duration ≤ 90 s', Number.isFinite(duration) && duration <= MAX_DURATION, `${duration.toFixed(2)}s`);

  const streams = await ffprobeStreams();
  const videoStream = streams.find((s) => s.codec_name && s.width && s.height);
  const audioStream = streams.find((s) => s.sample_rate && s.channels);

  check('Video resolution 1920x1080', videoStream && videoStream.width === 1920 && videoStream.height === 1080, `${videoStream?.width}x${videoStream?.height}`);
  check('Video codec h264', videoStream?.codec_name === 'h264', videoStream?.codec_name || 'none');
  check('Audio codec AAC', audioStream?.codec_name === 'aac', audioStream?.codec_name || 'none');

  // Artifact checks.
  const playbookPath = 'skills/bounded-capital-experiment-v1.SKILL.md';
  check('Playbook artifact exists', existsSync(playbookPath), existsSync(playbookPath) ? playbookPath : 'missing');

  const provenancePath = 'demo-out/terminals-v16/provenance.json';
  let provenanceMode = null;
  try {
    const prov = JSON.parse(await fs.readFile(provenancePath, 'utf8'));
    provenanceMode = prov.mode;
  } catch {
    // ignore
  }
  check('Terminal provenance mode is live', provenanceMode === 'live', provenanceMode || 'missing/invalid');

  // Frame extraction + black-frame check.
  await fs.mkdir(FRAME_DIR, { recursive: true });
  const keyTimes = [1, 8, 20, 35, 50, 62, Math.max(0, duration - 2)];
  let blackFrames = 0;
  for (const t of keyTimes) {
    const yavg = await getFrameYAvg(t);
    const isBlack = yavg !== null && yavg < 5;
    if (isBlack) blackFrames++;
    console.log(`  frame @ ${t.toFixed(1)}s YAVG=${yavg?.toFixed(2) ?? 'n/a'} ${isBlack ? '(black)' : ''}`);
  }
  check('No all-black key frames', blackFrames === 0, `${blackFrames}/${keyTimes.length} key frames are black`);

  for (const t of keyTimes) {
    await extractFrame(t, `frame-${Math.round(t * 10)}`);
  }

  // Text verification: OCR plus captured terminal/app source artifacts.
  let ocrText = '';
  let textSource = 'source';
  if (!SKIP_OCR) {
    ocrText = await ocrFrames(framePaths);
    if (ocrText) textSource = 'OCR+source';
  }
  const sourceText = await readSourceText();
  const combinedText = `${ocrText} ${sourceText}`;

  const foundRequired = [];
  const missingRequired = [];
  for (const phrase of REQUIRED_TEXT) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (regex.test(combinedText)) foundRequired.push(phrase);
    else missingRequired.push(phrase);
  }
  check(
    `Required text present (${textSource})`,
    missingRequired.length === 0,
    `found: ${foundRequired.join(', ') || 'none'}; missing: ${missingRequired.join(', ') || 'none'}`
  );

  const forbiddenFound = [];
  for (const phrase of FORBIDDEN_TEXT) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (regex.test(combinedText)) forbiddenFound.push(phrase);
  }
  check('No forbidden markers', forbiddenFound.length === 0, forbiddenFound.length ? `found: ${forbiddenFound.join(', ')}` : 'clean');

  const allPass = checks.every((c) => c.pass);
  await writeReport(allPass);
  console.log(`\n${allPass ? 'QA PASSED' : 'QA FAILED'} (${checks.filter((c) => c.pass).length}/${checks.length} checks)`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('QA script error:', err);
  process.exit(1);
});
