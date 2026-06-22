import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isHermesNemoHermesLive, resolveHermesNemoHermesSandboxName, resolveHermesUrl } from './providerStatus.js';
import { sanitizeProviderError } from './validation.js';

// Official Hermes payment skills catalog.
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
  requestedSkills: OFFICIAL_PAYMENT_SKILLS,
  steps: [
    'Ingest normalized service-trial proposal and evaluation.',
    'Authorize Stripe test-mode spend envelope using official/payments/stripe-link-cli.',
    'Provision scoped service credentials using official/payments/stripe-projects.',
    'Route per-call API payments through official/payments/mpp-agent.',
    'Block out-of-policy tool calls and emit audit events.',
    'Import workload receipts and issue continue / revise / kill expansion decision.',
  ],
};

export function buildDeterministicSkillPlan() {
  return [...OFFICIAL_PAYMENT_SKILLS];
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
  const timeoutSeconds = clampNumber(Number(process.env.AGENT_IC_HERMES_TIMEOUT_SECONDS || 75), 10, 180);
  const sessionScript =
    'import glob,json,os; files=sorted(glob.glob("/sandbox/.hermes/sessions/session_*.json"), key=os.path.getmtime, reverse=True); print(json.load(open(files[0])).get("session_id","") if files else "")';
  const shellCommand =
    `out="$(hermes --pass-session-id -z "$AGENT_IC_HERMES_PROMPT")"; ` +
    'status=$?; ' +
    `sid="$(python3 -c '${sessionScript}')"; ` +
    'printf "__AGENT_IC_HERMES_OUTPUT__\\n%s\\n__AGENT_IC_HERMES_SESSION__\\n%s\\n" "$out" "$sid"; ' +
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
    ], {
      timeoutMs: (timeoutSeconds + 15) * 1000,
      envExtra: {
        AGENT_IC_HERMES_PROMPT: prompt,
      },
    });

    const combined = `${result.stdout}\n${result.stderr}`.trim();
    const output = extractMarkedBlock(combined, '__AGENT_IC_HERMES_OUTPUT__', '__AGENT_IC_HERMES_SESSION__');
    const hermesSessionId = extractAfterMarker(combined, '__AGENT_IC_HERMES_SESSION__');
    const modelPayload = parseJsonObject(output);
    const skillPlan = normalizeSkillPlan(modelPayload?.selectedSkills || modelPayload?.skillPlan || modelPayload?.skill_plan);
    const summary =
      typeof modelPayload?.summary === 'string'
        ? modelPayload.summary
        : typeof modelPayload?.rationale === 'string'
          ? modelPayload.rationale
          : String(output || '').slice(0, 240);

    if (!hermesSessionId) {
      return {
        ok: false,
        taskId: null,
        skillPlan,
        playbook: DETERMINISTIC_PLAYBOOK,
        skillSource: 'deterministic-catalog',
        provider: 'nemohermes',
        sandboxId: sandboxName,
        latencyMs: Date.now() - start,
        error: 'NemoHermes Hermes dispatch did not return a session id',
      };
    }

    const taskId = `hermes-session-${hermesSessionId}`;
    return {
      ok: true,
      taskId,
      hermesSessionId,
      skillPlan,
      playbook: {
        ...DETERMINISTIC_PLAYBOOK,
        id: `nemohermes-${hermesSessionId}`,
        executionSummary: summary,
        sandboxId: sandboxName,
      },
      skillSource: 'nemohermes-sandbox',
      provider: 'nemohermes',
      sandboxId: sandboxName,
      command: 'nemohermes exec -- hermes -z',
      outputSha256: createHash('sha256').update(output || '').digest('hex'),
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

function buildNemoHermesPrompt(proposal, evaluation) {
  const cap = evaluation.spendEnvelope?.cap || evaluation.autonomousSpendCap || proposal.microPilot?.envelopeDollars || 100;
  return [
    'Agent IC live Hermes dispatch for a governed agentic-service trial.',
    'Return only compact JSON with keys ok, selectedSkills, summary.',
    `proposalId=${proposal.id}.`,
    `company=${proposal.company}.`,
    `mission=${proposal.microPilot?.mission || proposal.title}.`,
    `decision=${evaluation.microPilot?.decision || evaluation.decision}.`,
    `envelopeCapDollars=${cap}.`,
    `nextCapDollars=${evaluation.microPilot?.nextCap || Math.round(cap * 2.5)}.`,
    `requiredSkills=${buildDeterministicSkillPlan().join(',')}.`,
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

function extractAfterMarker(text, marker) {
  const raw = String(text || '');
  const markerIndex = raw.indexOf(marker);
  if (markerIndex === -1) return '';
  return raw.slice(markerIndex + marker.length).trim().split(/\s+/)[0] || '';
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
