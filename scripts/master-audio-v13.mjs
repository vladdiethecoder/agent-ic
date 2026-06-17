#!/usr/bin/env node
/**
 * Agent IC v12 audio mastering pipeline.
 *
 * Input: remotion/public/voiceover-v11.wav
 * Output: demo-out/agent-ic-audio-mastered-v12.wav
 *          + remotion/public/agent-ic-audio-mastered-v12.wav
 *
 * Pipeline:
 *   1. Two-pass EBU R128 loudnorm on narration (-14 LUFS integrated, -1 dBTP, LRA 7).
 *   2. Generate a CC0 ambient music bed locally with ffmpeg (anoise + sine drone).
 *   3. Generate CC0 SFX cues locally: intro whoosh, evaluation success, Stripe auth,
 *      policy block, outro.
 *   4. Side-chain duck music under voice using ffmpeg sidechaincompress.
 *   5. Mix voice + ducked music + delayed SFX, then final loudnorm pass.
 *
 * Requires: ffmpeg / ffprobe in PATH. No other binary dependencies.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

const VOICE_IN = process.argv[2] || 'remotion/public/voiceover-v13.wav';
const OUTPUT_MASTER = process.argv[3] || 'demo-out/agent-ic-audio-mastered-v13.wav';
const OUTPUT_PUBLIC = process.argv[4] || 'remotion/public/agent-ic-audio-mastered-v13.wav';
const ASSETS_DIR = process.argv[5] || 'demo-out/audio-assets-v13';

const TARGET_I = -14;    // integrated loudness (LUFS)
const TARGET_TP = -1;    // spec true peak (dBTP)
const FINAL_TP = -1.5;   // tighter true-peak target for headroom (ensures measured ≤ -1.0 dBTP)
const TARGET_LRA = 7;    // loudness range (LU)

// SFX cue offsets (seconds) matched to voiceover beats.
const DEFAULT_SFX_CUES = [
  { id: 'intro-whoosh',    file: 'sfx-intro-whoosh.wav',    offset: 0.0,  duration: 1.5,  volume: -9 },
  { id: 'eval-success',    file: 'sfx-eval-success.wav',    offset: 35.0, duration: 0.6,  volume: -12 },
  { id: 'stripe-auth',     file: 'sfx-stripe-auth.wav',     offset: 42.0, duration: 0.4,  volume: -10 },
  { id: 'policy-block',    file: 'sfx-policy-block.wav',    offset: 75.0, duration: 0.55, volume: -10 },
  { id: 'outro-whoosh',    file: 'sfx-outro-whoosh.wav',    offset: 112.0,duration: 1.2,  volume: -9 },
];

function run(label, cmd, args, options = {}) {
  console.log(`[audio-v13] ${label}: ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    cwd: projectRoot,
    ...options,
  });
  if (result.status !== 0) {
    const err = result.stderr?.toString?.() || '';
    console.error(`[audio-v13] FAILED ${label}: ${err.slice(0, 1200)}`);
    return { ok: false, stdout: result.stdout?.toString?.() || '', stderr: err };
  }
  return { ok: true, stdout: result.stdout?.toString?.() || '', stderr: result.stderr?.toString?.() || '' };
}

function probeVoice(p) {
  const { ok, stdout } = run('Probe voiceover', 'ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'format=duration:stream=sample_rate,channels',
    '-of', 'json',
    p,
  ]);
  if (!ok) return null;
  try {
    const j = JSON.parse(stdout);
    const fmt = j.format || {};
    const stream = (j.streams || [])[0] || {};
    return {
      duration: Number.parseFloat(fmt.duration),
      sampleRate: Number.parseInt(stream.sample_rate, 10),
      channels: Number.parseInt(stream.channels, 10),
    };
  } catch {
    return null;
  }
}

function extractLoudnormMeasurements(stderrText) {
  const start = stderrText.indexOf('{');
  const end = stderrText.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(stderrText.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeVoice(input, output, { measuredI, measuredTp, measuredLra, measuredThresh, offset, targetI, targetTp, targetLra }) {
  const args = [
    '-y', '-i', input,
    '-af',
    `loudnorm=I=${targetI}:TP=${targetTp}:LRA=${targetLra}:measured_I=${measuredI}:measured_TP=${measuredTp}:measured_LRA=${measuredLra}:measured_thresh=${measuredThresh}:offset=${offset}:linear=true`,
    '-ar', '48000', '-ac', '2',
    output,
  ];
  return run('Normalize voiceover (pass 2)', 'ffmpeg', args);
}

function generateMusicBed(output, duration) {
  // Layer a deep sine drone with low-passed pink noise for an unobtrusive ambient bed.
  const filter =
    `[0:a]volume=-32dB,vibrato=f=0.5:d=0.3[drone];` +
    `[1:a]lowpass=f=300,anoisesrc=...`;
  // Simpler: build via audio sources.
  return run('Generate ambient music bed', 'ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', `sine=frequency=110:duration=${duration}:sample_rate=48000`,
    '-f', 'lavfi', '-i', `anoisesrc=color=pink:r=48000:duration=${duration}`,
    '-filter_complex',
    '[0:a]volume=-34dB,vibrato=f=0.4:d=0.2[drone];' +
    '[1:a]lowpass=f=280,volume=-38dB[noise];' +
    '[drone][noise]amix=inputs=2:duration=first:dropout_transition=0,afade=t=in:ss=0:d=2,afade=t=out:st=' + Math.max(0, duration - 2.5) + ':d=2.5',
    '-ar', '48000', '-ac', '2',
    output,
  ]);
}

function generateSfx(cue) {
  const out = path.join(ASSETS_DIR, cue.file);
  const { id, duration, volume } = cue;
  let args;
  if (id.includes('whoosh')) {
    args = [
      '-y',
      '-f', 'lavfi', '-i', `anoisesrc=color=white:r=48000:duration=${duration}`,
      '-af',
      `lowpass=f=${id === 'intro-whoosh' ? 700 : 1100},` +
      `afade=t=in:ss=0:d=${Math.min(0.35, duration * 0.25)},` +
      `afade=t=out:st=${Math.max(0, duration - 0.4)}:d=0.4,` +
      `volume=${volume}dB`,
      '-ar', '48000', '-ac', '2',
      out,
    ];
  } else if (id === 'eval-success') {
    // Pleasant major-third chime.
    args = [
      '-y',
      '-f', 'lavfi', '-i', `sine=frequency=880:duration=${duration}:sample_rate=48000`,
      '-f', 'lavfi', '-i', `sine=frequency=1100:duration=${duration}:sample_rate=48000`,
      '-filter_complex',
      '[0:a][1:a]amix=inputs=2:duration=first,' +
      `afade=t=in:ss=0:d=0.05,` +
      `afade=t=out:st=${Math.max(0, duration - 0.35)}:d=0.35,` +
      `volume=${volume}dB`,
      '-ar', '48000', '-ac', '2',
      out,
    ];
  } else if (id === 'stripe-auth') {
    // Short ascending confirmation chirp.
    args = [
      '-y',
      '-f', 'lavfi', '-i', `sine=frequency=1200:duration=${duration}:sample_rate=48000`,
      '-af',
      `vibrato=f=6:d=0.3,` +
      `afade=t=in:ss=0:d=0.03,` +
      `afade=t=out:st=${Math.max(0, duration - 0.15)}:d=0.15,` +
      `volume=${volume}dB`,
      '-ar', '48000', '-ac', '2',
      out,
    ];
  } else if (id === 'policy-block') {
    // Low error buzz with slight detune.
    args = [
      '-y',
      '-f', 'lavfi', '-i', `sine=frequency=180:duration=${duration}:sample_rate=48000`,
      '-f', 'lavfi', '-i', `sine=frequency=190:duration=${duration}:sample_rate=48000`,
      '-filter_complex',
      '[0:a][1:a]amix=inputs=2:duration=first,' +
      `afade=t=in:ss=0:d=0.02,` +
      `afade=t=out:st=${Math.max(0, duration - 0.15)}:d=0.15,` +
      `volume=${volume}dB`,
      '-ar', '48000', '-ac', '2',
      out,
    ];
  } else {
    throw new Error(`Unknown SFX id: ${id}`);
  }
  return run(`Generate SFX ${id}`, 'ffmpeg', args);
}

function probeLoudness(file) {
  const { ok, stderr } = run('Probe final loudness', 'ffmpeg', [
    '-i', file,
    '-af', `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`,
    '-f', 'null', '-',
  ]);
  if (!ok) return null;
  return extractLoudnormMeasurements(stderr);
}

function sidechainDuckMusic(musicFile, voiceFile, output) {
  // Duck music when voice is present; fast attack, medium release.
  // music is [0:a], sidechain key (voice) is [1:a].
  return run('Side-chain duck music under voice', 'ffmpeg', [
    '-y', '-i', musicFile, '-i', voiceFile,
    '-filter_complex',
    '[0:a][1:a]sidechaincompress=threshold=-35dB:ratio=5:attack=20:release=300:detection=peak:knee=6:mix=1[ducked]',
    '-map', '[ducked]',
    '-ar', '48000', '-ac', '2',
    output,
  ]);
}

function rawMix(voiceFile, duckedMusicFile, sfxFiles, output) {
  const inputs = ['-i', voiceFile, '-i', duckedMusicFile, ...sfxFiles.flatMap(f => ['-i', f])];
  const totalInputs = 2 + sfxFiles.length;

  const delays = sfxFiles.map((_, i) => {
    const cue = DEFAULT_SFX_CUES[i];
    const ms = Math.round((cue.offset || 0) * 1000);
    return `[${2 + i}:a]adelay=delays=${ms}|${ms}:all=1,volume=${cue.volume}dB[sfx${i}]`;
  });

  const mixInputs = ['[0:a]', '[1:a]', ...sfxFiles.map((_, i) => `[sfx${i}]`)].join('');

  const filterComplex =
    delays.join(';') +
    (delays.length ? ';' : '') +
    `${mixInputs}amix=inputs=${totalInputs}:duration=first:dropout_transition=0`;

  return run('Raw mix (voice + ducked music + SFX)', 'ffmpeg', [
    '-y', ...inputs,
    '-filter_complex', filterComplex,
    '-ar', '48000', '-ac', '2',
    output,
  ]);
}

function normalizeMix(input, output, measurements) {
  const args = [
    '-y', '-i', input,
    '-af',
    `loudnorm=I=${TARGET_I}:TP=${FINAL_TP}:LRA=${TARGET_LRA}:measured_I=${measurements.input_i}:measured_TP=${measurements.input_tp}:measured_LRA=${measurements.input_lra}:measured_thresh=${measurements.input_thresh}:offset=${measurements.target_offset}:linear=true`,
    '-ar', '48000', '-ac', '2',
    output,
  ];
  return run('Finalize loudness on mixed output', 'ffmpeg', args);
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function main() {
  console.log('[audio-v13] Starting Agent IC v13 audio mastering');
  console.log(`[audio-v13] Input: ${VOICE_IN}`);

  ensureDir(path.dirname(OUTPUT_MASTER));
  ensureDir(ASSETS_DIR);

  if (!fs.existsSync(VOICE_IN)) {
    console.error(`[audio-v13] Voiceover not found: ${VOICE_IN}`);
    process.exit(1);
  }

  const probe = probeVoice(VOICE_IN);
  if (!probe || !Number.isFinite(probe.duration)) {
    console.error('[audio-v13] Could not probe voiceover duration');
    process.exit(1);
  }
  console.log(`[audio-v13] Voiceover: ${probe.duration.toFixed(3)}s, ${probe.sampleRate} Hz, ${probe.channels} ch`);

  // Pass 1 loudnorm: measure.
  const pass1 = run('Loudnorm pass 1', 'ffmpeg', [
    '-i', VOICE_IN,
    '-af', `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`,
    '-f', 'null', '-',
  ]);
  if (!pass1.ok) process.exit(1);
  const m = extractLoudnormMeasurements(pass1.stderr);
  if (!m) {
    console.error('[audio-v13] Could not parse loudnorm measurements');
    process.exit(1);
  }
  console.log('[audio-v13] Loudnorm measurements:', m);

  const normVoice = path.join(ASSETS_DIR, 'voice-normalized.wav');
  const norm = normalizeVoice(VOICE_IN, normVoice, {
    measuredI: m.input_i,
    measuredTp: m.input_tp,
    measuredLra: m.input_lra,
    measuredThresh: m.input_thresh,
    offset: m.target_offset,
    targetI: TARGET_I,
    targetTp: TARGET_TP,
    targetLra: TARGET_LRA,
  });
  if (!norm.ok) process.exit(1);

  const musicBed = path.join(ASSETS_DIR, 'music-bed.wav');
  const music = generateMusicBed(musicBed, probe.duration + 1); // slight pad
  if (!music.ok) process.exit(1);

  // Generate SFX.
  for (const cue of DEFAULT_SFX_CUES) {
    const r = generateSfx(cue);
    if (!r.ok) process.exit(1);
  }
  const sfxFiles = DEFAULT_SFX_CUES.map(c => path.join(ASSETS_DIR, c.file));

  const duckedMusic = path.join(ASSETS_DIR, 'music-ducked.wav');
  const duck = sidechainDuckMusic(musicBed, normVoice, duckedMusic);
  if (!duck.ok) process.exit(1);

  const rawMixFile = path.join(ASSETS_DIR, 'raw-mix.wav');
  const raw = rawMix(normVoice, duckedMusic, sfxFiles, rawMixFile);
  if (!raw.ok) process.exit(1);

  // Two-pass loudnorm on the raw mix so SFX/music levels don't drift the target.
  const mixMeasure = run('Measure raw mix loudness', 'ffmpeg', [
    '-i', rawMixFile,
    '-af', `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`,
    '-f', 'null', '-',
  ]);
  if (!mixMeasure.ok) process.exit(1);
  const mixM = extractLoudnormMeasurements(mixMeasure.stderr);
  if (!mixM) {
    console.error('[audio-v13] Could not parse raw mix loudness measurements');
    process.exit(1);
  }
  console.log('[audio-v13] Raw mix loudness measurements:', mixM);

  const final = normalizeMix(rawMixFile, OUTPUT_MASTER, mixM);
  if (!final.ok) process.exit(1);

  // Copy to public.
  fs.copyFileSync(OUTPUT_MASTER, OUTPUT_PUBLIC);
  console.log(`[audio-v13] Copied mastered audio to ${OUTPUT_PUBLIC}`);

  // QA loudness.
  const loudness = probeLoudness(OUTPUT_MASTER);
  if (loudness) {
    console.log('[audio-v13] Final loudness:', loudness);
    const i = Number.parseFloat(loudness.input_i);
    const tp = Number.parseFloat(loudness.input_tp);
    const lra = Number.parseFloat(loudness.input_lra);
    if (Number.isFinite(i)) {
      if (i < TARGET_I - 1.5 || i > TARGET_I + 1.5) {
        console.warn(`[audio-v13] WARNING: integrated loudness ${i} LUFS outside ±1.5 LU target`);
      } else {
        console.log(`[audio-v13] Integrated loudness: ${i} LUFS ✓`);
      }
    }
    if (Number.isFinite(tp)) {
      if (tp > TARGET_TP + 0.1) {
        console.warn(`[audio-v13] WARNING: true peak ${tp} dBTP exceeds ${TARGET_TP}`);
      } else {
        console.log(`[audio-v13] True peak: ${tp} dBTP ✓`);
      }
    }
    if (Number.isFinite(lra)) {
      console.log(`[audio-v13] Loudness range: ${lra} LU`);
    }
  } else {
    console.warn('[audio-v13] Could not probe final loudness');
  }

  console.log('[audio-v13] Done.');
}

main();
