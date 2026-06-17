#!/usr/bin/env node
import fs from 'node:fs/promises';

// Placeholder caption generator for v12 composition testing.
// The I4 workstream will replace this with WhisperX word-level aligned captions.

const inputPath = 'remotion/src/captions-v11.json';
const outputPath = 'remotion/src/captions-v12.json';

function stripMetadata(text) {
  // Remove lines that start with bracketed storyboard metadata like "[0:00–0:20] Problem"
  return text
    .split('\n')
    .map((line) => line.replace(/^\[[^\]]+\]\s*\w+\s*/, '').trim())
    .filter(Boolean)
    .join(' ');
}

function splitPhrase(text, startFrame, endFrame) {
  const words = text.split(' ');
  const maxWords = 10;
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '));
  }
  const duration = endFrame - startFrame;
  const chunkDuration = Math.floor(duration / chunks.length);
  return chunks.map((chunk, idx) => ({
    text: chunk,
    startFrame: startFrame + idx * chunkDuration,
    endFrame: startFrame + (idx + 1) * chunkDuration,
  }));
}

async function main() {
  const raw = await fs.readFile(inputPath, 'utf8');
  const captions = JSON.parse(raw);
  const out = [];
  for (const c of captions) {
    const clean = stripMetadata(c.text);
    if (!clean) continue;
    if (clean.length <= 50) {
      out.push({ text: clean, startFrame: c.startFrame, endFrame: c.endFrame });
    } else {
      out.push(...splitPhrase(clean, c.startFrame, c.endFrame));
    }
  }
  await fs.writeFile(outputPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.length} placeholder captions to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
