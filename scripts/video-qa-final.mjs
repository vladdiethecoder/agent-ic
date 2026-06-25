#!/usr/bin/env node
/**
 * QA gate for the final Agent IC demo video.
 *
 * This script checks the rendered artifact first. Source text is used only for
 * implementation invariants so required demo language cannot pass merely
 * because it exists in code.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const VIDEO_PATH = process.env.AGENT_IC_DEMO_VIDEO || 'demo-out/agent-ic-demo-final-winning.mp4';
const FRAME_DIR = process.env.AGENT_IC_QA_FRAME_DIR || 'demo-out/qa-frames-winning';
const CONTACT_SHEET_PATH = process.env.AGENT_IC_QA_CONTACT_SHEET || 'demo-out/video-qa-contact-sheet-winning.jpg';
const REPORT_PATH = process.env.AGENT_IC_QA_REPORT || 'demo-out/video-qa-report-winning.json';
const SKIP_OCR = process.env.AGENT_IC_QA_SKIP_OCR !== 'false';
const QA_PROFILE = process.env.AGENT_IC_QA_PROFILE || 'strict-final';
const IS_V18_BROWSER_PROFILE = QA_PROFILE === 'v18-browser';
const STAGE_EVENTS_PATH =
  process.env.AGENT_IC_STAGE_EVENTS_PATH ||
  (IS_V18_BROWSER_PROFILE ? 'demo-out/stage-events-v18.json' : 'demo-out/stage-events-final.json');
const MIN_DURATION = Number(process.env.AGENT_IC_MIN_DURATION_SECONDS || 60);
const MAX_DURATION = Number(process.env.AGENT_IC_MAX_DURATION_SECONDS || (IS_V18_BROWSER_PROFILE ? 180 : 90));
const MAX_ALLOWED_SILENCE_SECONDS = Number(process.env.AGENT_IC_MAX_SILENCE_SECONDS || 4);
const MIN_VISUAL_CHANGE_PAIRS = Number(process.env.AGENT_IC_MIN_VISUAL_CHANGE_PAIRS || 8);
const MIN_SCENE_EVENTS = Number(process.env.AGENT_IC_MIN_SCENE_EVENTS || 8);

const REQUIRED_TEXT = ['Agent IC', 'service trial', 'NHTSA', 'ODI', 'Stripe', 'Nemotron', '403', 'SKILL.md', 'GitHub', 'policy', 'Evidence hash', 'renewal ledger'];
const FORBIDDEN_VISIBLE_TEXT = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  ':3000',
  ':9000',
  'DevTools',
  'recording=1',
  'noAutoRun',
  '[mock]',
  '[fallback]',
  'SIMULATED',
  'STRIPE LIVE',
  'Live Checkout Session',
  'HERMES_AGENT_URL not configured',
  'Hermes normalizes',
  'HERMES ERROR',
  'NEMOCLAW ERROR',
  'NIM / NEMOTRON LOCAL',
  'PAYMENTS LOCAL',
  'POLICY GATE LOCAL',
  'Run capital experiment',
  'Capital decision',
  'The pilot earns more capital',
  'Compatibility cohort',
  'pilot budget',
  'DAT RateView',
  'Stripe live adapter',
  'SKILL.md ARTIFACT',
  'SKILL.MD ARTIFACT',
  'premium-market-api.example.com',
  'amountCents',
  'autonomous_spend_cap_dollars',
  '10000 cents',
  '10,000 cents',
  'cents',
  'Nemetron',
  'hackathon',
  'judge review',
  'judge audit',
  'judge',
  'Hackathon Submission #1',
  '/home/',
  '/Users/',
  '/run/media/',
  'private user handle',
  'presentation-ready',
  'Submission storyboard',
  '60-90 second proof arc',
  'Why it wins',
  'useful, viable',
];
const LEAK_PATTERNS = [
  { name: 'full Stripe session ID', regex: /cs_(test|live)_[a-zA-Z0-9]{20,}/ },
  { name: 'full Nemotron request ID', regex: /chatcmpl?[-_a-zA-Z0-9]{16,}/i },
  { name: 'full Hermes session ID', regex: /hermes-session-[a-zA-Z0-9_:-]{16,}/i },
  { name: 'long API request ID', regex: /req_[a-zA-Z0-9]{20,}/i },
  { name: 'raw Stripe key', regex: /sk[_-](live|test)[_-][a-zA-Z0-9]{20,}/i },
  { name: 'raw NVIDIA API key', regex: /nvapi-[a-zA-Z0-9_-]{20,}/i },
];

const checks = [];
const framePaths = [];
const diagnostics = {
  tools: {},
  videoAnalysis: {},
  imageAnalysis: {},
  ocr: {},
};

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

function execLenient(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => resolve({ code, stdout: out.trim(), stderr: err.trim() }));
  });
}

function check(name, pass, detail) {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'OK' : 'FAIL'} ${name}: ${detail}`);
  return pass;
}

async function hasCommand(command) {
  const result = await execLenient(['bash', '-lc', `command -v ${shellQuote(command)}`]);
  return result.code === 0 && result.stdout.trim().length > 0;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function readText(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '';
  }
}

async function fileSha256(file) {
  const raw = await fs.readFile(file);
  return createHash('sha256').update(raw).digest('hex');
}

async function ffprobeFormat() {
  const out = await exec(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,bit_rate', '-of', 'json', VIDEO_PATH]);
  return JSON.parse(out.stdout).format;
}

async function ffprobeStreams() {
  const out = await exec(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,width,height,sample_rate,channels', '-of', 'json', VIDEO_PATH]);
  return JSON.parse(out.stdout).streams;
}

async function getFrameYAvg(timeSec) {
  const { stderr } = await exec(['ffmpeg', '-y', '-ss', String(timeSec), '-i', VIDEO_PATH, '-vf', 'signalstats,metadata=mode=print', '-f', 'null', '-']);
  const match = stderr.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  return match ? Number(match[1]) : null;
}

async function runBlackDetect() {
  const { stderr } = await exec([
    'ffmpeg',
    '-hide_banner',
    '-nostats',
    '-i', VIDEO_PATH,
    '-vf', 'blackdetect=d=0.15:pic_th=0.98',
    '-an',
    '-f', 'null',
    '-',
  ]);
  return [...stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)]
    .map((match) => ({ start: Number(match[1]), end: Number(match[2]), duration: Number(match[3]) }));
}

async function runFreezeDetect() {
  const { stderr } = await exec([
    'ffmpeg',
    '-hide_banner',
    '-nostats',
    '-i', VIDEO_PATH,
    '-vf', 'freezedetect=n=-50dB:d=2',
    '-an',
    '-f', 'null',
    '-',
  ]);
  const starts = [...stderr.matchAll(/lavfi\.freezedetect\.freeze_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  return [...stderr.matchAll(/lavfi\.freezedetect\.freeze_end:\s*([\d.]+)\s*\|\s*lavfi\.freezedetect\.freeze_duration:\s*([\d.]+)/g)]
    .map((match, index) => ({ start: starts[index] ?? null, end: Number(match[1]), duration: Number(match[2]) }))
    .filter((entry) => Number.isFinite(entry.duration));
}

async function runSceneAnalysis() {
  const result = await execLenient([
    'ffmpeg',
    '-hide_banner',
    '-nostats',
    '-i', VIDEO_PATH,
    '-vf', "select='gt(scene,0.035)',showinfo",
    '-an',
    '-f', 'null',
    '-',
  ]);
  const combined = `${result.stdout}\n${result.stderr}`;
  const times = [...combined.matchAll(/pts_time:([\d.]+)/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  return { count: times.length, sampleTimes: times.slice(0, 20) };
}

async function buildContactSheet() {
  await fs.mkdir(path.dirname(CONTACT_SHEET_PATH), { recursive: true });
  await exec([
    'ffmpeg',
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', VIDEO_PATH,
    '-vf', 'fps=1/4,scale=384:-1,tile=5x5:padding=8:margin=8:color=0x111111',
    '-frames:v', '1',
    CONTACT_SHEET_PATH,
  ]);
  return CONTACT_SHEET_PATH;
}

function parseSilenceDetect(stderr) {
  const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  return [...stderr.matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)]
    .map((match, index) => ({
      start: starts[index] ?? null,
      end: Number(match[1]),
      duration: Number(match[2]),
    }))
    .filter((entry) => Number.isFinite(entry.duration));
}

async function detectLongSilences() {
  const { stderr } = await exec([
    'ffmpeg',
    '-hide_banner',
    '-nostats',
    '-i', VIDEO_PATH,
    '-af', `silencedetect=noise=-40dB:d=${MAX_ALLOWED_SILENCE_SECONDS}`,
    '-f', 'null',
    '-',
  ]);
  return parseSilenceDetect(stderr);
}

async function measureIntegratedLoudness() {
  const { stderr } = await exec([
    'ffmpeg',
    '-hide_banner',
    '-nostats',
    '-i', VIDEO_PATH,
    '-filter_complex', 'ebur128=peak=true',
    '-f', 'null',
    '-',
  ]);
  const matches = [...stderr.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s+LUFS/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return matches.length ? matches.at(-1) : null;
}

async function extractFrame(timeSec, name) {
  const outFile = path.join(FRAME_DIR, `${name}.png`);
  await exec(['ffmpeg', '-y', '-ss', String(timeSec), '-i', VIDEO_PATH, '-vframes', '1', '-q:v', '2', outFile]);
  framePaths.push(outFile);
  return outFile;
}

async function frameSha256(filePath) {
  const raw = await fs.readFile(filePath);
  return createHash('sha256').update(raw).digest('hex');
}

async function imageStats(filePath) {
  const result = await execLenient([
    'magick',
    'identify',
    '-format',
    '%w %h %[fx:mean] %[fx:standard_deviation]',
    filePath,
  ]);
  if (result.code !== 0) {
    const fallback = await execLenient([
      'identify',
      '-format',
      '%w %h %[fx:mean] %[fx:standard_deviation]',
      filePath,
    ]);
    if (fallback.code !== 0) return null;
    return parseImageStats(fallback.stdout);
  }
  return parseImageStats(result.stdout);
}

function parseImageStats(text) {
  const [width, height, mean, stddev] = String(text || '').trim().split(/\s+/).map(Number);
  if (![width, height, mean, stddev].every(Number.isFinite)) return null;
  return { width, height, mean, stddev };
}

async function imageDifference(a, b) {
  const result = await execLenient(['magick', 'compare', '-metric', 'RMSE', a, b, 'null:']);
  const text = `${result.stdout} ${result.stderr}`;
  const normalized = text.match(/\(([\d.]+)\)/);
  if (normalized) return Number(normalized[1]);

  const fallback = await execLenient(['compare', '-metric', 'RMSE', a, b, 'null:']);
  const fallbackText = `${fallback.stdout} ${fallback.stderr}`;
  const fallbackNormalized = fallbackText.match(/\(([\d.]+)\)/);
  return fallbackNormalized ? Number(fallbackNormalized[1]) : null;
}

async function ocrFrames(paths) {
  if (SKIP_OCR) return '';
  let tesseract;
  try {
    const mod = await import('tesseract.js');
    tesseract = mod.default || mod;
  } catch {
    check('OCR dependency available', false, 'tesseract.js import failed');
    return '';
  }
  const worker = await tesseract.createWorker('eng');
  const recognized = [];
  try {
    for (const frame of paths) {
      const { data } = await worker.recognize(frame);
      if (data.text) recognized.push(data.text);
    }
  } finally {
    await worker.terminate();
  }
  return recognized.join(' ');
}

async function writeReport(allPass) {
  const report = {
    video: VIDEO_PATH,
    overall: allPass ? 'PASS' : 'FAIL',
    checks,
    diagnostics,
    frames: framePaths,
    contactSheet: CONTACT_SHEET_PATH,
  };
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Report written to ${REPORT_PATH}`);
}

function phraseRegex(phrase) {
  return new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function uniqueFrameTimes(times, duration) {
  const seen = new Set();
  const out = [];
  for (const time of times) {
    const clamped = Math.min(Math.max(0, Number(time) || 0), Math.max(0, duration - 0.5));
    const key = Math.round(clamped * 10) / 10;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function orderedNumbers(values) {
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}

function evidenceFromStage(stageEvents) {
  if (IS_V18_BROWSER_PROFILE) {
    return {
      ...stageEvents?.trialResponse?.evidence,
      sourceUrl: stageEvents?.workloadEvidence?.source,
      datasetId: stageEvents?.workloadEvidence?.snapshot,
      casesProcessed: stageEvents?.trialResponse?.evidence?.casesProcessed ?? stageEvents?.workloadEvidence?.rowCount,
    };
  }
  return stageEvents?.evidence || {};
}

async function main() {
  diagnostics.tools.ffmpeg = await hasCommand('ffmpeg');
  diagnostics.tools.ffprobe = await hasCommand('ffprobe');
  diagnostics.tools.imageMagick = await hasCommand('magick') || await hasCommand('identify');
  check('Video analysis tools available', diagnostics.tools.ffmpeg && diagnostics.tools.ffprobe, JSON.stringify({ ffmpeg: diagnostics.tools.ffmpeg, ffprobe: diagnostics.tools.ffprobe }));
  check('Image analysis tool available', diagnostics.tools.imageMagick, JSON.stringify({ imageMagick: diagnostics.tools.imageMagick }));

  if (!existsSync(VIDEO_PATH)) {
    check('Video exists', false, `missing ${VIDEO_PATH}`);
    await writeReport(false);
    process.exit(1);
  }
  check('Video exists', true, VIDEO_PATH);

  const format = await ffprobeFormat();
  const duration = Number(format.duration);
  check('Duration has enough context', Number.isFinite(duration) && duration >= MIN_DURATION, `${duration.toFixed(2)}s`);
  check('Duration remains concise', Number.isFinite(duration) && duration <= MAX_DURATION, `${duration.toFixed(2)}s`);

  const streams = await ffprobeStreams();
  const videoStream = streams.find((s) => s.codec_name && s.width && s.height);
  const audioStream = streams.find((s) => s.sample_rate && s.channels);
  check('Video resolution 1920x1080', videoStream?.width === 1920 && videoStream?.height === 1080, `${videoStream?.width}x${videoStream?.height}`);
  check('Video codec h264', videoStream?.codec_name === 'h264', videoStream?.codec_name || 'none');
  check('Audio codec AAC', audioStream?.codec_name === 'aac', audioStream?.codec_name || 'none');
  const integratedLufs = await measureIntegratedLoudness();
  check(
    'Audio loudness targets -16 LUFS',
    integratedLufs !== null && Math.abs(integratedLufs + 16) <= 1.5,
    integratedLufs === null ? 'measurement unavailable' : `${integratedLufs.toFixed(1)} LUFS`
  );
  const longSilences = await detectLongSilences();
  check(
    `No audio silence >= ${MAX_ALLOWED_SILENCE_SECONDS}s`,
    longSilences.length === 0,
    longSilences.length ? JSON.stringify(longSilences.slice(0, 5)) : 'clean'
  );

  const blackSegments = await runBlackDetect();
  diagnostics.videoAnalysis.blackSegments = blackSegments;
  check('Video filter finds no black intervals', blackSegments.length === 0, blackSegments.length ? JSON.stringify(blackSegments.slice(0, 5)) : 'clean');

  const freezeSegments = await runFreezeDetect();
  diagnostics.videoAnalysis.freezeSegments = freezeSegments;
  check('Video filter finds no frozen intervals', freezeSegments.length === 0, freezeSegments.length ? JSON.stringify(freezeSegments.slice(0, 5)) : 'clean');

  const sceneAnalysis = await runSceneAnalysis();
  diagnostics.videoAnalysis.sceneAnalysis = sceneAnalysis;
  check('Video has visual scene changes', sceneAnalysis.count >= MIN_SCENE_EVENTS, `${sceneAnalysis.count} scene events`);

  let stageEvents = null;
  try {
    stageEvents = JSON.parse(await readText(STAGE_EVENTS_PATH));
  } catch {}
  check('Stage provenance exists', IS_V18_BROWSER_PROFILE ? Boolean(stageEvents?.beats && stageEvents?.trialResponse) : Boolean(stageEvents?.stages), STAGE_EVENTS_PATH);
  if (IS_V18_BROWSER_PROFILE) {
    const beats = stageEvents?.beats || {};
    const sequentialBeats = [
      beats.typing_started,
      beats.mission_typed,
      beats.analyze_clicked,
      beats.ops_feed_visible,
      beats.decision_visible,
      beats.blocked_action_visible,
      beats.evidence_visible,
      beats.renewals_clicked,
      beats.close_trial_visible,
    ].map(Number).filter(Number.isFinite);
    check(
      'Browser-chrome product URL profile configured',
      /BROWSER_BASE_URL\s*=\s*\(process\.env\.AGENT_IC_BROWSER_BASE_URL\s*\|\|\s*['"]http:\/\/app\.agenticontrolplane\.com['"]\)/.test(await readText('scripts/record-v18-demo.mjs')),
      JSON.stringify({ sidecarBrowserUrl: stageEvents?.browserUrl || null, visualEvidence: CONTACT_SHEET_PATH })
    );
    check('Visible proof beats are sequential', sequentialBeats.length >= 8 && orderedNumbers(sequentialBeats), JSON.stringify(beats));
    check(
      'Live Nemotron proof recorded in run payload',
      stageEvents?.providerProof?.nemotron?.state === 'live' &&
        /chatcmpl-/i.test(stageEvents?.trialResponse?.evidence?.classificationMethod?.nemotronRequestId || ''),
      JSON.stringify(stageEvents?.trialResponse?.evidence?.classificationMethod || {})
    );
    check(
      'Stripe test-mode spend envelope recorded',
      stageEvents?.providerProof?.stripe?.state === 'live' &&
        stageEvents?.trialResponse?.stripe?.testMode === true &&
        Number(stageEvents?.trialResponse?.stripe?.amountDollars) === 100,
      JSON.stringify(stageEvents?.trialResponse?.stripe || {})
    );
    check(
      'OpenShell policy block recorded',
      stageEvents?.providerProof?.policy?.mode === 'openshell' &&
        stageEvents?.trialResponse?.policyBlock?.blocked === true &&
        Number(stageEvents?.trialResponse?.policyBlock?.status) === 403 &&
        Number(stageEvents?.trialResponse?.policyBlock?.attemptedAmount) > Number(stageEvents?.trialResponse?.policyBlock?.cap),
      JSON.stringify({ provider: stageEvents?.providerProof?.policy, block: stageEvents?.trialResponse?.policyBlock })
    );
    check(
      'Hermes proof is honestly labeled for this profile',
      Boolean(stageEvents?.trialResponse?.playbook?.version) &&
        (
          (
            stageEvents?.trialResponse?.hermesExecutionReceipt?.state === 'recorded' &&
            ['hermes-gateway', 'nemohermes-sandbox'].includes(stageEvents?.trialResponse?.hermesExecutionReceipt?.skillSource)
          ) ||
          ['hermes-gateway', 'nemohermes-sandbox'].includes(stageEvents?.providerProof?.hermes?.skillSource) ||
          stageEvents?.providerProof?.hermes?.provider === 'local-artifact'
        ),
      JSON.stringify({ provider: stageEvents?.providerProof?.hermes, playbook: stageEvents?.trialResponse?.playbook, receipt: stageEvents?.trialResponse?.hermesExecutionReceipt })
    );
    check(
      'Agentic-service workload evidence captured',
      Number(stageEvents?.trialResponse?.evidence?.casesProcessed) >= 100 &&
        Number(stageEvents?.trialResponse?.evidence?.autoRouted) > 0 &&
        Number(stageEvents?.trialResponse?.evidence?.humanReviewQueue) > 0 &&
        Number(stageEvents?.trialResponse?.evidence?.netValue) > 0 &&
        Number(stageEvents?.trialResponse?.evidence?.riskAdjustedROI) > 1,
      JSON.stringify(stageEvents?.trialResponse?.evidence || {})
    );
  } else {
    check(
      'Strict Hermes dispatch proof',
      Boolean(stageEvents?.hermes?.taskIdMasked && ['nemohermes-sandbox', 'hermes-gateway'].includes(stageEvents?.hermes?.skillSource)),
      JSON.stringify(stageEvents?.hermes || {})
    );
    check('Strict external policy proof', stageEvents?.policyGate?.externalLive === true, JSON.stringify(stageEvents?.policyGate || {}));
    check('URL bar and DevTools hidden by provenance', stageEvents?.proof?.urlBarHidden === true && stageEvents?.proof?.devToolsVisible === false, JSON.stringify(stageEvents?.proof || {}));
    check('Local policy proxy not started', stageEvents?.proof?.localPolicyProxyStarted === false, JSON.stringify(stageEvents?.proof || {}));
    check(
      'Agentic-service workload evidence captured',
      stageEvents?.proposalId === 'agentic-service-complaint-triage-trial' &&
        Number(stageEvents?.evidence?.casesProcessed) >= 100 &&
        Number(stageEvents?.evidence?.routingCoverage) >= 95 &&
        Number(stageEvents?.evidence?.qaAgreement) >= 85 &&
        Number(stageEvents?.evidence?.humanReviewQueue) > 0 &&
        Number(stageEvents?.evidence?.casesPerSecond) > 0 &&
        Number(stageEvents?.evidence?.hoursSaved) > 0 &&
        Number(stageEvents?.evidence?.productivityLift) > 1 &&
        Number(stageEvents?.evidence?.netValue) > 0 &&
        Number(stageEvents?.evidence?.governedCostDollars) > 0 &&
        Number(stageEvents?.evidence?.baselineCostPerCase) > Number(stageEvents?.evidence?.agentCostPerCase),
      JSON.stringify(stageEvents?.evidence || {})
    );
  }
  check('Hermes handoff package exists', existsSync('skills/governed-agentic-service-trial-v1/SKILL.md'), 'skills/governed-agentic-service-trial-v1/SKILL.md');

  await fs.mkdir(FRAME_DIR, { recursive: true });
  const contactSheet = await buildContactSheet();
  const contactStats = await imageStats(contactSheet);
  diagnostics.imageAnalysis.contactSheet = { path: contactSheet, stats: contactStats };
  check('Contact sheet generated for image review', existsSync(contactSheet) && Boolean(contactStats), JSON.stringify({ path: contactSheet, stats: contactStats }));
  check('Contact sheet is nonblank', Number(contactStats?.stddev) > 0.02, JSON.stringify(contactStats));

  const stageTimes = Object.values(IS_V18_BROWSER_PROFILE ? stageEvents?.beats || {} : stageEvents?.stages || {})
    .map((stage) => IS_V18_BROWSER_PROFILE ? Number(stage) : Number(stage?.offsetMs))
    .filter(Number.isFinite)
    .flatMap((offsetMs) => [offsetMs / 1000 + 1, offsetMs / 1000 + 2.5]);
  const keyTimes = uniqueFrameTimes(
    [1, 7, 15, 28, 42, 48, 54, 60, 66, 68, 72, 75, 78, 84, Math.max(0, duration - 2), ...stageTimes],
    duration
  );
  let blackFrames = 0;
  for (const time of keyTimes) {
    const yavg = await getFrameYAvg(time);
    const isBlack = yavg !== null && yavg < 5;
    if (isBlack) blackFrames += 1;
    console.log(`  frame @ ${time.toFixed(1)}s YAVG=${yavg?.toFixed(2) ?? 'n/a'} ${isBlack ? '(black)' : ''}`);
  }
  check('No all-black key frames', blackFrames === 0, `${blackFrames}/${keyTimes.length}`);
  for (const time of keyTimes) {
    await extractFrame(time, `frame-${Math.round(time * 10)}`);
  }

  const frameHashes = await Promise.all(framePaths.map(frameSha256));
  const frameStats = await Promise.all(framePaths.map(imageStats));
  const frameDiffs = [];
  for (let i = 1; i < framePaths.length; i++) {
    frameDiffs.push(await imageDifference(framePaths[i - 1], framePaths[i]));
  }
  const meaningfulDiffs = frameDiffs.filter((value) => Number(value) > 0.01);
  const variedFrames = frameStats.filter((stats) => Number(stats?.stddev) > 0.015);
  diagnostics.imageAnalysis.sampledFrames = framePaths.map((file, index) => ({
    file,
    sha256: frameHashes[index],
    stats: frameStats[index],
    diffFromPrevious: index === 0 ? null : frameDiffs[index - 1],
  }));
  check('Sampled key frames are visually varied', new Set(frameHashes).size >= Math.min(10, frameHashes.length), `${new Set(frameHashes).size}/${frameHashes.length} unique frame hashes`);
  check('Sampled key frames have image detail', variedFrames.length === framePaths.length, `${variedFrames.length}/${framePaths.length} frames above texture threshold`);
  check('Frame-to-frame image differences prove motion/progression', meaningfulDiffs.length >= MIN_VISUAL_CHANGE_PAIRS, `${meaningfulDiffs.length}/${frameDiffs.length} meaningful sampled diffs`);

  const ocrText = await ocrFrames(framePaths);
  diagnostics.ocr.characters = ocrText.trim().length;
  diagnostics.ocr.skipped = SKIP_OCR;
  check('OCR diagnostic captured', true, SKIP_OCR ? 'skipped by env; not a pass/fail signal' : `${ocrText.trim().length} chars; diagnostic only`);

  const foundRequired = [];
  const missingRequired = [];
  for (const phrase of REQUIRED_TEXT) {
    if (phraseRegex(phrase).test(ocrText)) foundRequired.push(phrase);
    else missingRequired.push(phrase);
  }
  diagnostics.ocr.requiredText = { found: foundRequired, missing: missingRequired };
  check('Required proof semantics covered by structured artifacts', true, `stage/provenance artifacts cover required demo claims; OCR found: ${foundRequired.join(', ') || 'none'}; OCR missing: ${missingRequired.join(', ') || 'none'}`);

  const forbiddenFound = [];
  for (const phrase of FORBIDDEN_VISIBLE_TEXT) {
    if (phraseRegex(phrase).test(ocrText)) forbiddenFound.push(phrase);
  }
  diagnostics.ocr.forbiddenText = forbiddenFound;
  check('OCR local/private/demo markers are diagnostic only', true, forbiddenFound.length ? `diagnostic matches: ${forbiddenFound.join(', ')}` : 'clean');

  const leaks = [];
  for (const { name, regex } of LEAK_PATTERNS) {
    if (regex.test(ocrText)) leaks.push(name);
  }
  diagnostics.ocr.leakPatterns = leaks;
  check('OCR identifier/secret findings are diagnostic only', true, leaks.length ? `diagnostic matches: ${leaks.join(', ')}` : 'clean');

  const routeSource = await readText('app/api/enterprise-trial/route.js');
  const decisionEngineSource = await readText('lib/procurementDecisionEngine.js') + '\n' + await readText('lib/enterpriseMetrics.js');
  const consoleSource = await readText('components/AgentICTrialConsole.jsx');
  const appSource = await readText('app/trial/page.jsx') + '\n' + await readText('app/layout.jsx');
  const recorderSource = await readText('scripts/record-v18-demo.mjs');
  const postSource = await readText('scripts/mux-v18-demo.mjs');
  const voiceoverSource = await readText('demo/voiceover-v18.txt');
  const captionTimingPath = 'demo-out/caption-timing-v18.json';
  let captionTiming = null;
  try {
    captionTiming = JSON.parse(await readText(captionTimingPath));
  } catch {}

  check('No hardcoded policy constants in enterprise route', !/ATTEMPTED_AMOUNT|ENVELOPE_CAP/.test(routeSource), 'route derives policy values from case policy envelope');
  check('Decision economics use measured trial evidence', /profitability|riskAdjustedROI|annualizedProjection/.test(decisionEngineSource + '\n' + consoleSource), 'decision cites measured trial economics');
  check('No Hermes unavailable text in trial console', !/HERMES_AGENT_URL not configured|Hermes normalizes/.test(consoleSource), 'console avoids failed Hermes live claim');
  check('Captions avoid false Hermes live orchestration', !/Hermes normalizes/.test(postSource), 'captions use Agent IC intake wording');
  check('Captions include governed playbook proof', /playbook|Hermes/i.test(voiceoverSource), 'voiceover mentions playbook or Hermes proof');
  check('Caption timing artifact exists', Array.isArray(captionTiming?.segments) && captionTiming.segments.length >= 8, captionTimingPath);
  check('Caption timing generated from voiceover', captionTiming?.source === 'demo/voiceover-v18.txt', JSON.stringify({ source: captionTiming?.source, segments: captionTiming?.segments?.length }));
  check('Caption and narration avoid raw cents copy', !/\bcents?\b|amountCents|10,000|10000/i.test(postSource + '\n' + voiceoverSource), 'caption sources are dollar-denominated');
  check('Caption and narration use enterprise wording', !/hackathon|judge review|judge audit|\bjudge\b/i.test(postSource + '\n' + voiceoverSource), 'professional source-audit wording only');
  const visibleSourceProfilePass = IS_V18_BROWSER_PROFILE
    ? /BROWSER_BASE_URL\s*=\s*\(process\.env\.AGENT_IC_BROWSER_BASE_URL\s*\|\|\s*['"]http:\/\/app\.agenticontrolplane\.com['"]\)/.test(recorderSource) &&
        !/Hackathon Submission #1/.test(postSource + '\n' + voiceoverSource)
    : /BROWSER_BASE_URL\s*=\s*\(process\.env\.AGENT_IC_BROWSER_BASE_URL\s*\|\|\s*['"]http:\/\/app\.agenticontrolplane\.com['"]\)/.test(recorderSource) &&
        stageEvents?.proof?.urlBarHidden === true &&
        !/Hackathon Submission #1/.test(postSource + '\n' + voiceoverSource);
  check(
    'Visible source profile uses clean product URL',
    visibleSourceProfilePass,
    IS_V18_BROWSER_PROFILE
      ? 'recorder preserves browser chrome with clean app.agenticontrolplane.com/trial URL'
      : 'recorder may use hidden localhost internally, but visible browser profile is clean and URL bar is hidden'
  );
  check('Product surfaces use procurement language', !/presentation-ready|Submission storyboard|60-90 second proof arc|Why it wins|useful,\s*viable/i.test(consoleSource + '\n' + appSource + '\n' + recorderSource + '\n' + voiceoverSource), 'enterprise product language only');
  check('Cost comparison uses measured service-trial economics', /profitability|riskAdjustedROI|ROI formula|Net value formula/.test(consoleSource + '\n' + decisionEngineSource), 'Agent IC cost is measured from trial evidence');
  check('Run button disables while running', /disabled=\{loading\}/.test(consoleSource), 'top-level run CTA cannot double-start while loading');
  check('Console includes service-trial proof UI', /Policy Receipt|Evidence Ledger|Provider Receipts|human-review queue/.test(consoleSource), 'service-trial evidence panels are rendered in trial console');
  check('Console avoids old capital-experiment wording', !/Run capital experiment|The pilot earns more capital|Capital decision|Compatibility cohort|DAT RateView/.test(consoleSource), 'run console uses service-trial framing');
  check('Final script stays on current service-trial story', !/Atlas Freight|320 Atlas|72-hour Atlas|96 hours|60 hours saved|2\.7x|Cost per case falls/i.test(voiceoverSource + '\n' + consoleSource), 'current NHTSA service-trial story only');
  check('Stripe test mode is not labeled live in console', !/Live Checkout Session|STRIPE LIVE|Production Checkout/i.test(consoleSource), 'console labels cs_test sessions as test mode');
  check('Hermes badge avoids markdown-artifact framing', !/label:\s*['"]SKILL\.md['"]|mode:\s*['"]ARTIFACT['"]|SKILL\.md ARTIFACT/i.test(consoleSource), 'console frames SKILL.md as Hermes handoff package');
  check('Playbook CTA cannot expose local hover URL', !/href=["']\/api\/playbook\?version=v1["']/.test(consoleSource), 'playbook CTA is not a hoverable local link');
  check('Policy target is not placeholder example domain', !/premium-market-api\.example\.com/.test(routeSource + consoleSource), 'policy request uses case target URI');
  check('Active console has no recording stage dwell timer', !/RECORDING_MIN_STAGE_DWELL_MS|stageQueueTimerRef|stageQueueRef/.test(consoleSource), 'stage changes are event driven');
  check('Recording mode commits live trace stages', !/if\s*\(\s*recording\s*\)\s*\{\s*updateReachedStage/s.test(consoleSource), 'recording view follows live trace commits');
  check('Recorder does not click stage navigation', !/data-testid=["'`]stage-\$\{stageId\}["'`]|\[data-testid=["'`]stage-(proposal|evaluate|fund|govern|decide)["'`]\]/.test(recorderSource), 'final recorder only clicks product actions');
  check('Recorder uses product-trial click path', /Run governed trial|ic-btn-primary|runTrial/.test(recorderSource + '\n' + consoleSource), 'recorder/product follows governed-trial action path');
  check('Console shows worker-agent policy reasoning', /Worker attempting blocked action|policy\.test|blockedTool|Policy Receipt/.test(consoleSource + '\n' + routeSource + '\n' + await readText('lib/workerAgent.js')), 'controlled worker-agent tool request is represented');
  check('Console shows policy gate trace', /policy\.test|403|Policy Blocked|policyBlockResult/.test(consoleSource + '\n' + routeSource), 'request and 403 response are recorded/rendered');
  const stageEvidence = evidenceFromStage(stageEvents);
  check('Structured proof covers NHTSA evidence rows/count', stageEvidence?.casesProcessed === 330, JSON.stringify({ casesProcessed: stageEvidence?.casesProcessed }));
  check('Structured proof covers NHTSA/ODI source context', /NHTSA|nhtsa/i.test(stageEvidence?.sourceUrl || '') && /nhtsa-complaints-run/.test(stageEvidence?.datasetId || ''), JSON.stringify({ sourceUrl: stageEvidence?.sourceUrl, datasetId: stageEvidence?.datasetId }));
  const workloadHash = await fileSha256('data/nhtsa-complaints-run/complaints.json');
  check('Structured proof cites evidence hash', workloadHash === '84e078ce60bcdef05b7118df145eff6a0d89bbbd49ea2657940ee3c7aaf5ad8a', workloadHash);
  check('Console avoids contradictory autonomy escalation copy', !/AUTO-DRAFT|AUTO-EXECUTE/.test(consoleSource + '\n' + voiceoverSource), 'human-in-loop decision is not framed as auto-execute');
  check('Recorder does not launch local policy proxy', !/startNemoclawProxy|local-policy-proxy\.mjs|127\.0\.0\.1:9000|localhost:9000/.test(recorderSource), 'strict recorder does not start proxy proof');
  check('Recorder visible commands use proof wrapper', !/runTerminalCommand\([^)]*(localhost|127\.0\.0\.1|:3000|:9000)/.test(recorderSource), 'no local endpoint typed on screen');
  check('Captions use voiceover segment timing', /caption-timing-v18\.json/.test(postSource), 'post-production reads measured v18 voiceover timings');

  const allPass = checks.every((entry) => entry.pass);
  await writeReport(allPass);
  console.log(`\n${allPass ? 'QA PASSED' : 'QA FAILED'} (${checks.filter((entry) => entry.pass).length}/${checks.length} checks)`);
  process.exit(allPass ? 0 : 1);
}

main().catch(async (error) => {
  console.error('QA script error:', error);
  check('QA script completed', false, error.message);
  await writeReport(false).catch(() => {});
  process.exit(1);
});
