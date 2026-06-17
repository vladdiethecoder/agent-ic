#!/usr/bin/env node
/**
 * Reset the demo environment before a final recording.
 *
 * - Truncates the audit log (with explicit confirmation).
 * - Removes prior final demo outputs from demo-out/ and remotion/public/ui-final.webm.
 */

import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.AGENT_IC_BASE_URL || 'http://127.0.0.1:3000';
const projectRoot = process.cwd();

async function resetAuditLog() {
  const res = await fetch(`${baseUrl}/api/audit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'reset',
      confirmReset: 'AGENT_IC_DEMO_RESET',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Audit reset failed: ${res.status} ${text}`);
  }
  console.log('Audit log reset');
}

async function cleanOutputs() {
  const outDir = path.join(projectRoot, 'demo-out');
  await mkdir(outDir, { recursive: true });

  const filesToRemove = [
    path.join(outDir, 'agent-ic-demo-final.mp4'),
    path.join(outDir, 'agent-ic-ui-final.webm'),
    path.join(outDir, 'voiceover-final.wav'),
    path.join(projectRoot, 'remotion', 'public', 'ui-final.webm'),
    path.join(projectRoot, 'remotion', 'public', 'voiceover-final.wav'),
    path.join(projectRoot, 'remotion', 'edit-plan-final.json'),
    path.join(projectRoot, 'remotion', 'src', 'captions-final.json'),
    path.join(projectRoot, 'remotion', 'src', 'payload-final.json'),
  ];

  for (const file of filesToRemove) {
    try {
      await rm(file, { force: true });
      console.log(`Removed ${path.relative(projectRoot, file)}`);
    } catch {
      // ignore
    }
  }
}

try {
  await resetAuditLog();
} catch (err) {
  console.warn(`Could not reset audit log (server may not be running): ${err.message}`);
}

await cleanOutputs();
console.log('Demo environment reset for final recording.');
