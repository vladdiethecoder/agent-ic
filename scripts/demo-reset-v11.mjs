#!/usr/bin/env node
import { rm, mkdir } from 'node:fs/promises';

// Only clean v11-specific outputs so the v10 fallback remains intact.
await rm('demo-out/terminals-v11', { recursive: true, force: true });
await rm('demo-out/raw', { recursive: true, force: true });
await rm('demo-out/ui-v11.webm', { force: true });
await rm('demo-out/stage-timestamps-v11.json', { force: true });
await mkdir('demo-out/terminals-v11', { recursive: true });
await mkdir('demo-out/raw', { recursive: true });
await rm('remotion/public/ui-v11.webm', { force: true });
await rm('remotion/public/voiceover-v11.wav', { force: true });
await rm('remotion/public/terminals-v11', { recursive: true, force: true });
console.log('[demo-reset-v11] cleaned v11 outputs');
