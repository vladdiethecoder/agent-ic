import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const FPS = 30;
const MAIN_FRAMES = 2580;

const text = readFileSync('demo/voiceover-v6.txt', 'utf8');
const sentences = text
  .replace(/\n+/g, ' ')
  .split(/(?<=[.!?])\s+/)
  .map((s) => s.trim())
  .filter(Boolean);

const durations = sentences.map((s) => s.split(/\s+/).length);
const totalWords = durations.reduce((a, b) => a + b, 0);

let currentFrame = 0;
const captions = sentences.map((sentence, i) => {
  const wordCount = durations[i];
  const frames = Math.round((wordCount / totalWords) * MAIN_FRAMES);
  const start = currentFrame;
  const end = i === sentences.length - 1 ? MAIN_FRAMES : Math.min(currentFrame + frames, MAIN_FRAMES);
  currentFrame = end;
  return { startFrame: start, endFrame: end, text: sentence };
});

writeFileSync('remotion/src/captions.json', JSON.stringify(captions, null, 2));
console.log(`Wrote remotion/src/captions.json with ${captions.length} captions`);
