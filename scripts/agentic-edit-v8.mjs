#!/usr/bin/env node
/**
 * Agentic editing planner for Agent IC v8.
 *
 * Reads the voiceover script, stage timestamps from the base recording, and
 * the v8 orchestration payload, then produces a deterministic JSON edit plan.
 * If AGENTIC_EDIT_LLM_URL is set, the planner first asks a local LLM to map
 * sentences to stages; otherwise it uses keyword heuristics.
 *
 * Output: remotion/edit-plan-v8.json
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const FPS = 30;
const INTRO_FRAMES = 90; // 3 s
const OUTRO_FRAMES = 90; // 3 s
const LEAD_IN_FRAMES = 6; // caption appears slightly before the action

const scriptPath = process.argv[2] || 'demo/voiceover-v8.txt';
const timestampsPath = process.argv[3] || 'remotion/stage-timestamps-v8.json';
const payloadPath = process.argv[4] || 'remotion/src/payload-v8.json';
const audioPath = process.argv[5] || 'remotion/public/voiceover-v8.wav';
const outputPath = process.argv[6] || 'remotion/edit-plan-v8.json';

function ffprobeDuration(file) {
  const result = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8', shell: false }
  );
  const n = parseFloat(result.stdout);
  return Number.isFinite(n) ? n : null;
}

function splitSentences(text) {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadJson(file, fallback = null) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function keywordStageId(sentence) {
  const lower = sentence.toLowerCase();
  const rules = [
    ['kill', 'counterfactual'],
    ['eighty-two', 'counterfactual'],
    ['qa threshold', 'counterfactual'],
    ['without losing control', 'counterfactual'],
    ['operate with money', 'counterfactual'],
    ['counterfactual', 'counterfactual'],
    ['hermes playbook', 'decision'],
    ['playbook', 'decision'],
    ['continue', 'decision'],
    ['decision', 'decision'],
    ['nemoclaw', 'blocked'],
    ['four-oh-three', 'blocked'],
    ['forbidden', 'blocked'],
    ['blocked', 'blocked'],
    ['premium lookup', 'blocked'],
    ['qa agreement', 'evidence'],
    ['qa', 'evidence'],
    ['evidence', 'evidence'],
    ['cases', 'evidence'],
    ['stripe checkout session', 'envelope'],
    ['stripe', 'envelope'],
    ['no session, no money moves', 'envelope'],
    ['no money moves', 'envelope'],
    ['nvidia nim', 'timeline'],
    ['nemotron', 'timeline'],
    ['watch what happens live', 'timeline'],
    ['governed capital account', 'governance'],
    ['operations request', 'mission'],
    ['hermes agent task', 'mission'],
    ['hermes', 'mission'],
    ['mission', 'mission'],
    ['audit', 'audit'],
    ['receipts', 'receipts'],
  ];
  for (const [keyword, stageId] of rules) {
    if (lower.includes(keyword)) return stageId;
  }
  return null;
}

async function llmSentenceMapping(sentences, stages) {
  const url = process.env.AGENTIC_EDIT_LLM_URL;
  const model = process.env.AGENTIC_EDIT_LLM_MODEL || 'llama3.1';
  if (!url) return null;

  const prompt = `You are an agentic video-editing assistant. Map every narration sentence to the most relevant on-screen stage ID.

Available stage IDs and approximate order:
${stages.map((s) => `- ${s.id}: ${s.label}`).join('\n')}

Narration sentences:
${sentences.map((s, i) => `${i}: ${s}`).join('\n')}

Return ONLY a JSON object with no markdown: {"mappings": [{"sentenceIndex": 0, "stageId": "mission"}, ...]}.
If a sentence does not match any stage, use stageId null.`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
    });
    const payload = await response.json();
    const text =
      payload.response ||
      payload.content ||
      payload.message?.content ||
      payload.choices?.[0]?.message?.content ||
      JSON.stringify(payload);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.mappings)) return null;
    return parsed.mappings;
  } catch {
    return null;
  }
}

function buildStageWindows(stages, mainFrames) {
  const ordered = stages.slice().sort((a, b) => a.frame - b.frame);
  const windows = [];
  for (let i = 0; i < ordered.length; i++) {
    const start = ordered[i].frame;
    const end = i < ordered.length - 1 ? ordered[i + 1].frame : mainFrames;
    windows.push({ ...ordered[i], startFrame: start, endFrame: end });
  }
  return windows;
}

async function buildPlan() {
  const text = readFileSync(scriptPath, 'utf8');
  const sentences = splitSentences(text);
  const payload = loadJson(payloadPath, {});
  const stageTimestamps = loadJson(timestampsPath, { stages: [] });
  const stageMap = Object.fromEntries(
    (stageTimestamps.stages || []).map((s) => [s.id, s.frame ?? s.startFrame ?? 0])
  );

  const audioDuration = ffprobeDuration(audioPath) || 74;
  const counterfactualFrame = stageMap.counterfactual || FPS * 24;
  const mainFrames = Math.max(
    Math.ceil(audioDuration * FPS),
    counterfactualFrame + FPS * 4
  );
  const totalFrames = INTRO_FRAMES + mainFrames + OUTRO_FRAMES;

  const defaultStages = [
    { id: 'mission', label: 'Mission loaded', frame: 0 },
    { id: 'governance', label: 'Governance loaded', frame: FPS * 3 },
    { id: 'envelope', label: 'Spend envelope created', frame: FPS * 8 },
    { id: 'timeline', label: 'Live reasoning', frame: FPS * 12 },
    { id: 'blocked', label: 'Out-of-policy spend blocked', frame: FPS * 20 },
    { id: 'evidence', label: 'Evidence imported', frame: FPS * 28 },
    { id: 'decision', label: 'Capital decision issued', frame: FPS * 36 },
    { id: 'receipts', label: 'Provider receipts', frame: FPS * 44 },
    { id: 'audit', label: 'Audit log', frame: FPS * 52 },
    { id: 'counterfactual', label: 'Counterfactual KILL', frame: Math.max(FPS * 24, mainFrames - FPS * 4) },
  ];

  const stages = defaultStages.map((s) => ({
    ...s,
    frame: stageMap[s.id] ?? s.frame,
  }));

  // Stage windows drive caption allocation.
  const stageWindows = buildStageWindows(stages, mainFrames);
  const stageWindowMap = Object.fromEntries(stageWindows.map((w) => [w.id, w]));

  // Sentence -> stage mapping.
  let deterministicMappings = sentences.map((s) => keywordStageId(s));
  const llmMappings = await llmSentenceMapping(sentences, stages);
  if (llmMappings) {
    for (const m of llmMappings) {
      if (m.sentenceIndex >= 0 && m.sentenceIndex < sentences.length) {
        if (m.stageId === null || stageWindowMap[m.stageId]) {
          deterministicMappings[m.sentenceIndex] = m.stageId;
        }
      }
    }
  }

  // Propagate stage context forward and backward for unmapped sentences.
  let lastStage = 'mission';
  for (let i = 0; i < deterministicMappings.length; i++) {
    if (deterministicMappings[i]) {
      lastStage = deterministicMappings[i];
    } else {
      deterministicMappings[i] = lastStage;
    }
  }
  // Any remaining nulls at the start default to mission.
  deterministicMappings = deterministicMappings.map((stageId) => stageId || 'mission');

  // Allocate word-proportionally within each stage window.
  const wordCounts = sentences.map((s) => s.split(/\s+/).length);
  const captions = [];
  for (const window of stageWindows) {
    const indexes = deterministicMappings
      .map((stageId, i) => (stageId === window.id ? i : -1))
      .filter((i) => i !== -1);
    if (!indexes.length) continue;

    const windowWords = indexes.reduce((sum, i) => sum + wordCounts[i], 0);
    const windowFrames = window.endFrame - window.startFrame;
    let cursor = window.startFrame;
    for (let j = 0; j < indexes.length; j++) {
      const i = indexes[j];
      const isLast = j === indexes.length - 1;
      const frames = isLast
        ? window.endFrame - cursor
        : Math.max(12, Math.round((wordCounts[i] / windowWords) * windowFrames));
      captions.push({
        startFrame: Math.max(0, cursor - LEAD_IN_FRAMES),
        endFrame: Math.min(mainFrames, cursor + frames),
        text: sentences[i],
        stageId: window.id,
      });
      cursor += frames;
    }
  }

  // Any unmapped sentences get dropped into the largest available gap.
  const unmapped = sentences
    .map((s, i) => ({ i, s }))
    .filter((_, i) => !deterministicMappings[i]);
  if (unmapped.length) {
    const gaps = stageWindows
      .map((w, idx) => {
        const next = stageWindows[idx + 1];
        const gapStart = w.endFrame;
        const gapEnd = next ? next.startFrame : mainFrames;
        return { start: gapStart, end: gapEnd, size: gapEnd - gapStart };
      })
      .filter((g) => g.size > 30);
    gaps.sort((a, b) => b.size - a.size);
    for (const { i, s } of unmapped) {
      const gap = gaps[0] || { start: 0, end: mainFrames };
      const frames = Math.max(12, Math.min(gap.end - gap.start, wordCounts[i] * 5));
      captions.push({
        startFrame: gap.start,
        endFrame: gap.start + frames,
        text: s,
        stageId: null,
      });
      gap.start += frames;
      gap.size -= frames;
      gaps.sort((a, b) => b.size - a.size);
    }
  }

  // Sort by start frame and clamp.
  captions.sort((a, b) => a.startFrame - b.startFrame);
  for (let i = 0; i < captions.length - 1; i++) {
    captions[i].endFrame = Math.min(captions[i].endFrame, captions[i + 1].startFrame);
  }
  for (const c of captions) {
    c.startFrame = Math.max(0, Math.min(mainFrames - 1, Math.round(c.startFrame)));
    c.endFrame = Math.max(c.startFrame + 6, Math.min(mainFrames, Math.round(c.endFrame)));
  }

  // Helper to resolve stage frame from merged stage list.
  const stageFrame = (id) => stages.find((s) => s.id === id)?.frame ?? 0;
  const nextStageFrame = (id) => {
    const idx = stages.findIndex((s) => s.id === id);
    if (idx === -1) return mainFrames;
    const next = stages[idx + 1];
    return next ? next.frame : mainFrames;
  };

  // Call-outs: one per key stage.
  const callouts = [
    {
      stageId: 'mission',
      startFrame: stageFrame('mission'),
      endFrame: nextStageFrame('mission') - FPS,
      text: payload.mission?.description ? `Mission: ${payload.mission.description}` : 'Hermes task dispatched',
    },
    {
      stageId: 'governance',
      startFrame: stageFrame('governance'),
      endFrame: nextStageFrame('governance') - FPS,
      text: 'Governed capital account: policy envelope + kill criteria',
    },
    {
      stageId: 'envelope',
      startFrame: stageFrame('envelope'),
      endFrame: nextStageFrame('envelope') - FPS,
      text: `Stripe authorization: ${payload.envelope?.cap ? `$${payload.envelope.cap} cap` : '$100 cap'} · no session, no spend`,
    },
    {
      stageId: 'timeline',
      startFrame: stageFrame('timeline'),
      endFrame: nextStageFrame('timeline') - FPS,
      text: payload.nemotron?.state === 'live' ? 'NVIDIA NIM live reasoning' : 'NVIDIA NIM / Nemotron scoring (deterministic fallback)',
    },
    {
      stageId: 'blocked',
      startFrame: stageFrame('blocked'),
      endFrame: nextStageFrame('blocked') - FPS,
      text: `NemoClaw blocks ${payload.blocked?.attemptedTool || 'out-of-policy API call'} — 403 Forbidden`,
    },
    {
      stageId: 'evidence',
      startFrame: stageFrame('evidence'),
      endFrame: nextStageFrame('evidence') - FPS,
      text: payload.evidence
        ? `Evidence: ${payload.evidence.casesProcessed} cases · ${payload.evidence.qaAgreement}% QA`
        : 'Evidence imported',
    },
    {
      stageId: 'decision',
      startFrame: stageFrame('decision'),
      endFrame: nextStageFrame('decision') - FPS,
      text: payload.decision
        ? `Decision: ${payload.decision.verdict} — next cap $${payload.decision.nextCap}`
        : 'Capital decision issued',
    },
    {
      stageId: 'receipts',
      startFrame: stageFrame('receipts'),
      endFrame: nextStageFrame('receipts') - FPS,
      text: 'Provider receipts: Nemotron · Stripe · Hermes · Governance',
    },
    {
      stageId: 'audit',
      startFrame: stageFrame('audit'),
      endFrame: nextStageFrame('audit') - FPS,
      text: `Audit log: ${payload.providerReceipts?.audit?.rowCount || payload.auditRows?.length || 'append-only'} events`,
    },
    {
      stageId: 'counterfactual',
      startFrame: stageFrame('counterfactual'),
      endFrame: mainFrames,
      text: 'Counterfactual KILL: drop QA to 82% and the decision flips',
    },
  ].filter((c) => c.startFrame < mainFrames);

  for (const c of callouts) {
    c.startFrame = Math.max(0, Math.round(c.startFrame));
    c.endFrame = Math.max(c.startFrame + FPS * 3, Math.round(c.endFrame));
  }

  const plan = {
    fps: FPS,
    introFrames: INTRO_FRAMES,
    mainFrames,
    outroFrames: OUTRO_FRAMES,
    totalFrames,
    audioDuration,
    stages: stageTimestamps.stages || defaultStages,
    captions: captions.map(({ startFrame, endFrame, text, stageId }) => ({ startFrame, endFrame, text, stageId })),
    callouts: callouts.map((c) => ({
      stageId: c.stageId,
      startFrame: c.startFrame,
      endFrame: c.endFrame,
      x: 80,
      y: c.stageId === 'blocked' ? 420 : 260,
      width: 560,
      text: c.text,
    })),
  };

  writeFileSync(outputPath, JSON.stringify(plan, null, 2));
  console.log(`Wrote ${outputPath}: ${totalFrames} frames (${(totalFrames / FPS).toFixed(1)}s)`);
}

buildPlan().catch((err) => {
  console.error(err);
  process.exit(1);
});
