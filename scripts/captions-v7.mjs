#!/usr/bin/env node
/**
 * Convert the agentic edit plan into a Remotion captions JSON file.
 *
 * Input: remotion/edit-plan.json
 * Output: remotion/src/captions.json
 */

import { readFileSync, writeFileSync } from 'node:fs';

const planPath = process.argv[2] || 'remotion/edit-plan.json';
const outputPath = process.argv[3] || 'remotion/src/captions.json';

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const captions = (plan.captions || []).map(({ startFrame, endFrame, text }) => ({
  startFrame,
  endFrame,
  text,
}));

writeFileSync(outputPath, JSON.stringify(captions, null, 2));
console.log(`Wrote ${outputPath} with ${captions.length} captions`);
