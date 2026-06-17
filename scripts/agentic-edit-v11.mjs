#!/usr/bin/env node
import { existsSync } from 'node:fs';

const required = [
  'demo/voiceover-v11.txt',
  'remotion/public/voiceover-v11.wav',
  'demo-out/ui-v11.webm',
  'demo-out/stage-timestamps-v11.json',
];

let ok = true;
for (const file of required) {
  if (!existsSync(file)) {
    console.error(`Missing: ${file}`);
    ok = false;
  } else {
    console.log(`OK: ${file}`);
  }
}

if (!ok) {
  console.error('\nPrerequisites for caption/edit plan generation are missing.');
  console.error('Run: npm run demo:voice-v11 && npm run demo:record-v11');
  process.exit(1);
}

console.log('\nPrerequisites met; handing off to generate-captions-v11.py.');
