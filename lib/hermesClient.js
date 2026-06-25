import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isHermesNemoHermesLive, resolveHermesNemoHermesSandboxName, resolveHermesUrl } from './providerStatus.js';
import { sanitizeProviderError } from './validation.js';

export const AGENT_IC_HERMES_SKILLS = [
  'governed-agentic-service-trial-v1',
  'hermes-agent',
];

// Official Hermes payment skills catalog references.
// https://hermes-agent.nousresearch.com/docs/reference/optional-skills-catalog#payments
export const OFFICIAL_PAYMENT_SKILLS = [
  'official/payments/stripe-link-cli',
  'official/payments/stripe-projects',
  'official/payments/mpp-agent',
];

const DETERMINISTIC_PLAYBOOK = {
  name: 'Agent IC Governed Service Trial Playbook',
  description:
    'Reusable Hermes-compatible skill for approving a bounded service-trial envelope, running an agentic service against inspectable workload evidence, blocking out-of-policy actions, importing receipts, and deciding whether the service earned expansion.',
  requestedSkills: AGENT_IC_HERMES_SKILLS,
  paymentSkillReferences: OFFICIAL_PAYMENT_SKILLS,
  steps: [
    'Ingest normalized service-trial proposal and evaluation.',
    'Record a governed-trial handoff using governed-agentic-service-trial-v1.',
    'Reference Stripe test-mode envelope controls and official payment catalog skills for downstream payment execution.',
    'Block out-of-policy tool calls and emit audit events.',
    'Import workload receipts and issue continue / revise / kill expansion decision.',
  ],
};

export function buildDeterministicSkillPlan() {
  return [...AGENT_IC_HERMES_SKILLS];
}

export async function dispatchToHermes(proposal, evaluation) {
  const start = Date.now();
  const url = resolveHermesUrl();

  if (!url && !isHermesNemoHermesLive()) {
    return {
      ok: false,
      taskId: null,
      skillPlan: buildDeterministicSkillPlan(),
      playbook: DETERMINISTIC_PLAYBOOK,
      skillSource: 'deterministic-catalog',
      latencyMs: Date.now() - start,
      error: 'HERMES_AGENT_URL not configured',
    };
  }

  if (!url && isHermesNemoHermesLive()) {
    return dispatchToNemoHermesSandbox(proposal, evaluation, start);
  }

  try {
    const headers = {
      'content-type': 'application/json',
    };
    const token = process.env.HERMES_AGENT_TOKEN || '';
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: 'agent-ic-v8',
        proposal: normalizeProposal(proposal),
        evaluation: normalizeEvaluation(evaluation),
        requestedSkills: buildDeterministicSkillPlan(),
        event: 'agentic_service_trial_evaluated',
        ts: new Date().toISOString(),
      }),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        taskId: null,
        skillPlan: buildDeterministicSkillPlan(),
        playbook: DETERMINISTIC_PLAYBOOK,
        skillSource: 'deterministic-catalog',
        latencyMs,
        error: sanitizeProviderError(`Hermes gateway HTTP ${response.status}: ${text.slice(0, 240)}`),
      };
    }

    const payload = await response.json();
    const taskId = payload?.taskId || payload?.task_id || null;
    const skillPlan = payload?.skillPlan || payload?.skill_plan || buildDeterministicSkillPlan();
    const playbook = payload?.playbook || DETERMINISTIC_PLAYBOOK;

    if (!taskId) {
      return {
        ok: false,
        taskId: null,
        skillPlan,
        playbook,
        skillSource: 'deterministic-catalog',
        latencyMs,
        error: 'Hermes gateway response missing taskId',
      };
    }

    return {
      ok: true,
      taskId,
      skillPlan,
      playbook,
      skillSource: 'hermes-gateway',
      latencyMs,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      taskId: null,
      skillPlan: buildDeterministicSkillPlan(),
      playbook: DETERMINISTIC_PLAYBOOK,
      skillSource: 'deterministic-catalog',
      latencyMs: Date.now() - start,
      error: sanitizeProviderError(error),
    };
  }
}

async function dispatchToNemoHermesSandbox(proposal, evaluation, start) {
  const sandboxName = resolveHermesNemoHermesSandboxName();
  const prompt = buildNemoHermesPrompt(proposal, evaluation);
  const promptBase64 = Buffer.from(prompt, 'utf8').toString('base64');
  const timeoutSeconds = clampNumber(Number(process.env.AGENT_IC_HERMES_TIMEOUT_SECONDS || 75), 10, 180);
  const shellCommand =
    'prompt="$(printf "%s" "$1" | base64 -d)"; ' +
    `out="$(NO_COLOR=1 hermes chat -Q --pass-session-id --skills governed-agentic-service-trial-v1 -q "$prompt" 2>&1)"; ` +
    'status=$?; ' +
    'printf "__AGENT_IC_HERMES_OUTPUT__\\n%s\\n__AGENT_IC_HERMES_DONE__\\n" "$out"; ' +
    'exit $status';

  try {
    const result = await runNemoHermes([
      sandboxName,
      'exec',
      '--timeout',
      String(timeoutSeconds),
      '--no-tty',
      '--',
      'bash',
      '-lc',
      shellCommand,
      'agent-ic-hermes-prompt',
      promptBase64,
    ], {
      timeoutMs: (timeoutSeconds + 15) * 1000,
    });

    const combined = `${result.stdout}\n${result.stderr}`.trim();
    const rawOutput = extractMarkedBlock(combined, '__AGENT_IC_HERMES_OUTPUT__', '__AGENT_IC_HERMES_DONE__');
    const hermesSessionId = extractHermesSessionId(rawOutput);
    const output = stripHermesSessionLine(rawOutput);
    const modelPayload = parseJsonObject(output);
    const skillPlan = normalizeSkillPlan(modelPayload?.selectedSkills || modelPayload?.skillPlan || modelPayload?.skill_plan);
    const summary =
      typeof modelPayload?.summary === 'string'
        ? modelPayload.summary
        : typeof modelPayload?.rationale === 'string'
          ? modelPayload.rationale
          : String(output || '').slice(0, 240);
    const outputSha256 = createHash('sha256').update(output || '').digest('hex');
    const taskId = hermesSessionId ? `hermes-session-${hermesSessionId}` : `nemohermes-exec-${outputSha256.slice(0, 16)}`;
    return {
      ok: true,
      taskId,
      hermesSessionId: hermesSessionId || null,
      skillPlan,
      playbook: {
        ...DETERMINISTIC_PLAYBOOK,
        id: hermesSessionId ? `nemohermes-${hermesSessionId}` : taskId,
        executionSummary: summary,
        sandboxId: sandboxName,
      },
      skillSource: 'nemohermes-sandbox',
      provider: 'nemohermes',
      sandboxId: sandboxName,
      command: 'nemohermes exec -- hermes chat -Q --pass-session-id --skills governed-agentic-service-trial-v1',
      outputSha256,
      outputSummary: summary,
      latencyMs: Date.now() - start,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      taskId: null,
      skillPlan: buildDeterministicSkillPlan(),
      playbook: DETERMINISTIC_PLAYBOOK,
      skillSource: 'deterministic-catalog',
      provider: 'nemohermes',
      sandboxId: sandboxName,
      latencyMs: Date.now() - start,
      error: sanitizeProviderError(`${error?.message || error} ${error?.stdout || ''} ${error?.stderr || ''}`),
    };
  }
}

function buildNemoHermesPrompt(proposal = {}, evaluation = {}) {
  const microPilot = proposal?.microPilot || {};
  const evaluationPilot = evaluation?.microPilot || {};
  const cap = evaluation?.spendEnvelope?.cap || evaluation?.autonomousSpendCap || microPilot.envelopeDollars || 100;
  return [
    'Agent IC live Hermes dispatch for a governed agentic-service trial.',
    'Return only compact JSON with keys ok, selectedSkills, summary.',
    `proposalId=${proposal?.id || 'unknown-proposal'}.`,
    `company=${proposal?.company || 'unknown-buyer'}.`,
    `mission=${microPilot.mission || proposal?.title || 'governed service trial'}.`,
    `decision=${evaluationPilot.decision || evaluation?.decision || 'pending'}.`,
    `envelopeCapDollars=${cap}.`,
    `nextCapDollars=${evaluationPilot.nextCap || Math.round(cap * 2.5)}.`,
    `installedSkills=${buildDeterministicSkillPlan().join(',')}.`,
    `paymentCatalogReferences=${OFFICIAL_PAYMENT_SKILLS.join(',')}.`,
    'Use governed-agentic-service-trial-v1 for the selectedSkills value.',
    'Summarize the recorded governed-trial handoff; do not claim unavailable payment catalog skills were executed.',
    'Do not include secrets, host paths, localhost URLs, or markdown fences.',
  ].join(' ');
}

function normalizeSkillPlan(value) {
  if (!Array.isArray(value)) return buildDeterministicSkillPlan();
  const cleaned = value.map((item) => String(item || '').trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : buildDeterministicSkillPlan();
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function extractMarkedBlock(text, startMarker, endMarker) {
  const raw = String(text || '');
  const startIndex = raw.indexOf(startMarker);
  if (startIndex === -1) return raw.trim();
  const contentStart = startIndex + startMarker.length;
  const endIndex = raw.indexOf(endMarker, contentStart);
  return raw.slice(contentStart, endIndex === -1 ? undefined : endIndex).trim();
}

function extractHermesSessionId(text) {
  const match = String(text || '').match(/^session_id:\s*([A-Za-z0-9_-]+)\s*$/m);
  return match?.[1] || '';
}

function stripHermesSessionLine(text) {
  return String(text || '').replace(/^session_id:\s*[A-Za-z0-9_-]+\s*\r?\n?/m, '').trim();
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function runNemoHermes(args, { timeoutMs = 90_000, envExtra = {} } = {}) {
  const pathPrefix = process.env.HOME ? `${process.env.HOME}/.local/bin:` : '';
  const env = {
    ...process.env,
    ...envExtra,
    PATH: `${pathPrefix}${process.env.PATH || ''}`,
    DOCKER_HOST: process.env.NEMOCLAW_DOCKER_HOST || 'unix:///run/docker.sock',
  };
  return execFileClosedStdin(process.env.NEMOHERMES_BIN || 'nemohermes', args, {
    env,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
}

function execFileClosedStdin(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    child.stdin?.end();
  });
}

function normalizeProposal(proposal) {
  return {
    id: proposal.id,
    company: proposal.company,
    title: proposal.title,
    pain: proposal.pain,
    ask: proposal.ask,
    durationWeeks: proposal.durationWeeks,
    microPilot: proposal.microPilot,
  };
}

function normalizeEvaluation(evaluation) {
  return {
    proposalId: evaluation.proposalId,
    decision: evaluation.decision,
    score: evaluation.score,
    governanceScore: evaluation.governanceScore,
    evidenceScore: evaluation.evidenceScore,
    confidence: evaluation.confidence,
    recommendedBudget: evaluation.recommendedBudget,
    autonomousSpendCap: evaluation.autonomousSpendCap,
    paybackDays: evaluation.paybackDays,
    roiMultiple: evaluation.roiMultiple,
  };
}
