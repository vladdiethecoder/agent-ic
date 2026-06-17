import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = process.cwd();
const inputFile = process.argv[2] || 'demo/voiceover-v7.txt';
const outputFile = process.argv[3] || 'remotion/public/voiceover.wav';
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

if (runKokoro()) {
  console.log(`Wrote ${outputFile}`);
  process.exit(0);
}

if (runEdgeTTS()) {
  console.log(`Wrote ${outputFile} (edge-tts fallback)`);
  process.exit(0);
}

console.error('Failed to generate voiceover with both Kokoro and edge-tts.');
process.exit(1);
