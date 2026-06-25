#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, '..');
const INTERNAL_BASE_URL = (process.env.AGENT_IC_INTERNAL_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const STRIPE_ID_FILE = process.env.AGENT_IC_STRIPE_ID_FILE || '/tmp/agent-ic-final-stripe-session';
const GATE_FILE = process.env.AGENT_IC_GATE_FILE || '/tmp/agent-ic-final-gate.json';

function maskId(id) {
  if (!id) return null;
  const value = String(id);
  if (value.length < 18) return value;
  return `${value.slice(0, 14)}...${value.slice(-4)}`;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function loadText(file) {
  return fs.readFile(file, 'utf8');
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(`${INTERNAL_BASE_URL}${pathname}`, options);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.message || json.error || `HTTP ${response.status}`);
  }
  return json;
}

async function proofStripe() {
  const sessionId = (await loadText(STRIPE_ID_FILE)).trim();
  if (!sessionId.startsWith('cs_test')) throw new Error('Stripe test-mode session id is missing');
  const result = await fetchJson(`/api/retrieve-checkout-session?session_id=${encodeURIComponent(sessionId)}`);
  print({
    provider: 'Stripe',
    proof: 'Checkout Session create + retrieve',
    sessionId: maskId(result.sessionId || result.id || sessionId),
    mode: result.mode,
    status: result.status,
    paymentStatus: result.paymentStatus,
    amountTotalCents: result.amountTotal,
    currency: result.currency,
    metadata: {
      proposalId: result.metadata?.proposal_id || null,
      spendCapDollars: result.metadata?.autonomous_spend_cap_dollars || null,
    },
  });
}

async function proofNemotron() {
  const result = await fetchJson('/api/nemotron-smoke');
  if (result.state !== 'live') throw new Error('Nemotron smoke is not live');
  print({
    provider: 'NVIDIA Nemotron',
    state: result.state,
    model: result.model,
    requestId: maskId(result.requestId),
    latencyMs: result.latencyMs,
  });
}

async function proofHermes() {
  const result = await fetchJson('/api/proof-report');
  const hermes = result.receipts?.hermes || {};
  if (hermes.state !== 'recorded') {
    throw new Error('Hermes dispatch receipt is missing');
  }
  print({
    provider: 'Hermes Agent',
    proof: hermes.skillSource === 'nemohermes-sandbox' ? 'NemoHermes sandbox dispatch' : 'gateway task dispatch',
    taskId: hermes.taskIdMasked,
    hermesSessionId: hermes.hermesSessionIdMasked,
    sandboxId: hermes.sandboxId,
    selectedSkills: hermes.selectedSkills,
    summary: hermes.outputSummary,
  });
}

async function proofPolicy() {
  const text = await loadText(GATE_FILE);
  const result = JSON.parse(text);
  if (!result.externalLive) {
    throw new Error('External NemoHermes/OpenShell receipt is missing');
  }
  print({
    provider: 'NemoHermes / OpenShell',
    proof: 'external sandbox policy block',
    state: result.governance?.state || 'live',
    httpStatus: result.gate?.status || 403,
    policy: result.gate?.policy || 'openshell_network_policy',
    attemptedAmountDollars: result.metrics?.attemptedAmount || result.gate?.attemptedAmount,
    capDollars: result.metrics?.cap || result.gate?.cap,
    actor: result.gate?.actor || 'NemoHermes/OpenShell broker',
  });
}

async function proofPlaybook() {
  const result = await fetchJson('/api/playbook?version=v1');
  const content = result.content || '';
  print({
    artifact: 'SKILL.md',
    filename: result.filename,
    publicPath: result.filepath || 'skills/governed-agentic-service-trial-v1.SKILL.md',
    sha256: createHash('sha256').update(content).digest('hex').slice(0, 16),
    containsPlaybook: content.includes('Bounded Capital Experiment Playbook'),
  });
}

async function proofRerun() {
  const result = await fetchJson('/api/run-from-playbook', { method: 'POST' });
  print({
    command: 'Run from playbook',
    ranFromPlaybook: Boolean(result.ranFromPlaybook),
    playbookSource: result.playbookSource,
    secondMission: result.playbookMission,
    verdict: result.decision?.verdict,
    nextCapDollars: result.decision?.nextCap,
  });
}

async function proofGpu() {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,driver_version,utilization.gpu,memory.used',
      '--format=csv,noheader,nounits',
    ], { timeout: 5000, maxBuffer: 64 * 1024 });
    const first = stdout.trim().split('\n')[0] || '';
    const [name, driverVersion, utilizationGpu, memoryUsedMiB] = first.split(',').map((part) => part.trim());
    print({
      provider: 'NVIDIA GPU',
      name,
      driverVersion,
      utilizationGpuPercent: Number(utilizationGpu),
      memoryUsedMiB: Number(memoryUsedMiB),
    });
  } catch (error) {
    print({ provider: 'NVIDIA GPU', state: 'unavailable', error: error.message });
  }
}

async function main() {
  const [, , group, command] = process.argv;
  if (group !== 'proof') {
    throw new Error('Usage: agent-ic proof <hermes|stripe|nemotron|policy|playbook|rerun|gpu>');
  }
  switch (command) {
    case 'hermes':
      return proofHermes();
    case 'stripe':
      return proofStripe();
    case 'nemotron':
      return proofNemotron();
    case 'policy':
      return proofPolicy();
    case 'playbook':
      return proofPlaybook();
    case 'rerun':
      return proofRerun();
    case 'gpu':
      return proofGpu();
    default:
      throw new Error('Usage: agent-ic proof <hermes|stripe|nemotron|policy|playbook|rerun|gpu>');
  }
}

main().catch((error) => {
  process.stderr.write(`proof failed: ${error.message}\n`);
  process.exit(1);
});
