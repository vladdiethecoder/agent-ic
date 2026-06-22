#!/usr/bin/env node
/**
 * QA gate for the final Agent IC demo video.
 *
 * This script checks the rendered artifact first. Source text is used only for
 * implementation invariants so required demo language cannot pass merely
 * because it exists in code.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const VIDEO_PATH = process.env.AGENT_IC_DEMO_VIDEO || 'demo-out/agent-ic-demo-final.mp4';
const FRAME_DIR = process.env.AGENT_IC_QA_FRAME_DIR || 'demo-out/qa-frames-final';
const REPORT_PATH = process.env.AGENT_IC_QA_REPORT || 'demo-out/video-qa-report-final.json';
const SKIP_OCR = process.env.AGENT_IC_QA_SKIP_OCR === 'true';
const MIN_DURATION = 60;
const MAX_DURATION = 90;
const MAX_ALLOWED_SILENCE_SECONDS = Number(process.env.AGENT_IC_MAX_SILENCE_SECONDS || 4);

const REQUIRED_TEXT = ['Agent IC', 'service trial', 'NHTSA', 'ODI', 'Stripe', 'cs_test', 'Nemotron', '403', 'SKILL.md', 'Run from playbook', 'GitHub', 'Hermes', 'rationale', 'worker-agent', 'policy', 'Live gate trace'];
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
  '/home/vdubrov',
  'vdubrov',
  'vladdiethecoder',
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
  console.log(`${pass ? 'OK' : 'FAIL'} ${name}: ${detail}`);
  return pass;
}

async function readText(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '';
  }
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
    timestamp: new Date().toISOString(),
    overall: allPass ? 'PASS' : 'FAIL',
    checks,
    frames: framePaths,
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

async function main() {
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

  const stageEventsPath = 'demo-out/stage-events-final.json';
  let stageEvents = null;
  try {
    stageEvents = JSON.parse(await readText(stageEventsPath));
  } catch {}
  check('Stage provenance exists', Boolean(stageEvents?.stages), stageEventsPath);
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
  check('Hermes handoff package exists', existsSync('skills/governed-agentic-service-trial-v1.SKILL.md'), 'skills/governed-agentic-service-trial-v1.SKILL.md');

  await fs.mkdir(FRAME_DIR, { recursive: true });
  const stageTimes = Object.values(stageEvents?.stages || {})
    .map((stage) => Number(stage?.offsetMs))
    .filter(Number.isFinite)
    .flatMap((offsetMs) => [offsetMs / 1000 + 1, offsetMs / 1000 + 2.5]);
  const keyTimes = uniqueFrameTimes(
    [1, 7, 15, 28, 42, 60, 78, Math.max(0, duration - 2), ...stageTimes],
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

  const ocrText = await ocrFrames(framePaths);
  check('OCR text captured', SKIP_OCR || ocrText.trim().length > 0, SKIP_OCR ? 'skipped by env' : `${ocrText.trim().length} chars`);

  const foundRequired = [];
  const missingRequired = [];
  for (const phrase of REQUIRED_TEXT) {
    if (phraseRegex(phrase).test(ocrText)) foundRequired.push(phrase);
    else missingRequired.push(phrase);
  }
  check('Required visible text present', missingRequired.length === 0, `found: ${foundRequired.join(', ') || 'none'}; missing: ${missingRequired.join(', ') || 'none'}`);

  const forbiddenFound = [];
  for (const phrase of FORBIDDEN_VISIBLE_TEXT) {
    if (phraseRegex(phrase).test(ocrText)) forbiddenFound.push(phrase);
  }
  check('No visible local/private/demo markers', forbiddenFound.length === 0, forbiddenFound.length ? `found: ${forbiddenFound.join(', ')}` : 'clean');

  const leaks = [];
  for (const { name, regex } of LEAK_PATTERNS) {
    if (regex.test(ocrText)) leaks.push(name);
  }
  check('No visible full identifiers or secrets', leaks.length === 0, leaks.length ? `leaks: ${leaks.join(', ')}` : 'clean');

  const routeSource = await readText('app/api/run-capital-experiment-v8/route.js');
  const decisionEngineSource = await readText('lib/decisionEngine.js');
  const consoleSource = await readText('components/AgentICRunConsole-v14.jsx');
  const appSource = await readText('components/AgentICApp.jsx');
  const recorderSource = await readText('scripts/record-live-demo.mjs');
  const postSource = await readText('scripts/post-produce-final.mjs');
  const voiceoverSource = await readText('demo/voiceover-final.txt');
  const captionTimingPath = 'demo-out/caption-timing-final.json';
  let captionTiming = null;
  try {
    captionTiming = JSON.parse(await readText(captionTimingPath));
  } catch {}

  check('No hardcoded policy constants in v8 route', !/ATTEMPTED_AMOUNT|ENVELOPE_CAP/.test(routeSource), 'route derives policy values');
  check('Expansion budget floor is proposal data', !/Math\.max\(\s*65000/.test(decisionEngineSource + '\n' + consoleSource), 'budget floor comes from proposal.expansionBudgetFloor');
  check('No Hermes unavailable text in run console', !/HERMES_AGENT_URL not configured|Hermes normalizes/.test(consoleSource), 'console avoids failed Hermes live claim');
  check('Captions avoid false Hermes live orchestration', !/Hermes normalizes/.test(postSource), 'captions use Agent IC intake wording');
  check('Captions include Hermes dispatch proof', /Hermes dispatch/i.test(voiceoverSource), 'voiceover mentions Hermes dispatch receipt');
  check('Caption timing artifact exists', Array.isArray(captionTiming?.segments) && captionTiming.segments.length >= 8, captionTimingPath);
  check('Caption timing generated from voiceover', captionTiming?.source === 'demo/voiceover-final.txt', JSON.stringify({ source: captionTiming?.source, segments: captionTiming?.segments?.length }));
  check('Caption and narration avoid raw cents copy', !/\bcents?\b|amountCents|10,000|10000/i.test(postSource + '\n' + voiceoverSource), 'caption sources are dollar-denominated');
  check('Caption and narration use enterprise wording', !/hackathon|judge review|judge audit|\bjudge\b/i.test(postSource + '\n' + voiceoverSource), 'professional source-audit wording only');
  check('QR target uses reachable clean source profile', /github\.com\/agent-ic(?!\/agent-ic)/.test(recorderSource + '\n' + consoleSource + '\n' + await readText('app/qr/page.jsx')), 'public QR target is github.com/agent-ic');
  check('Product surfaces use procurement language', !/presentation-ready|Submission storyboard|60-90 second proof arc|Why it wins|useful,\s*viable/i.test(consoleSource + '\n' + appSource + '\n' + recorderSource + '\n' + voiceoverSource), 'enterprise product language only');
  check('Cost comparison uses measured service-trial economics', /computeMeasuredTrialCosts/.test(consoleSource) && !/metrics\.recommendedBudget\s*\/\s*12/.test(consoleSource), 'Agent IC cost is not derived from expansion budget');
  check('Run button disables after captured run', /disabled=\{loading \|\| Boolean\(payload\)\}/.test(consoleSource), 'top-level run CTA cannot stay active after proof payload');
  check('Console includes service-trial proof UI', /v14-productivity-band|Public workload service trial|Routing coverage|Human review queue/.test(consoleSource), 'service-trial evidence band is rendered in run console');
  check('Console avoids old capital-experiment wording', !/Run capital experiment|The pilot earns more capital|Capital decision|Compatibility cohort|DAT RateView/.test(consoleSource), 'run console uses service-trial framing');
  check('Final script stays on current service-trial story', !/Atlas Freight|320 Atlas|72-hour Atlas|96 hours|60 hours saved|2\.7x|Cost per case falls/i.test(voiceoverSource + '\n' + consoleSource), 'current NHTSA service-trial story only');
  check('Stripe test mode is not labeled live in console', !/Live Checkout Session|STRIPE LIVE|Production Checkout/i.test(consoleSource), 'console labels cs_test sessions as test mode');
  check('Hermes badge avoids markdown-artifact framing', !/label:\s*['"]SKILL\.md['"]|mode:\s*['"]ARTIFACT['"]|SKILL\.md ARTIFACT/i.test(consoleSource), 'console frames SKILL.md as Hermes handoff package');
  check('Playbook CTA cannot expose local hover URL', !/href=["']\/api\/playbook\?version=v1["']/.test(consoleSource), 'playbook CTA is not a hoverable local link');
  check('Policy target is not placeholder example domain', !/premium-market-api\.example\.com/.test(routeSource + consoleSource), 'policy request uses proposal target URI');
  check('Active console has no recording stage dwell timer', !/RECORDING_MIN_STAGE_DWELL_MS|stageQueueTimerRef|stageQueueRef/.test(consoleSource), 'stage changes are event driven');
  check('Recording mode commits live trace stages', !/if\s*\(\s*recording\s*\)\s*\{\s*updateReachedStage/s.test(consoleSource), 'recording view follows live trace commits');
  check('Recorder does not click stage navigation', !/data-testid=["'`]stage-\$\{stageId\}["'`]|\[data-testid=["'`]stage-(proposal|evaluate|fund|govern|decide)["'`]\]/.test(recorderSource), 'final recorder only clicks product actions');
  check('Recorder uses one human product click', !/humanizedClick\([^)]*run-from-playbook/.test(recorderSource), 'playbook replay is a live receipt from the started run, not a second cursor click');
  check('Console shows live worker-agent policy reasoning', /AgentToolPolicyPanel|agent\.tool\.request|policy\.reasoning\.decision/.test(consoleSource + '\n' + routeSource), 'controlled worker-agent tool request is visible');
  check('Console shows policy gate network trace', /policy-gate-live-trace|policy\.gate\.outbound|policy\.gate\.response/.test(consoleSource + '\n' + routeSource), 'request and 403 response are rendered as live trace steps');
  check('Console shows NHTSA sample evidence rows', /NHTSA sample rows|sample-evidence-rows-visible|SampleEvidenceRows/.test(consoleSource), 'sample rows are rendered in the visible proof surface');
  check('Console shows actual NHTSA row preview', /evidence-row-preview|Imported row preview|raw ODI/i.test(consoleSource), 'actual ODI row preview is rendered in the visible proof surface');
  check('Console cites evidence source and hash', /api\.nhtsa\.gov|Public evidence source|sha256/.test(consoleSource), 'NHTSA source and artifact hash are visible');
  check('Console avoids contradictory autonomy escalation copy', !/AUTO-DRAFT|AUTO-EXECUTE/.test(consoleSource + '\n' + voiceoverSource), 'human-in-loop decision is not framed as auto-execute');
  check('Recorder does not launch local policy proxy', !/startNemoclawProxy|local-policy-proxy\.mjs|127\.0\.0\.1:9000|localhost:9000/.test(recorderSource), 'strict recorder does not start proxy proof');
  check('Recorder visible commands use proof wrapper', !/runTerminalCommand\([^)]*(localhost|127\.0\.0\.1|:3000|:9000)/.test(recorderSource), 'no local endpoint typed on screen');
  check('Captions use voiceover segment timing', /caption-timing-final\.json/.test(postSource), 'post-production reads measured voiceover timings');

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
