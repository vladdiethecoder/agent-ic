#!/usr/bin/env node
/**
 * Generate Remotion-ready captions for the final voiceover.
 *
 * Primary: faster-whisper (Python) or whisper.cpp CLI for word-level alignment.
 * Fallback: sentence-level heuristic evenly distributed across the audio duration.
 *
 * Input: remotion/public/voiceover-final.wav + demo/voiceover-final.txt
 * Output: remotion/src/captions-final.json
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = process.cwd();
const scriptPath = process.argv[2] || 'demo/voiceover-final.txt';
const audioPath = process.argv[3] || 'remotion/public/voiceover-final.wav';
const outputPath = process.argv[4] || 'remotion/src/captions-final.json';
const FPS = 30;

function splitSentences(text) {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAudioDuration() {
  try {
    const result = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      audioPath,
    ], { encoding: 'utf8', shell: false, cwd: projectRoot });
    const n = parseFloat(result.stdout);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function runFasterWhisper() {
  const venvPython = path.join(projectRoot, '.venv', 'bin', 'python3');
  if (!existsSync(venvPython)) return null;

  const snippet = `
import sys, json
try:
    from faster_whisper import WhisperModel
except Exception as e:
    print('ERROR:' + str(e), file=sys.stderr)
    sys.exit(1)

model = WhisperModel('base', device='cpu', compute_type='int8')
segments, _ = model.transcribe(sys.argv[1], beam_size=5, word_timestamps=True)
captions = []
for seg in segments:
    if seg.words:
        words = list(seg.words)
        start = words[0].start
        end = words[-1].end
        text = ' '.join(w.word.strip() for w in words).strip()
    else:
        start, end = seg.start, seg.end
        text = seg.text.strip()
    if text:
        captions.append({'start': start, 'end': end, 'text': text})
print(json.dumps(captions))
`;

  const result = spawnSync(venvPython, ['-', audioPath], {
    input: snippet,
    encoding: 'utf-8',
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    console.log('faster-whisper not available or failed:', result.stderr?.slice(0, 200));
    return null;
  }

  try {
    const raw = JSON.parse(result.stdout);
    return raw.map((c) => ({
      startFrame: Math.round(c.start * FPS),
      endFrame: Math.round(c.end * FPS),
      text: c.text,
    }));
  } catch {
    return null;
  }
}

function runWhisperCpp() {
  const whisperCli = spawnSync('which', ['whisper-cli'], { encoding: 'utf8' }).stdout?.trim();
  if (!whisperCli) return null;

  const tmpJson = path.join(projectRoot, 'demo-out', 'whisper-final.json');
  const modelPath = path.join(projectRoot, 'models', 'ggml-base.en.bin');
  if (!existsSync(modelPath)) {
    console.log('whisper.cpp model not found at models/ggml-base.en.bin');
    return null;
  }

  const result = spawnSync(whisperCli, [
    '-m', modelPath,
    '-f', audioPath,
    '-oj',
    '-of', tmpJson.replace(/\.json$/, ''),
  ], { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  if (result.status !== 0) {
    console.log('whisper-cli failed:', result.stderr?.slice(0, 200));
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(tmpJson, 'utf8'));
    return (raw.transcription || []).map((c) => ({
      startFrame: Math.round(c.timestamps.from * FPS),
      endFrame: Math.round(c.timestamps.to * FPS),
      text: c.text.trim(),
    }));
  } catch {
    return null;
  }
}

function heuristicCaptions(scriptText, durationSeconds) {
  const sentences = splitSentences(scriptText);
  const totalFrames = Math.max(1, Math.round(durationSeconds * FPS));
  const perSentence = totalFrames / sentences.length;

  return sentences.map((text, i) => {
    const start = Math.round(i * perSentence);
    const end = Math.round((i + 1) * perSentence);
    return {
      startFrame: start,
      endFrame: Math.min(end, totalFrames),
      text,
    };
  });
}

if (!existsSync(audioPath)) {
  console.error(`Audio not found: ${audioPath}. Run npm run demo:voice first.`);
  process.exit(1);
}

const scriptText = readFileSync(scriptPath, 'utf8');
let captions = runFasterWhisper();

if (!captions) {
  captions = runWhisperCpp();
}

if (!captions) {
  const duration = getAudioDuration();
  if (!duration) {
    console.error(`Could not determine duration of ${audioPath}`);
    process.exit(1);
  }
  console.log(`Using sentence-heuristic captions (duration ${duration.toFixed(3)}s)`);
  captions = heuristicCaptions(scriptText, duration);
} else {
  console.log(`Generated ${captions.length} captions from ASR`);
}

writeFileSync(outputPath, JSON.stringify(captions, null, 2));
console.log(`Wrote ${outputPath}`);
