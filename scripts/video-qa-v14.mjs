#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const videoPath = process.env.AGENT_IC_DEMO_VIDEO || 'demo-out/agent-ic-demo-v14.mp4';
const frameDir = process.env.AGENT_IC_QA_FRAME_DIR || 'demo-out/qa-frames-v14';
const reportPath = process.env.AGENT_IC_QA_REPORT || 'demo-out/video-qa-report-v14.json';
const skipOcr = process.env.AGENT_IC_QA_SKIP_OCR === 'true';
const requiredText = ['CONTINUE', '$185,000', '$100', '150', '403', 'Hermes', 'Stripe', 'NemoClaw', 'rawRequest', 'rawResponse'];
const forbiddenText = ['[mock]', '[fallback]', 'SIMULATED'];
const blackThresholdY = 5;
const loudnessMin = -16;
const loudnessMax = -12;
const maxDuration = 180;

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
  const out = await exec([
    'ffprobe', '-v', 'error', '-show_entries', 'format=duration,bit_rate', '-of', 'json', videoPath,
  ]);
  return JSON.parse(out.stdout).format;
}

async function ffprobeStreams() {
  const out = await exec([
    'ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,width,height,sample_rate,channels', '-of', 'json', videoPath,
  ]);
  return JSON.parse(out.stdout).streams;
}

async function extractFrame(timeSec, name) {
  const outFile = path.join(frameDir, `${name}.png`);
  await exec(['ffmpeg', '-y', '-ss', String(timeSec), '-i', videoPath, '-vframes', '1', '-q:v', '2', outFile]);
  framePaths.push(outFile);
  return outFile;
}

async function getFrameYAvg(timeSec) {
  const { stderr } = await exec([
    'ffmpeg', '-y', '-ss', String(timeSec), '-i', videoPath, '-vf', 'signalstats,metadata=mode=print', '-f', 'null', '-',
  ]);
  const match = stderr.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  return match ? Number(match[1]) : null;
}

async function getLoudness() {
  const { stderr } = await exec([
    'ffmpeg', '-y', '-i', videoPath, '-af', 'loudnorm=I=-14:TP=-1:LRA=7:print_format=json', '-f', 'null', '-',
  ]);
  const start = stderr.indexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  return JSON.parse(stderr.slice(start, end + 1));
}

async function readMetadataText() {
  try {
    const { stdout } = await exec([
      'ffprobe', '-v', 'error', '-show_entries', 'format_tags', '-of', 'json', videoPath,
    ]);
    const data = JSON.parse(stdout);
    const tags = data.format?.tags || {};
    return Object.values(tags).join(' ');
  } catch {
    return '';
  }
}

async function readSourceText() {
  let text = '';
  const files = [
    'remotion/edit-plan-v14.json',
    'remotion/src/captions-v14.json',
    'demo-out/video-text-manifest-v14.txt',
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

async function loadEditPlan() {
  try {
    const raw = await fs.readFile('remotion/edit-plan-v14.json', 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadCursorEvents() {
  try {
    const raw = await fs.readFile('demo-out/cursor-events-v14.json', 'utf8');
    const data = JSON.parse(raw);
    return data.events || [];
  } catch {
    return [];
  }
}

async function loadTerminalReport() {
  try {
    const raw = await fs.readFile('demo-out/terminals-v14/capture-report-v14.json', 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

async function main() {
  if (!existsSync(videoPath)) {
    console.error(`Video not found: ${videoPath}`);
    check('Video exists', false, `missing ${videoPath}`);
    await writeReport(false);
    process.exit(1);
  }
  check('Video exists', true, videoPath);

  // Authenticity checks on planning artifacts (not the video itself).
  const editPlan = await loadEditPlan();
  check(
    'Edit plan includes terminal overlays',
    editPlan && Array.isArray(editPlan.terminalOverlays) && editPlan.terminalOverlays.length > 0,
    editPlan ? `${editPlan.terminalOverlays?.length || 0} terminal overlays` : 'missing edit plan'
  );
  const playbookPath = 'skills/bounded-capital-experiment-v1.SKILL.md';
  check(
    'Playbook artifact exists on disk',
    existsSync(playbookPath),
    existsSync(playbookPath) ? playbookPath : 'missing'
  );

  const cursorEvents = await loadCursorEvents();
  const clickCount = cursorEvents.filter((e) => e.type === 'click').length;
  check('Cursor events include at least one click', clickCount >= 1, `${clickCount} clicks across ${cursorEvents.length} events`);

  const terminalReport = await loadTerminalReport();
  if (terminalReport && terminalReport.config) {
    const { envelopeDollars, breachDollars } = terminalReport.config;
    check(
      'Terminal clips agree on $100 cap and $150 breach',
      envelopeDollars === 100 && breachDollars === 150,
      `cap=${envelopeDollars} breach=${breachDollars}`
    );
  } else {
    check('Terminal clips agree on $100 cap and $150 breach', false, 'missing capture-report-v14.json');
  }

  await fs.mkdir(frameDir, { recursive: true });

  const format = await ffprobeFormat();
  const duration = Number(format.duration);
  check('Duration ≤ 3 minutes', Number.isFinite(duration) && duration <= maxDuration, `${duration.toFixed(2)}s`);

  const streams = await ffprobeStreams();
  const videoStream = streams.find((s) => s.codec_name && s.width && s.height);
  const audioStream = streams.find((s) => s.sample_rate && s.channels);

  check('Video resolution', videoStream && videoStream.width === 1920 && videoStream.height === 1080, `${videoStream?.width}x${videoStream?.height}`);
  check('Video codec h264', videoStream?.codec_name === 'h264', videoStream?.codec_name || 'none');
  check('Audio codec AAC', audioStream?.codec_name === 'aac', audioStream?.codec_name || 'none');
  check('Audio 48 kHz stereo', audioStream && Number(audioStream.sample_rate) === 48000 && Number(audioStream.channels) === 2, `${audioStream?.sample_rate}Hz/${audioStream.channels}ch`);

  // Key-frame black check.
  const keyTimes = [0.5, 3, 20, 50, 65, 80, 115, Math.max(0, duration - 3)];
  let blackFrames = 0;
  for (const t of keyTimes) {
    const yavg = await getFrameYAvg(t);
    const isBlack = yavg !== null && yavg < blackThresholdY;
    if (isBlack) blackFrames++;
    console.log(`  frame @ ${t.toFixed(1)}s YAVG=${yavg?.toFixed(2) ?? 'n/a'} ${isBlack ? '(black)' : ''}`);
  }
  check('No all-black key frames', blackFrames === 0, `${blackFrames}/${keyTimes.length} key frames are black`);

  // Extract representative frames for optional manual inspection / OCR.
  for (const t of keyTimes) {
    await extractFrame(t, `frame-${Math.round(t * 10)}`);
  }

  // Loudness gate.
  const loudness = await getLoudness();
  if (loudness) {
    const inputI = Number(loudness.input_i);
    const inputTp = Number(loudness.input_tp);
    check('Integrated loudness in range', inputI >= loudnessMin && inputI <= loudnessMax, `${inputI.toFixed(2)} LUFS (target ${loudnessMin}…${loudnessMax})`);
    check('True peak ≤ -1 dBTP', inputTp <= -1, `${inputTp.toFixed(2)} dBTP`);
  } else {
    check('Integrated loudness in range', false, 'could not parse loudnorm output');
    check('True peak ≤ -1 dBTP', false, 'could not parse loudnorm output');
  }

  // Text verification: OCR preferred, fallback to metadata/source data.
  let ocrText = '';
  let textSource = 'none';
  if (!skipOcr) {
    ocrText = await ocrFrames(framePaths);
    if (ocrText) textSource = 'OCR';
  }
  let combinedText = ocrText;
  if (!ocrText) {
    const metadataText = await readMetadataText();
    const sourceText = await readSourceText();
    combinedText = `${metadataText} ${sourceText}`;
    textSource = 'metadata/source fallback';
  }

  const found = [];
  const missing = [];
  for (const phrase of requiredText) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (regex.test(combinedText)) found.push(phrase);
    else missing.push(phrase);
  }
  check(
    `Required text present (${textSource})`,
    missing.length === 0,
    `found: ${found.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}`
  );

  // Reject any in-frame mock/fallback/SIMULATED markers.
  const forbiddenFound = [];
  for (const phrase of forbiddenText) {
    if (new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(combinedText)) {
      forbiddenFound.push(phrase);
    }
  }
  check('No [mock]/[fallback]/SIMULATED text in source data', forbiddenFound.length === 0, forbiddenFound.length ? `found: ${forbiddenFound.join(', ')}` : 'clean');

  const allPass = checks.every((c) => c.pass);
  await writeReport(allPass);
  console.log(`\n${allPass ? 'QA PASSED' : 'QA FAILED'} (${checks.filter((c) => c.pass).length}/${checks.length} checks)`);
  process.exit(allPass ? 0 : 1);
}

async function writeReport(allPass) {
  const report = {
    video: videoPath,
    timestamp: new Date().toISOString(),
    overall: allPass ? 'PASS' : 'FAIL',
    checks,
    frames: framePaths,
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);
}

main().catch((err) => {
  console.error('QA script error:', err);
  process.exit(1);
});
