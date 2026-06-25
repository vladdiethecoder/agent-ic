#!/usr/bin/env node
/**
 * Build the final voiceover as deterministic caption-aligned segments.
 *
 * Each non-empty line in demo/voiceover-final.txt is synthesized independently.
 * The script then concatenates the segment WAV files and writes exact caption
 * timings from the measured audio durations. This avoids guessing caption
 * timing from UI stage offsets, which drifts whenever live calls take longer.
 */

import { execFileSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

loadEnvLocal();

const INPUT_TEXT = path.resolve(process.env.VOICEOVER_TXT || 'demo/voiceover-final.txt');
const OUTPUT_WAV = path.resolve(process.env.VOICEOVER_WAV || 'demo-out/agent-ic-audio-final.wav');
const OUTPUT_RAW_WAV = path.resolve(process.env.VOICEOVER_RAW_WAV || OUTPUT_WAV.replace(/\.wav$/i, '-24k.wav'));
const TIMING_JSON = path.resolve(process.env.VOICEOVER_TIMING_JSON || path.join(path.dirname(OUTPUT_WAV), 'caption-timing-final.json'));
const SEGMENT_DIR = path.resolve(process.env.VOICEOVER_SEGMENT_DIR || path.join(path.dirname(OUTPUT_WAV), 'voiceover-segments-final'));
const GAP_SECONDS = Number(process.env.VOICEOVER_SEGMENT_GAP_SECONDS || 0.20);
const KOKORO_SPEED = process.env.KOKORO_SPEED || '1.03';
const EDGE_TTS_VOICE = process.env.EDGE_TTS_VOICE || 'en-US-AvaNeural';
const EDGE_TTS_RATE = process.env.EDGE_TTS_RATE || '+4%';
const EDGE_TTS_PITCH = process.env.EDGE_TTS_PITCH || '+0Hz';
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
const ELEVENLABS_OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128';
const ELEVENLABS_STABILITY = Number(process.env.ELEVENLABS_STABILITY || 0.58);
const ELEVENLABS_SIMILARITY = Number(process.env.ELEVENLABS_SIMILARITY || 0.78);
const ELEVENLABS_STYLE = Number(process.env.ELEVENLABS_STYLE || 0.16);
const ELEVENLABS_SPEED = Number(process.env.ELEVENLABS_SPEED || 0.94);
const VOICEOVER_ATEMPO = Number(process.env.VOICEOVER_ATEMPO || 1);

function loadEnvLocal() {
  const envPath = path.resolve('.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function commandExists(command) {
  try {
    execFileSync('bash', ['-lc', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function probeDuration(file) {
  const output = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' }
  ).trim();
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not determine duration for ${file}`);
  }
  return duration;
}

function parseSegments(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const pause = line.match(/^\[pause:(\d+(?:\.\d+)?)\]$/i);
      if (pause) {
        return { kind: 'pause', seconds: Math.max(0, Number(pause[1])) };
      }
      return { kind: 'speech', text: line };
    });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function resolveBackend() {
  const requested = process.env.VOICEOVER_TTS_BACKEND;
  if (requested) return requested;
  if (process.env.ELEVENLABS_API_KEY) return 'elevenlabs';
  if (commandExists('edge-tts')) return 'edge-tts';
  if (
    fs.existsSync(path.resolve('.venv/bin/python')) &&
    fs.existsSync(path.resolve('models/kokoro/onnx/model.onnx')) &&
    fs.existsSync(path.resolve('models/kokoro/voices-v1.0.bin'))
  ) {
    return 'kokoro';
  }
  if (commandExists('say')) return 'say';
  if (commandExists('espeak-ng')) return 'espeak-ng';
  if (commandExists('flite')) return 'flite';
  throw new Error('No local TTS tool found (Kokoro, say, espeak-ng, or flite).');
}

async function synthesizeElevenLabsSegment(inputTextFile, outputAudioFile) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('VOICEOVER_TTS_BACKEND=elevenlabs requires ELEVENLABS_API_KEY.');
  }
  const text = fs.readFileSync(inputTextFile, 'utf8').trim();
  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}`);
  url.searchParams.set('output_format', ELEVENLABS_OUTPUT_FORMAT);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'audio/mpeg',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: {
        stability: ELEVENLABS_STABILITY,
        similarity_boost: ELEVENLABS_SIMILARITY,
        style: ELEVENLABS_STYLE,
        use_speaker_boost: true,
        speed: ELEVENLABS_SPEED,
      },
    }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`ElevenLabs TTS failed ${response.status}: ${message.slice(0, 400)}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputAudioFile, data);
  return outputAudioFile;
}

async function synthesizeSegment(backend, inputTextFile, rawAudioFile) {
  if (backend === 'elevenlabs') {
    return synthesizeElevenLabsSegment(inputTextFile, rawAudioFile.replace(/\.wav$/i, '.mp3'));
  }

  if (backend === 'edge-tts') {
    const mediaFile = rawAudioFile.replace(/\.wav$/i, '.mp3');
    run('edge-tts', [
      '--file',
      inputTextFile,
      '--voice',
      EDGE_TTS_VOICE,
      '--rate',
      EDGE_TTS_RATE,
      '--pitch',
      EDGE_TTS_PITCH,
      '--write-media',
      mediaFile,
    ]);
    return mediaFile;
  }

  if (backend === 'kokoro') {
    run('.venv/bin/python', [
      'scripts/kokoro-tts.py',
      '--input',
      inputTextFile,
      '--output',
      rawAudioFile,
      '--speed',
      KOKORO_SPEED,
    ]);
    return rawAudioFile;
  }

  if (backend === 'say') {
    const aiffFile = rawAudioFile.replace(/\.wav$/i, '.aiff');
    run('say', ['-v', 'Samantha', '-r', '172', '-f', inputTextFile, '-o', aiffFile]);
    return aiffFile;
  }

  if (backend === 'espeak-ng') {
    run('espeak-ng', ['-f', inputTextFile, '-w', rawAudioFile, '-s', '150', '-p', '45', '-g', '10']);
    return rawAudioFile;
  }

  run('flite', ['-f', inputTextFile, '-o', rawAudioFile]);
  return rawAudioFile;
}

function convertToStandardWav(inputAudioFile, outputAudioFile) {
  const args = ['-y', '-i', inputAudioFile, '-ar', '48000', '-ac', '2'];
  if (Number.isFinite(VOICEOVER_ATEMPO) && VOICEOVER_ATEMPO > 0 && Math.abs(VOICEOVER_ATEMPO - 1) > 0.001) {
    args.push('-filter:a', `atempo=${VOICEOVER_ATEMPO}`);
  }
  args.push('-c:a', 'pcm_s16le', outputAudioFile);
  run('ffmpeg', args);
}

function writeConcatList(files, listFile) {
  const lines = files.map((file) => `file ${shellQuote(file)}`).join('\n');
  fs.writeFileSync(listFile, `${lines}\n`);
}

async function main() {
  loadEnvLocal();
  if (!fs.existsSync(INPUT_TEXT)) {
    throw new Error(`Voiceover script not found: ${INPUT_TEXT}`);
  }
  const segments = parseSegments(fs.readFileSync(INPUT_TEXT, 'utf8'));
  if (!segments.length) {
    throw new Error(`Voiceover script has no non-empty segments: ${INPUT_TEXT}`);
  }

  fs.mkdirSync(path.dirname(OUTPUT_WAV), { recursive: true });
  fs.rmSync(SEGMENT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SEGMENT_DIR, { recursive: true });

  const backend = resolveBackend();
  const silenceFile = path.join(SEGMENT_DIR, 'gap.wav');
  run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=48000:cl=stereo',
    '-t',
    GAP_SECONDS.toFixed(3),
    '-c:a',
    'pcm_s16le',
    silenceFile,
  ]);
  const silenceDuration = probeDuration(silenceFile);

  const concatFiles = [];
  const captionSegments = [];
  let cursor = 0;

  let speechIndex = 0;
  for (const [index, segment] of segments.entries()) {
    if (segment.kind === 'pause') {
      const pauseFile = path.join(SEGMENT_DIR, `pause-${String(index + 1).padStart(2, '0')}.wav`);
      run('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=48000:cl=stereo',
        '-t',
        segment.seconds.toFixed(3),
        '-c:a',
        'pcm_s16le',
        pauseFile,
      ]);
      concatFiles.push(pauseFile);
      cursor += probeDuration(pauseFile);
      continue;
    }

    speechIndex += 1;
    const text = segment.text;
    const stem = `segment-${String(speechIndex).padStart(2, '0')}`;
    const textFile = path.join(SEGMENT_DIR, `${stem}.txt`);
    const rawAudioFile = path.join(SEGMENT_DIR, `${stem}-raw.wav`);
    const standardAudioFile = path.join(SEGMENT_DIR, `${stem}.wav`);
    fs.writeFileSync(textFile, `${text}\n`);

    const synthesizedFile = await synthesizeSegment(backend, textFile, rawAudioFile);
    convertToStandardWav(synthesizedFile, standardAudioFile);
    const duration = probeDuration(standardAudioFile);

    const start = cursor;
    const end = start + duration;
    captionSegments.push({
      index: speechIndex,
      start,
      end,
      duration,
      text,
    });

    concatFiles.push(standardAudioFile);
    cursor = end;
    if (index < segments.length - 1) {
      concatFiles.push(silenceFile);
      cursor += silenceDuration;
    }
  }

  const concatList = path.join(SEGMENT_DIR, 'concat.txt');
  writeConcatList(concatFiles, concatList);
  run('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatList,
    '-c:a',
    'pcm_s16le',
    OUTPUT_WAV,
  ]);
  run('ffmpeg', ['-y', '-i', OUTPUT_WAV, '-ar', '24000', '-ac', '1', OUTPUT_RAW_WAV]);

  const finalDuration = probeDuration(OUTPUT_WAV);
  const source = fs.readFileSync(INPUT_TEXT);
  const timing = {
    generatedAt: new Date().toISOString(),
    source: path.relative(process.cwd(), INPUT_TEXT),
    sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    backend,
    audio: path.relative(process.cwd(), OUTPUT_WAV),
    audioDuration: finalDuration,
    segmentGapSeconds: silenceDuration,
    speechTempo: VOICEOVER_ATEMPO,
    segments: captionSegments,
  };
  fs.writeFileSync(TIMING_JSON, `${JSON.stringify(timing, null, 2)}\n`);

  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT_WAV)}`);
  console.log(`Wrote ${path.relative(process.cwd(), TIMING_JSON)} (${segments.length} caption segments, ${finalDuration.toFixed(2)}s)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
