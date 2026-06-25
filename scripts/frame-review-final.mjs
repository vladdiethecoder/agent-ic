#!/usr/bin/env node
/**
 * Frame-by-frame audit gate for the final Agent IC video.
 *
 * The script extracts every frame, builds contact sheets for manual/LLM review,
 * scans representative OCR for local/private leakage, and optionally sends the
 * contact sheets to an OpenAI-compatible vision endpoint for a critical review.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const VIDEO_PATH = process.env.AGENT_IC_DEMO_VIDEO || 'demo-out/agent-ic-demo-final.mp4';
const OUT_DIR = process.env.AGENT_IC_FRAME_REVIEW_DIR || 'demo-out/frame-review-final';
const FRAME_DIR = path.join(OUT_DIR, 'frames');
const CONTACT_DIR = path.join(OUT_DIR, 'contact-sheets');
const REPORT_PATH = process.env.AGENT_IC_FRAME_REVIEW_REPORT || 'demo-out/frame-review-final.json';
const REQUIRE_VISION_REVIEW =
  process.env.AGENT_IC_REQUIRE_VISION_FRAME_QA === 'true' ||
  process.env.AGENT_IC_REQUIRE_CHATGPT55_FRAME_QA === 'true' ||
  false;
const ALLOW_NO_LLM = process.env.AGENT_IC_FRAME_QA_ALLOW_NO_LLM === 'true';
const SKIP_OCR = process.env.AGENT_IC_FRAME_QA_SKIP_OCR !== 'false';
const QA_PROFILE = process.env.AGENT_IC_QA_PROFILE || 'strict-final';
const IS_V18_BROWSER_PROFILE = QA_PROFILE === 'v18-browser';
const MIN_DURATION = Number(process.env.AGENT_IC_MIN_DURATION_SECONDS || 60);
const MAX_DURATION = Number(process.env.AGENT_IC_MAX_DURATION_SECONDS || (IS_V18_BROWSER_PROFILE ? 180 : 90));
const MAX_ALLOWED_SILENCE_SECONDS = Number(process.env.AGENT_IC_MAX_SILENCE_SECONDS || 4);

const FORBIDDEN_VISIBLE_TEXT = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  ':3000',
  ':9000',
  'DevTools',
  'recording=1',
  'noAutoRun',
  'SIMULATED',
  '[mock]',
  '[fallback]',
  'STRIPE LIVE',
  'Live Checkout Session',
  'HERMES_AGENT_URL not configured',
  'Hermes normalizes',
  'HERMES ERROR',
  'NEMOCLAW ERROR',
  'NIM / NEMOTRON LOCAL',
  'PAYMENTS LOCAL',
  'POLICY GATE LOCAL',
  'SKILL.md ARTIFACT',
  'SKILL.MD ARTIFACT',
  'premium-market-api.example.com',
  '/home/',
  '/Users/',
  '/run/media/',
  'Hackathon Submission #1',
];

const checks = [];
const diagnostics = {
  tools: {},
  videoAnalysis: {},
  imageAnalysis: {},
  ocr: {},
};
const VISION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    issues: { type: 'array', items: { type: 'string' } },
    strongest_frame_notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'issues', 'strongest_frame_notes'],
};

function check(name, pass, detail) {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'OK' : 'FAIL'} ${name}: ${detail}`);
}

function exec(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let out = '';
    let err = '';
    child.stdout.on('data', (data) => (out += data));
    child.stderr.on('data', (data) => (err += data));
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
    child.stdout.on('data', (data) => (out += data));
    child.stderr.on('data', (data) => (err += data));
    child.on('close', (code) => resolve({ code, stdout: out.trim(), stderr: err.trim() }));
  });
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

async function ffprobe() {
  const { stdout } = await exec([
    'ffprobe',
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,avg_frame_rate,nb_frames,duration',
    '-of', 'json',
    VIDEO_PATH,
  ]);
  return JSON.parse(stdout).streams?.[0] || {};
}

function parseFrameRate(value) {
  const [num, den] = String(value || '').split('/').map(Number);
  return Number.isFinite(num) && Number.isFinite(den) && den !== 0 ? num / den : 0;
}

async function listFiles(dir, suffix) {
  const entries = await fs.readdir(dir).catch(() => []);
  return entries.filter((name) => name.endsWith(suffix)).sort().map((name) => path.join(dir, name));
}

function sampleList(items, count) {
  if (items.length <= count) return items;
  const out = [];
  for (let i = 0; i < count; i++) {
    const index = Math.round((i / Math.max(1, count - 1)) * (items.length - 1));
    out.push(items[index]);
  }
  return [...new Set(out)];
}

async function imageStats(filePath) {
  const result = await execLenient([
    'magick',
    'identify',
    '-format',
    '%w %h %[fx:mean] %[fx:standard_deviation]',
    filePath,
  ]);
  if (result.code === 0) return parseImageStats(result.stdout);

  const fallback = await execLenient([
    'identify',
    '-format',
    '%w %h %[fx:mean] %[fx:standard_deviation]',
    filePath,
  ]);
  if (fallback.code !== 0) return null;
  return parseImageStats(fallback.stdout);
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

async function analyzeSampledImages(frames, sheets) {
  const sampledFrames = sampleList(frames, 24);
  const frameHashes = await Promise.all(sampledFrames.map(fileSha256));
  const frameStats = await Promise.all(sampledFrames.map(imageStats));
  const frameDiffs = [];
  for (let i = 1; i < sampledFrames.length; i++) {
    frameDiffs.push(await imageDifference(sampledFrames[i - 1], sampledFrames[i]));
  }
  const sheetStats = await Promise.all(sheets.map(imageStats));

  return {
    sampledFrames: sampledFrames.map((file, index) => ({
      file,
      sha256: frameHashes[index],
      stats: frameStats[index],
      diffFromPrevious: index === 0 ? null : frameDiffs[index - 1],
    })),
    contactSheets: sheets.map((file, index) => ({ file, stats: sheetStats[index] })),
    uniqueFrameHashes: new Set(frameHashes).size,
    detailedFrames: frameStats.filter((stats) => Number(stats?.stddev) > 0.015).length,
    meaningfulDiffs: frameDiffs.filter((value) => Number(value) > 0.01).length,
    frameDiffCount: frameDiffs.length,
  };
}

async function extractAllFrames() {
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(FRAME_DIR, { recursive: true });
  await exec(['ffmpeg', '-y', '-i', VIDEO_PATH, '-vsync', '0', path.join(FRAME_DIR, 'frame-%06d.jpg')]);
  return listFiles(FRAME_DIR, '.jpg');
}

async function buildContactSheets() {
  await fs.mkdir(CONTACT_DIR, { recursive: true });
  await exec([
    'ffmpeg',
    '-y',
    '-i', VIDEO_PATH,
    '-vf', 'fps=2,scale=320:-1,tile=5x4',
    path.join(CONTACT_DIR, 'sheet-%03d.jpg'),
  ]);
  return listFiles(CONTACT_DIR, '.jpg');
}

async function runBlackDetect() {
  const { stderr } = await exec([
    'ffmpeg',
    '-i', VIDEO_PATH,
    '-vf', 'blackdetect=d=0.15:pic_th=0.98',
    '-an',
    '-f', 'null',
    '-',
  ]);
  return [...stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)]
    .map((match) => ({ start: Number(match[1]), end: Number(match[2]), duration: Number(match[3]) }));
}

function parseSilenceDetect(stderr) {
  const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)]
    .map((match, index) => ({
      start: starts[index] ?? null,
      end: Number(match[1]),
      duration: Number(match[2]),
    }));
  return ends.filter((entry) => Number.isFinite(entry.duration));
}

async function runSilenceDetect() {
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

async function ocrContactSheets(sheets) {
  if (SKIP_OCR) return '';
  let tesseract;
  try {
    const mod = await import('tesseract.js');
    tesseract = mod.default || mod;
  } catch {
    return '';
  }
  const worker = await tesseract.createWorker('eng');
  const texts = [];
  try {
    for (const sheet of sheets.slice(0, 12)) {
      const { data } = await worker.recognize(sheet);
      if (data.text) texts.push(data.text);
    }
  } finally {
    await worker.terminate();
  }
  return texts.join(' ');
}

async function imageToDataUrl(file) {
  const data = await fs.readFile(file);
  return `data:image/jpeg;base64,${data.toString('base64')}`;
}

async function imageToBase64(file) {
  const data = await fs.readFile(file);
  return data.toString('base64');
}

async function runVisionReview(sheets) {
  const baseUrl = (
    process.env.CHATGPT55_BASE_URL ||
    process.env.OPENAI_COMPAT_BASE_URL ||
    (process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : '')
  ).replace(/\/$/, '');
  const apiKey =
    process.env.CHATGPT55_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_COMPAT_API_KEY;
  const model =
    process.env.CHATGPT55_MODEL ||
    process.env.OPENAI_COMPAT_MODEL ||
    'gpt-5.5';

  if (!baseUrl || !apiKey) {
    if (ALLOW_NO_LLM) {
      return { skipped: true, verdict: 'SKIPPED', reason: 'vision endpoint not configured' };
    }
    throw new Error('ChatGPT 5.5/OpenAI-compatible vision endpoint is not configured');
  }

  const selectedSheets = sheets.slice(0, Number(process.env.AGENT_IC_FRAME_REVIEW_MAX_SHEETS || process.env.AGENT_IC_CHATGPT55_MAX_SHEETS || 8));
  if (/127\.0\.0\.1:11434|localhost:11434/.test(baseUrl)) {
    return runOllamaVisionReview(baseUrl, model, selectedSheets);
  }
  const content = [
    {
      type: 'text',
      text: buildVisionPrompt(),
    },
  ];
  for (const sheet of selectedSheets) {
    content.push({ type: 'image_url', image_url: { url: await imageToDataUrl(sheet) } });
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'http-referer': 'https://agent-ic.demo',
      'x-title': 'Agent IC frame QA',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      temperature: 0,
      max_tokens: 1200,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.message || `vision review HTTP ${response.status}`);
  }
  const text = payload.choices?.[0]?.message?.content || '';
  return parseVisionPayload(text, model);
}

async function runOllamaVisionReview(baseUrl, model, selectedSheets) {
  const prompt = buildVisionPrompt();
  const response = await fetch(`${baseUrl.replace(/\/v1$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: VISION_RESPONSE_SCHEMA,
      options: { temperature: 0 },
      messages: [
        {
          role: 'user',
          content: prompt,
          images: await Promise.all(selectedSheets.map((sheet) => imageToBase64(sheet))),
        },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Ollama vision review failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }
  const payload = await response.json();
  const raw = payload?.message?.content || payload?.response || '';
  return parseVisionPayload(raw, model);
}

function buildVisionPrompt() {
  const proofInstruction = IS_V18_BROWSER_PROFILE
    ? 'Check that the browser chrome/product URL, Stripe test-mode proof, Nemotron proof, HTTP 403 policy block, OpenShell policy receipt, NHTSA ODI row previews, formulas, and Hermes-compatible playbook artifact are visually credible and honestly labeled. Do not require live Hermes task proof in this v18-browser profile unless it is visibly claimed.'
    : 'Check that Hermes dispatch proof, Stripe test-mode proof, Nemotron proof, HTTP 403 policy block, the live gate trace, actual NHTSA ODI row previews, SKILL.md, and Run from playbook are visually credible.';
  return [
    'You are a critical but evidence-bound enterprise product reviewer auditing Agent IC demo video contact sheets.',
    'Use only visible pixels and text. Do not infer localhost, local ports, DevTools, private paths, or fake markers unless those exact artifacts are visibly present.',
    'Separate deterministic video and image analysis gates already checked codec, duration, black frames, frozen intervals, sampled frame detail, frame differences, no long silence, and generated contact sheets.',
    'OCR is diagnostic only and is not trusted as the primary pass/fail signal.',
    'Fail only for visible problems that remain despite those checks: unreadable UI, unprofessional composition, masked entire UI instead of identifiers, missing human interaction, or obvious staged/static behavior.',
    proofInstruction,
    'When writing strongest_frame_notes, use stage names instead of numbered frame ranges.',
    'Do not include thought, thinking, analysis, rationale, verthought, or any wrapper fields.',
    'Return compact JSON only: {"verdict":"PASS"|"FAIL","issues":[...],"strongest_frame_notes":[...]}.',
  ].join(' ');
}

function parseVisionPayload(raw, model) {
  const normalize = (json) => {
    const body =
      json?.ver_dict && typeof json.ver_dict === 'object'
        ? { ...json, ...json.ver_dict }
        : json;
    const looseVerdict = Object.entries(body || {}).find(([key, value]) => (
      /^ver/i.test(key) && typeof value === 'string' && ['PASS', 'FAIL'].includes(value.toUpperCase())
    ))?.[1];
    const verdict = body.verdict || body.verdedict || body.VERDICT || looseVerdict;
    const notes = Array.isArray(body.strongest_frame_notes)
      ? body.strongest_frame_notes.map((note) => String(note).replace(/\bFrame\s+\d+(?:-\d+)?:\s*/gi, 'Observation: '))
      : body.strongest_frame_notes;
    return { model, ...body, strongest_frame_notes: notes, verdict: typeof verdict === 'string' ? verdict.toUpperCase() : verdict };
  };
  try {
    const json = JSON.parse(raw);
    return normalize(json);
  } catch {
    const match = String(raw || '').match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const json = JSON.parse(match[0]);
        return normalize(json);
      } catch {}
    }
    return { model, verdict: 'FAIL', issues: ['vision response was not JSON'], raw: String(raw || '').slice(0, 500) };
  }
}

async function writeReport(report) {
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Report written to ${REPORT_PATH}`);
}

async function main() {
  diagnostics.tools.ffmpeg = await hasCommand('ffmpeg');
  diagnostics.tools.ffprobe = await hasCommand('ffprobe');
  diagnostics.tools.imageMagick = await hasCommand('magick') || await hasCommand('identify');
  check('Video analysis tools available', diagnostics.tools.ffmpeg && diagnostics.tools.ffprobe, JSON.stringify({ ffmpeg: diagnostics.tools.ffmpeg, ffprobe: diagnostics.tools.ffprobe }));
  check('Image analysis tool available', diagnostics.tools.imageMagick, JSON.stringify({ imageMagick: diagnostics.tools.imageMagick }));

  if (!existsSync(VIDEO_PATH)) {
    check('Video exists', false, `missing ${VIDEO_PATH}`);
    await writeReport({ overall: 'FAIL', checks });
    process.exit(1);
  }
  check('Video exists', true, VIDEO_PATH);

  const stream = await ffprobe();
  const fps = parseFrameRate(stream.avg_frame_rate);
  const duration = Number(stream.duration);
  const expectedFrames = Math.round(duration * fps);
  check('Frame metadata readable', fps > 0 && duration > 0, `fps=${fps.toFixed(3)} duration=${duration.toFixed(2)}s`);
  check('Duration has enough context', Number.isFinite(duration) && duration >= MIN_DURATION, `${duration.toFixed(2)}s`);
  check('Duration remains concise', Number.isFinite(duration) && duration <= MAX_DURATION, `${duration.toFixed(2)}s`);

  const audioSilences = await runSilenceDetect();
  check(
    `No audio silence >= ${MAX_ALLOWED_SILENCE_SECONDS}s`,
    audioSilences.length === 0,
    audioSilences.length ? JSON.stringify(audioSilences.slice(0, 5)) : 'clean'
  );

  const frames = await extractAllFrames();
  check('Every frame extracted', frames.length >= Math.max(1, expectedFrames - 2), `${frames.length}/${expectedFrames}`);

  const blackSegments = await runBlackDetect();
  diagnostics.videoAnalysis.blackSegments = blackSegments;
  check('No black-frame intervals', blackSegments.length === 0, blackSegments.length ? JSON.stringify(blackSegments.slice(0, 5)) : 'clean');

  const sheets = await buildContactSheets();
  check('Contact sheets generated', sheets.length > 0, `${sheets.length} sheets in ${CONTACT_DIR}`);

  const imageAnalysis = await analyzeSampledImages(frames, sheets);
  diagnostics.imageAnalysis = imageAnalysis;
  check('Sampled extracted frames are visually varied', imageAnalysis.uniqueFrameHashes >= 20, `${imageAnalysis.uniqueFrameHashes}/${imageAnalysis.sampledFrames.length} unique frame hashes`);
  check('Sampled extracted frames have image detail', imageAnalysis.detailedFrames === imageAnalysis.sampledFrames.length, `${imageAnalysis.detailedFrames}/${imageAnalysis.sampledFrames.length} frames above texture threshold`);
  check('Frame-to-frame image differences prove progression', imageAnalysis.meaningfulDiffs >= 10, `${imageAnalysis.meaningfulDiffs}/${imageAnalysis.frameDiffCount} meaningful sampled diffs`);
  check('Contact sheets are nonblank', imageAnalysis.contactSheets.every((sheet) => Number(sheet.stats?.stddev) > 0.02), JSON.stringify(imageAnalysis.contactSheets.map((sheet) => sheet.stats)));

  const ocrText = await ocrContactSheets(sheets);
  const forbidden = FORBIDDEN_VISIBLE_TEXT.filter((phrase) => new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(ocrText));
  diagnostics.ocr = { skipped: SKIP_OCR, characters: ocrText.trim().length, forbiddenMatches: forbidden };
  check('Contact-sheet OCR recorded as diagnostic', true, SKIP_OCR ? 'skipped by default; not a pass/fail signal' : (forbidden.length ? `diagnostic matches: ${forbidden.join(', ')}` : `${ocrText.trim().length} chars; no diagnostic matches`));

  let visionReview = null;
  if (REQUIRE_VISION_REVIEW) {
    try {
      visionReview = await runVisionReview(sheets);
      check('Vision critical review passed', visionReview.verdict === 'PASS', JSON.stringify(visionReview));
    } catch (error) {
      visionReview = { verdict: 'FAIL', error: error.message };
      check('Vision critical review passed', false, error.message);
    }
  } else {
    visionReview = { verdict: 'SKIPPED', reason: 'AGENT_IC_REQUIRE_VISION_FRAME_QA is not true' };
    check('Vision critical review passed', true, 'not enabled');
  }

  const report = {
    video: VIDEO_PATH,
    timestamp: new Date().toISOString(),
    overall: checks.every((entry) => entry.pass) ? 'PASS' : 'FAIL',
    metadata: { fps, duration, expectedFrames, extractedFrames: frames.length },
    output: { frames: FRAME_DIR, contactSheets: CONTACT_DIR },
    blackSegments,
    audioSilences,
    visionReview,
    diagnostics,
    checks,
  };
  await writeReport(report);
  process.exit(report.overall === 'PASS' ? 0 : 1);
}

main().catch(async (error) => {
  console.error('Frame review error:', error);
  check('Frame review completed', false, error.message);
  await writeReport({ overall: 'FAIL', checks, error: error.message }).catch(() => {});
  process.exit(1);
});
