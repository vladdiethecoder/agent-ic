#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const VIDEO = 'demo-out/agent-ic-demo-final-winning-v3.mp4';
const VIDEO_SHA256 = '5da9da4f9b200fe4f304698d8325d225f5965119d5e98c9682c3c82e0fa14726';
const COVER_IMAGE = 'demo-out/agent-ic-x-cover-proof.jpg';
const COVER_REPORT = 'demo-out/submission-cover-report.json';
const SELECTED_TIME_SECONDS = 99.3;

if (!existsSync(VIDEO)) {
  console.error(JSON.stringify({ ok: false, error: `Missing video: ${VIDEO}` }, null, 2));
  process.exit(1);
}

const actualVideoSha = sha256File(VIDEO);
if (actualVideoSha !== VIDEO_SHA256) {
  console.error(JSON.stringify({ ok: false, error: 'Video hash mismatch', expected: VIDEO_SHA256, actual: actualVideoSha }, null, 2));
  process.exit(1);
}

mkdirSync(dirname(COVER_IMAGE), { recursive: true });

execFileSync('ffmpeg', [
  '-y',
  '-hide_banner',
  '-loglevel', 'error',
  '-ss', String(SELECTED_TIME_SECONDS),
  '-i', VIDEO,
  '-frames:v', '1',
  '-q:v', '2',
  COVER_IMAGE,
], { stdio: 'inherit' });

const stats = imageStats(COVER_IMAGE);
const coverSha = sha256File(COVER_IMAGE);
const report = {
  ok: true,
  video: VIDEO,
  videoSha256: VIDEO_SHA256,
  coverImage: COVER_IMAGE,
  coverImageSha256: coverSha,
  selectedTimeSeconds: SELECTED_TIME_SECONDS,
  rationale: 'Proof-dense decision and policy-block frame for optional X custom thumbnail; the MP4 opening frame already carries the title-card pitch.',
  dimensions: { width: stats.width, height: stats.height },
  imageStats: { mean: stats.mean, stddev: stats.stddev },
  tools: { ffmpeg: true, imageMagick: true },
};

writeFileSync(COVER_REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function imageStats(file) {
  const raw = execFileSync('magick', [
    'identify',
    '-format',
    '%w %h %[fx:mean] %[fx:standard_deviation]',
    file,
  ], { encoding: 'utf8' }).trim();
  const [width, height, mean, stddev] = raw.split(/\s+/);
  return {
    width: Number(width),
    height: Number(height),
    mean: Number(mean),
    stddev: Number(stddev),
  };
}
