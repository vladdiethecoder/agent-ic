#!/usr/bin/env node
import fs from 'node:fs/promises';

const inputPath = 'demo-out/aligned-words-v12.json';
const outputPath = 'remotion/src/captions-v12.json';
const fps = 30;

const maxPhraseWords = 10;
const maxPhraseChars = 42;

async function main() {
  const raw = await fs.readFile(inputPath, 'utf8');
  const data = JSON.parse(raw);
  const words = data.words || [];
  const phrases = [];
  let current = [];

  for (const w of words) {
    const candidate = [...current.map((x) => x.word), w.word].join(' ');
    if (
      current.length >= maxPhraseWords ||
      candidate.length > maxPhraseChars
    ) {
      phrases.push({
        text: current.map((x) => x.word).join(' '),
        start: current[0].start,
        end: current[current.length - 1].end,
      });
      current = [w];
    } else {
      current.push(w);
    }
  }
  if (current.length) {
    phrases.push({
      text: current.map((x) => x.word).join(' '),
      start: current[0].start,
      end: current[current.length - 1].end,
    });
  }

  const captions = phrases.map((p) => ({
    text: p.text,
    startFrame: Math.max(0, Math.round(p.start * fps)),
    endFrame: Math.round(p.end * fps),
  }));

  await fs.writeFile(outputPath, JSON.stringify(captions, null, 2));
  console.log(`Wrote ${captions.length} aligned captions to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
