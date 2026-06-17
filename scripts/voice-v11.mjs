#!/usr/bin/env node
/**
 * Generate the v11 voiceover from demo/voiceover-v11.txt.
 *
 * Primary: local Kokoro TTS via .venv python3 + scripts/kokoro-tts.py.
 * Fallback: edge-tts (Microsoft Edge online voices).
 * Output is resampled to 48 kHz stereo for Remotion/MP4 compatibility.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = process.cwd();
const inputFile = process.argv[2] || 'demo/voiceover-v11.txt';
const outputFile = process.argv[3] || 'remotion/public/voiceover-v11.wav';
const tmpFile = outputFile.replace(/\.wav$/, '-24k.wav');

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: false,
    cwd: projectRoot,
    ...options,
  });
  return result.status === 0;
}

function runEdgeTTS() {
  console.log('Falling back to edge-tts...');
  const mp3 = outputFile.replace(/\.wav$/, '-edge.mp3');
  const ok = run('edge-tts', ['--file', inputFile, '--write-media', mp3, '--voice', 'en-US-GuyNeural']);
  if (!ok) return false;
  return run('ffmpeg', ['-y', '-i', mp3, '-ar', '48000', '-ac', '2', outputFile]);
}

function runKokoro() {
  const venvPython = path.join(projectRoot, '.venv', 'bin', 'python3');
  if (!existsSync(venvPython)) {
    console.log(`Virtualenv Python not found at ${venvPython}`);
    return false;
  }

  const modelPath = path.join(projectRoot, 'models', 'kokoro', 'onnx', 'model.onnx');
  const voicesPath = path.join(projectRoot, 'models', 'kokoro', 'voices-v1.0.bin');
  if (!existsSync(modelPath) || !existsSync(voicesPath)) {
    console.log('Kokoro model/voices not found; expected models/kokoro/onnx/model.onnx and models/kokoro/voices-v1.0.bin');
    return false;
  }

  console.log('Synthesizing with local Kokoro TTS...');
  const ok = run(venvPython, [
    path.join(projectRoot, 'scripts', 'kokoro-tts.py'),
    '--input', inputFile,
    '--output', tmpFile,
  ]);
  if (!ok) return false;

  console.log('Resampling to 48 kHz stereo...');
  return run('ffmpeg', ['-y', '-i', tmpFile, '-ar', '48000', '-ac', '2', outputFile]);
}

function probeDurationAndRate() {
  try {
    const result = spawnSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=sample_rate,duration',
      '-of', 'default=noprint_wrappers=1',
      outputFile,
    ], {
      shell: false,
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.status !== 0) return null;
    const lines = result.stdout.split('\n').filter(Boolean);
    const out = {};
    for (const line of lines) {
      const [key, value] = line.split('=');
      if (key && value) out[key.trim()] = value.trim();
    }
    return out;
  } catch {
    return null;
  }
}

if (runKokoro()) {
  console.log(`Wrote ${outputFile}`);
} else if (runEdgeTTS()) {
  console.log(`Wrote ${outputFile} (edge-tts fallback)`);
} else {
  console.error('Failed to generate voiceover with both Kokoro and edge-tts.');
  process.exit(1);
}

const probe = probeDurationAndRate();
if (probe) {
  const seconds = Number.parseFloat(probe.duration);
  const rate = Number.parseInt(probe.sample_rate, 10);
  console.log(`Duration: ${Number.isFinite(seconds) ? seconds.toFixed(3) : probe.duration}s, Sample rate: ${rate || probe.sample_rate} Hz`);
} else {
  console.log('Duration: unknown, Sample rate: 48000 Hz (target)');
}
