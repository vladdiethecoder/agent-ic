#!/usr/bin/env node
/**
 * Mux Agent IC v18 demo: combines raw video + voiceover audio into final MP4.
 *
 * Key fixes vs old approach:
 *   - Does NOT use -shortest (which clipped the last 12s of narration)
 *   - Pads video with last frame if audio is longer
 *   - Writes captions-v18.srt as an optional sidecar only
 *   - Validates duration match before muxing
 *   - Uses execFile (arg array) instead of shell string for safety
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RAW_VIDEO = path.join(ROOT, 'demo-out', 'agent-ic-demo-raw-v18.mp4');
const AUDIO_WAV = path.join(ROOT, 'demo-out', 'agent-ic-audio-v18.wav');
const CAPTION_JSON = path.join(ROOT, 'demo-out', 'caption-timing-v18.json');
const FINAL_VIDEO = path.join(ROOT, 'demo-out', 'agent-ic-demo-final-v18.mp4');
const SRT_FILE = path.join(ROOT, 'demo-out', 'captions-v18.srt');

function getDuration(filePath) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], { encoding: 'utf8' });
  return parseFloat(out.trim());
}

function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function generateSrt(captionPath, srtPath) {
  if (!existsSync(captionPath)) {
    console.log('[mux] No caption timing found, skipping captions');
    return false;
  }

  const timing = JSON.parse(readFileSync(captionPath, 'utf8'));
  const segments = timing.segments || [];

  if (segments.length === 0) return false;

  const srtLines = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const start = Number(seg.start) || 0;
    const nextSeg = segments[i + 1];
    const end = Number(seg.end) || (nextSeg ? Number(nextSeg.start) : Number(timing.audioDuration) || start + 5);

    // Get the text — strip pause markers and metadata
    const text = (seg.text || seg.line || '').replace(/\[pause:[\d.]+\]/g, '').trim();
    if (!text) continue;

    srtLines.push(String(srtLines.length + 1));
    srtLines.push(`${formatSrtTime(start)} --> ${formatSrtTime(end)}`);
    // Split long lines into two
    const words = text.split(' ');
    const midPoint = Math.ceil(words.length / 2);
    if (words.length > 12) {
      srtLines.push(`${words.slice(0, midPoint).join(' ')}\n${words.slice(midPoint).join(' ')}`);
    } else {
      srtLines.push(text);
    }
    srtLines.push('');
  }

  writeFileSync(srtPath, srtLines.join('\n'), 'utf8');
  console.log(`[mux] Generated ${srtLines.length / 4} caption entries → ${srtPath}`);
  return true;
}

// ── Main ────────────────────────────────────────────────────
console.log('[mux] Starting v18 demo mux...');

// Validate inputs exist
for (const [label, file] of [['raw video', RAW_VIDEO], ['audio', AUDIO_WAV]]) {
  if (!existsSync(file)) {
    console.error(`[mux] FATAL: ${label} not found: ${file}`);
    process.exit(1);
  }
}

const videoDuration = getDuration(RAW_VIDEO);
const audioDuration = getDuration(AUDIO_WAV);

console.log(`[mux] Video: ${videoDuration.toFixed(2)}s`);
console.log(`[mux] Audio: ${audioDuration.toFixed(2)}s`);

generateSrt(CAPTION_JSON, SRT_FILE);

const paddedVideo = path.join(ROOT, 'demo-out', 'agent-ic-demo-raw-v18-padded.mp4');
const needsPadding = videoDuration + 0.25 < audioDuration;
const sourceVideo = needsPadding ? paddedVideo : RAW_VIDEO;

if (needsPadding) {
  const padSeconds = audioDuration - videoDuration + 0.25;
  console.log(`[mux] Padding raw video by ${padSeconds.toFixed(2)}s`);
  execFileSync('ffmpeg', [
    '-y',
    '-i', RAW_VIDEO,
    '-vf', `tpad=stop_mode=clone:stop_duration=${padSeconds.toFixed(2)}`,
    '-c:v', 'libopenh264',
    '-profile:v', 'high',
    '-rc_mode', 'bitrate',
    '-allow_skip_frames', '0',
    '-b:v', '8M',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    paddedVideo,
  ], { stdio: 'inherit' });
} else {
  console.log('[mux] Raw video is long enough; using stream copy source');
}

// Final mux: combine video + audio
// Trim video to audio duration so there's no silent tail
console.log('[mux] Combining video + audio...');

const sourceDuration = needsPadding ? audioDuration + 0.25 : videoDuration;
const trimDuration = Math.min(sourceDuration, audioDuration + 0.25);

execFileSync('ffmpeg', [
  '-y',
  '-i', sourceVideo,
  '-i', AUDIO_WAV,
  '-t', trimDuration.toFixed(2),   // Trim to match audio
  '-c:v', 'copy',
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-movflags', '+faststart',
  FINAL_VIDEO,
], { stdio: 'inherit' });

// Verify final output
const finalDuration = getDuration(FINAL_VIDEO);
console.log(`\n[mux] Final video: ${FINAL_VIDEO}`);
console.log(`[mux] Duration: ${finalDuration.toFixed(2)}s`);
console.log(`[mux] Audio: ${audioDuration.toFixed(2)}s`);
console.log(`[mux] Match: ${Math.abs(finalDuration - audioDuration) < 2 ? 'OK' : 'MISMATCH'}`);

// Cleanup — no intermediate to remove (stream copy)
console.log('[mux] Done.');
