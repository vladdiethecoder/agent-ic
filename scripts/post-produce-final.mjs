#!/usr/bin/env node
/**
 * Post-produce the final Agent IC demo video.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const WORKSPACE_ROOT = process.cwd();
const OUT_DIR = path.resolve(process.env.AGENT_IC_DEMO_DIR || 'demo-out');
const RAW_VIDEO = path.join(OUT_DIR, 'agent-ic-demo-raw.mp4');
const FINAL_VIDEO = path.join(OUT_DIR, 'agent-ic-demo-final.mp4');
const STAGE_EVENTS = path.join(OUT_DIR, 'stage-events-final.json');
const CAPTION_TIMING = path.join(OUT_DIR, 'caption-timing-final.json');

const AUDIO_CANDIDATES = [
  path.join(OUT_DIR, 'agent-ic-audio-final.wav'),
  path.join(OUT_DIR, 'audio.wav'),
];
const START_TRIM_SECONDS = Number(process.env.AGENT_IC_POST_START_TRIM_SECONDS || 1.8);
const TAIL_TRIM_SECONDS = Number(process.env.AGENT_IC_POST_TAIL_TRIM_SECONDS || 0.2);
const CAPTION_RAIL_HEIGHT = Number(process.env.AGENT_IC_CAPTION_RAIL_HEIGHT || 176);
const CAPTION_FONT_SIZE = Number(process.env.AGENT_IC_CAPTION_FONT_SIZE || 20);
const OUTPUT_WIDTH = Number(process.env.AGENT_IC_OUTPUT_WIDTH || 1920);
const OUTPUT_HEIGHT = Number(process.env.AGENT_IC_OUTPUT_HEIGHT || 1080);
const ENABLE_COLOR_GRADE = process.env.AGENT_IC_COLOR_GRADE !== 'false';
const DEFAULT_COLOR_GRADE_FILTERS = [
  'eq=contrast=1.18:saturation=1.80',
  'eq=brightness=0.10:gamma=1.35',
  'unsharp=5:5:0.45:3:3:0.20',
];

const FALLBACK_CAPTIONS = [
  { start: 0.8, end: 6.0, text: 'A human starts a governed capital run from an empty append-only stream.' },
  { start: 6.0, end: 14.2, text: 'Hermes dispatches the mission inside NemoHermes and records a session receipt.' },
  { start: 14.2, end: 21.0, text: 'Nemotron returns the decision-path request and a readable rationale.' },
  { start: 21.0, end: 28.5, text: 'Stripe creates and retrieves a test-mode Checkout Session for the $100 micro-envelope.' },
  { start: 28.5, end: 35.5, text: 'The policy gate blocks the over-cap tool attempt with HTTP 403.' },
  { start: 35.5, end: 42.0, text: 'Imported evidence supports CONTINUE and unlocks the $250 next cap.' },
  { start: 42.0, end: 48.0, text: 'Run from playbook executes the saved Hermes SKILL.md on a second mission.' },
  { start: 48.0, end: 52.0, text: 'Keys and long identifiers are masked; the product UI is not.' },
];

function probeDuration(file) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`,
      { encoding: 'utf8' }
    );
    const duration = parseFloat(out.trim());
    return Number.isFinite(duration) ? duration : null;
  } catch {
    return null;
  }
}

function pickAudio() {
  for (const candidate of AUDIO_CANDIDATES) {
    if (fs.existsSync(candidate) && probeDuration(candidate)) {
      return candidate;
    }
  }
  return null;
}

function escapeDrawtext(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\$/g, '\\$')
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function formatMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `$${Math.round(number).toLocaleString('en-US')}` : 'the governed';
}

function clampCaption(caption, duration) {
  const start = Math.max(0, Math.min(caption.start, duration - 0.2));
  const end = Math.max(start + 0.8, Math.min(caption.end, duration));
  return { ...caption, start, end };
}

function wrapCaptionText(text, maxChars = 74) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3).join('\n');
}

function buildVoiceoverCaptions(videoDuration) {
  if (!fs.existsSync(CAPTION_TIMING)) return null;
  try {
    const timing = JSON.parse(fs.readFileSync(CAPTION_TIMING, 'utf8'));
    const segments = Array.isArray(timing.segments) ? timing.segments : [];
    const captions = segments
      .map((segment) => ({
        start: Number(segment.start),
        end: Number(segment.end),
        text: wrapCaptionText(segment.text),
      }))
      .filter((caption) => Number.isFinite(caption.start) && Number.isFinite(caption.end) && caption.text);
    return captions.length ? captions.map((cap) => clampCaption(cap, videoDuration)) : null;
  } catch {
    return null;
  }
}

function buildCaptions(videoDuration) {
  const voiceoverCaptions = buildVoiceoverCaptions(videoDuration);
  if (voiceoverCaptions) return voiceoverCaptions;

  if (!fs.existsSync(STAGE_EVENTS)) return FALLBACK_CAPTIONS.map((cap) => clampCaption(cap, videoDuration));
  try {
    const events = JSON.parse(fs.readFileSync(STAGE_EVENTS, 'utf8'));
    const stageStart = (stage, fallback) => {
      const offsetMs = events.stages?.[stage]?.offsetMs;
      return Number.isFinite(offsetMs) ? Math.max(0, offsetMs / 1000) : fallback;
    };
    const proposal = stageStart('proposal', 2.5);
    const evaluate = stageStart('evaluate', Math.max(proposal + 3, 6));
    const fund = stageStart('fund', Math.max(evaluate + 5, 14));
    const govern = stageStart('govern', Math.max(fund + 5, 22));
    const decide = stageStart('decide', Math.max(govern + 6, 32));
    const blocked = events.blocked || {};
    const externalPolicyLive = events.policyGate?.externalLive === true;
    const policyName = externalPolicyLive ? 'NemoHermes/OpenShell' : 'Policy gate';
    const blockedText =
      Number.isFinite(Number(blocked.attemptedAmount)) && Number.isFinite(Number(blocked.cap))
        ? `${policyName} blocks ${formatMoney(blocked.attemptedAmount)} against the ${formatMoney(blocked.cap)} envelope with HTTP 403.`
        : `${policyName} blocks the over-cap tool attempt with HTTP 403.`;

    return [
      { start: 0.7, end: Math.max(proposal + 1.5, 4.5), text: 'A human starts a governed capital run from an empty append-only stream.' },
      { start: proposal, end: Math.max(evaluate + 1.5, proposal + 4), text: 'Hermes dispatches the mission inside NemoHermes and records a session receipt.' },
      { start: evaluate, end: Math.max(fund + 1.5, evaluate + 5), text: 'Nemotron returns a request ID and a readable rationale while the proof cards update.' },
      { start: fund, end: Math.max(govern + 1, fund + 5), text: 'Stripe creates and retrieves a test-mode Checkout Session for the micro-envelope.' },
      { start: govern, end: Math.max(decide - 0.5, govern + 5), text: blockedText },
      { start: decide, end: Math.min(videoDuration - 10, decide + 6), text: 'Evidence supports CONTINUE; Run from playbook is ready with the saved Hermes SKILL.md.' },
      { start: Math.min(videoDuration - 7, decide + 6), end: Math.min(videoDuration - 3, decide + 12), text: 'Run from playbook executes the saved procedure on a second mission.' },
      { start: Math.max(decide + 12, videoDuration - 7), end: Math.max(videoDuration - 1, 0), text: 'Every API call is captured for audit; keys and long identifiers are masked.' },
    ].map((cap) => clampCaption(cap, videoDuration));
  } catch {
    return FALLBACK_CAPTIONS.map((cap) => clampCaption(cap, videoDuration));
  }
}

function buildVideoFilter(videoDuration, renderDuration, captions) {
  const fontPath = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const fontArg = fs.existsSync(fontPath) ? `fontfile=${fontPath}:` : '';
  const padSeconds = Math.max(0, renderDuration - videoDuration);
  const pictureHeight = Math.max(720, OUTPUT_HEIGHT - Math.max(0, CAPTION_RAIL_HEIGHT));
  const filters = [
    `scale=${OUTPUT_WIDTH}:${pictureHeight}:force_original_aspect_ratio=disable`,
    `pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:0:0:black`,
  ];
  if (padSeconds > 0.05) {
    filters.push(`tpad=stop_mode=clone:stop_duration=${padSeconds.toFixed(3)}`);
  }
  const captionY = pictureHeight + 14;
  const lineSpacing = 6;
  const lineHeight = CAPTION_FONT_SIZE + lineSpacing;

  for (const caption of captions.filter((c) => c.start < renderDuration)) {
    const end = Math.min(caption.end, renderDuration);
    const lines = String(caption.text).split('\n').filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      const line = escapeDrawtext(lines[i]);
      filters.push([
        'drawtext=',
        fontArg,
        `text='${line}':`,
        `enable='between(t,${caption.start.toFixed(2)},${end.toFixed(2)})':`,
        `x=(w-text_w)/2:y=${captionY + i * lineHeight}:`,
        `fontsize=${CAPTION_FONT_SIZE}:fontcolor=white:`,
        'line_spacing=6:',
        'box=1:boxcolor=black@0.74:boxborderw=8',
      ].join(''));
    }
  }

  if (ENABLE_COLOR_GRADE) {
    filters.push(...DEFAULT_COLOR_GRADE_FILTERS);
  }

  return filters.join(',');
}

function main() {
  if (!fs.existsSync(RAW_VIDEO)) {
    console.error(`[post-produce] raw video not found: ${RAW_VIDEO}`);
    process.exit(1);
  }

  const rawVideoDuration = probeDuration(RAW_VIDEO);
  if (!rawVideoDuration || rawVideoDuration <= 0) {
    console.error('[post-produce] could not determine raw video duration');
    process.exit(1);
  }
  const startTrim = Math.max(0, Math.min(START_TRIM_SECONDS, rawVideoDuration - 0.5));
  const videoDuration = rawVideoDuration - startTrim;

  const audioFile = pickAudio();
  if (!audioFile) {
    console.error('[post-produce] no audio candidate found; expected one of:', AUDIO_CANDIDATES);
    process.exit(1);
  }
  const audioDuration = probeDuration(audioFile) || 0;
  const maxPictureDuration = Math.max(0.5, videoDuration - TAIL_TRIM_SECONDS);
  if (audioDuration > maxPictureDuration + 0.15) {
    console.error(
      `[post-produce] audio (${audioDuration.toFixed(2)}s) exceeds available picture ` +
      `(${maxPictureDuration.toFixed(2)}s). Shorten the voiceover or record a longer raw capture.`
    );
    process.exit(1);
  }
  const renderDuration = Math.min(maxPictureDuration, Math.max(0.5, audioDuration + 0.25));
  if (renderDuration > 90) {
    console.error(`[post-produce] render would exceed 90s: ${renderDuration.toFixed(2)}s`);
    process.exit(1);
  }

  const fadeSeconds = 2;
  const fadeStart = Math.max(0, renderDuration - fadeSeconds);
  const audioPad = Math.max(0, renderDuration - audioDuration + 0.1);
  const audioFilter = [
    'loudnorm=I=-16:TP=-1.5:LRA=11',
    audioPad > 0 ? `apad=pad_dur=${audioPad.toFixed(3)}` : null,
    `afade=t=out:st=${fadeStart}:d=${fadeSeconds}`,
  ].filter(Boolean).join(',');
  const captions = buildCaptions(renderDuration);
  const videoFilter = buildVideoFilter(videoDuration, renderDuration, captions);

  const cmd = [
    'ffmpeg',
    '-y',
    ...(startTrim > 0 ? ['-ss', startTrim.toFixed(3)] : []),
    '-i', `"${RAW_VIDEO}"`,
    '-i', `"${audioFile}"`,
    ...(videoFilter ? ['-vf', `"${videoFilter}"`] : []),
    '-c:v', 'h264_nvenc',
    '-b:v', '8M',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-t', renderDuration.toFixed(3),
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-af', `"${audioFilter}"`,
    `"${FINAL_VIDEO}"`,
  ].join(' ');

  console.log(`[post-produce] raw video duration: ${rawVideoDuration.toFixed(2)}s`);
  console.log(`[post-produce] start trim: ${startTrim.toFixed(2)}s`);
  console.log(`[post-produce] final render duration: ${renderDuration.toFixed(2)}s`);
  console.log(`[post-produce] audio source: ${audioFile}`);
  console.log(`[post-produce] captions: ${fs.existsSync(CAPTION_TIMING) ? CAPTION_TIMING : fs.existsSync(STAGE_EVENTS) ? STAGE_EVENTS : 'fallback timing'}`);
  console.log(`[post-produce] producing final video -> ${FINAL_VIDEO}`);

  execSync(cmd, { stdio: 'inherit', cwd: WORKSPACE_ROOT });
  const finalDuration = probeDuration(FINAL_VIDEO);
  const stats = fs.statSync(FINAL_VIDEO);
  console.log(`[post-produce] done: ${FINAL_VIDEO} (${stats.size / 1e6 | 0} MB, ${finalDuration?.toFixed(2)}s)`);
}

main();
