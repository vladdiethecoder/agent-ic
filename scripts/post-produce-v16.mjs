#!/usr/bin/env node
/**
 * Post-produce the v16 live screencast.
 *
 * Transcodes the raw WebM to h264 MP4, prepends an intro title card,
 * appends an outro CTA card, burns captions, adds trimmed/faded audio,
 * and promotes the result to the final demo video.
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const OUT_DIR = path.resolve(process.env.AGENT_IC_DEMO_DIR || 'demo-out');
const RAW_VIDEO = path.join(OUT_DIR, 'agent-ic-demo-v16-raw.webm');
const FINAL_VIDEO = path.join(OUT_DIR, 'agent-ic-demo-v16.mp4');
const PROMOTED_VIDEO = path.join(OUT_DIR, 'agent-ic-demo-final.mp4');
const AUDIO_SOURCE = path.join(OUT_DIR, 'agent-ic-audio-mastered-v13.wav');

const VIEWPORT = { width: 1920, height: 1080 };
const FPS = 30;
const VIDEO_CODEC = 'h264_nvenc';
const VIDEO_BITRATE = '8M';
const INTRO_SECONDS = 3;
const OUTRO_SECONDS = 3;

const FONT_REGULAR = '/usr/share/fonts/rsms-inter-fonts/Inter-Regular.ttf';
const FONT_BOLD = '/usr/share/fonts/rsms-inter-fonts/Inter-Bold.ttf';

// Timings are relative to the final concatenated video.
// v17 relies on native UI toasts/notifications; no burned captions.
const CAPTIONS = [];

function execFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(err || `ffmpeg failed: ${args.join(' ')}`));
      else resolve(out.trim());
    });
  });
}

function probeDuration(file) {
  const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`, { encoding: 'utf8' });
  return Number(out.trim());
}

function escapeDrawtext(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,');
}

function buildCaptionFilters() {
  const y = `h*0.84`;
  return CAPTIONS.map((cap) => {
    const safe = escapeDrawtext(cap.text);
    const size = cap.size || 46;
    return `drawtext=fontfile=${FONT_BOLD}:text='${safe}':fontcolor=white:fontsize=${size}:x=(w-text_w)/2:y=${y}:enable='between(t\\,${cap.start.toFixed(2)}\\,${cap.end.toFixed(2)})':box=1:boxcolor=0x000000@0.55:boxborderw=18:line_spacing=6`;
  }).join(',');
}

async function transcodeMain(input, output) {
  await execFfmpeg([
    '-y', '-i', input,
    '-vf', `fps=${FPS},scale=${VIEWPORT.width}:${VIEWPORT.height}:force_original_aspect_ratio=decrease,pad=${VIEWPORT.width}:${VIEWPORT.height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    '-c:v', VIDEO_CODEC,
    '-b:v', VIDEO_BITRATE,
    '-r', String(FPS),
    '-pix_fmt', 'yuv420p',
    '-an',
    output,
  ]);
}

async function makeTitleCard(output, { title, subtitle, duration }) {
  const vf = [
    `drawtext=fontfile=${FONT_BOLD}:text='${escapeDrawtext(title)}':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2-50`,
    `drawtext=fontfile=${FONT_REGULAR}:text='${escapeDrawtext(subtitle)}':fontcolor=#9ca3af:fontsize=42:x=(w-text_w)/2:y=(h-text_h)/2+60`,
  ].join(',');
  await execFfmpeg([
    '-y', '-f', 'lavfi', '-i', `color=c=0x0b0d10:s=${VIEWPORT.width}x${VIEWPORT.height}:r=${FPS}:d=${duration}`,
    '-vf', vf,
    '-c:v', VIDEO_CODEC,
    '-b:v', VIDEO_BITRATE,
    '-r', String(FPS),
    '-pix_fmt', 'yuv420p',
    '-an',
    output,
  ]);
}

async function makeOutroCard(output, { title, lines, duration, qrImage }) {
  const hasQr = existsSync(qrImage);
  const cardImage = output.replace(/\.mp4$/i, '.png');

  const pyArgs = [
    'scripts/generate-outro-card.py',
    '--output', cardImage,
    '--title', title,
    ...lines.flatMap((line) => ['--line', line]),
  ];
  if (hasQr) {
    pyArgs.push('--qr', qrImage);
  }
  execSync(`python3 ${pyArgs.map((a) => `"${a}"`).join(' ')}`);

  await execFfmpeg([
    '-y', '-loop', '1', '-i', cardImage,
    '-t', String(duration),
    '-c:v', VIDEO_CODEC,
    '-b:v', VIDEO_BITRATE,
    '-r', String(FPS),
    '-pix_fmt', 'yuv420p',
    '-an',
    output,
  ]);
}

async function composeFinal(intro, main, outro, audioFile, output) {
  const mainDuration = probeDuration(main);
  const totalDuration = INTRO_SECONDS + mainDuration + OUTRO_SECONDS;
  const audioExists = existsSync(audioFile);

  const captionFilters = buildCaptionFilters();
  const videoChain = captionFilters
    ? `[0:v][1:v][2:v]concat=n=3:v=1:a=0[base];[base]${captionFilters}[outv]`
    : `[0:v][1:v][2:v]concat=n=3:v=1:a=0[outv]`;

  const args = [
    '-y',
    '-i', intro,
    '-i', main,
    '-i', outro,
  ];

  if (audioExists) {
    const audioDuration = Math.min(totalDuration, probeDuration(audioFile));
    args.push('-i', audioFile);
    args.push(
      '-filter_complex',
      `${videoChain};[3:a]atrim=0:${audioDuration.toFixed(3)},afade=t=out:st=${Math.max(0, audioDuration - 2).toFixed(2)}:d=2[aout]`
    );
    args.push('-map', '[outv]', '-map', '[aout]');
  } else {
    args.push('-filter_complex', videoChain);
    args.push('-map', '[outv]');
  }

  args.push(
    '-c:v', VIDEO_CODEC,
    '-b:v', VIDEO_BITRATE,
    '-r', String(FPS),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-t', totalDuration.toFixed(3),
    '-shortest',
    output,
  );

  await execFfmpeg(args);
}

async function main() {
  if (!existsSync(RAW_VIDEO)) {
    console.error(`Raw video not found: ${RAW_VIDEO}`);
    process.exit(1);
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  const mainVideo = path.join(OUT_DIR, 'agent-ic-demo-v16-main.mp4');
  const introVideo = path.join(OUT_DIR, 'agent-ic-demo-v16-intro.mp4');
  const outroVideo = path.join(OUT_DIR, 'agent-ic-demo-v16-outro.mp4');

  console.log('[post] transcoding raw WebM to h264 MP4...');
  await transcodeMain(RAW_VIDEO, mainVideo);

  console.log('[post] generating intro/outro cards...');
  await makeTitleCard(introVideo, {
    title: 'Agent IC',
    subtitle: 'Governed capital account for autonomous work',
    duration: INTRO_SECONDS,
  });
  const demoUrl = process.env.AGENT_IC_DEMO_URL || 'http://localhost:3000';
  const githubUrl = process.env.AGENT_IC_GITHUB_URL || 'https://github.com/vladdiethecoder/agent-ic-hermes-hackathon';

  const qrImage = path.join(OUT_DIR, 'agent-ic-github-qr.png');
  try {
    execSync(`npx -y qrcode -o "${qrImage}" -t png -w 320 "${githubUrl}"`, { stdio: 'inherit' });
  } catch (err) {
    console.warn(`[post] QR generation failed: ${err.message}`);
  }

  await makeOutroCard(outroVideo, {
    title: 'Agent IC',
    lines: [
      githubUrl,
      `Run it locally: ${demoUrl}`,
    ],
    duration: OUTRO_SECONDS,
    qrImage,
  });

  console.log('[post] composing final video with captions and audio...');
  await composeFinal(introVideo, mainVideo, outroVideo, AUDIO_SOURCE, FINAL_VIDEO);

  // Promote to final.
  await fs.copyFile(FINAL_VIDEO, PROMOTED_VIDEO);

  const finalDuration = probeDuration(FINAL_VIDEO);
  const stat = await fs.stat(FINAL_VIDEO);
  console.log(`\nFinal video: ${FINAL_VIDEO}`);
  console.log(`Duration:    ${finalDuration.toFixed(2)}s`);
  console.log(`Size:        ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Promoted:    ${PROMOTED_VIDEO}`);

  // Sync final metadata so it matches the promoted render.
  const metadata = execSync(`ffprobe -v error -show_streams -show_format -of json "${PROMOTED_VIDEO}"`, { encoding: 'utf8' });
  await fs.writeFile(path.join(OUT_DIR, 'final-video-metadata.json'), metadata);

  // Cleanup intermediate files.
  for (const f of [mainVideo, introVideo, outroVideo]) {
    await fs.unlink(f).catch(() => {});
  }
}

main().catch((err) => {
  console.error('Post-production failed:', err);
  process.exit(1);
});
