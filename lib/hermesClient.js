import { resolveHermesUrl } from './providerStatus.js';
import { sanitizeProviderError } from './validation.js';

// Official Hermes payment skills catalog.
// https://hermes-agent.nousresearch.com/docs/reference/optional-skills-catalog#payments
export const OFFICIAL_PAYMENT_SKILLS = [
  'official/payments/stripe-link-cli',
  'official/payments/stripe-projects',
  'official/payments/mpp-agent',
];

const DETERMINISTIC_PLAYBOOK = {
  name: 'Agent IC Bounded Capital Experiment Playbook',
  description:
    'Reusable Hermes skill for approving a spend envelope, running a governed micro-pilot, blocking out-of-policy actions, importing evidence, and deciding whether the work earned more capital.',
  requestedSkills: OFFICIAL_PAYMENT_SKILLS,
  steps: [
    'Ingest normalized IC proposal + evaluation.',
    'Authorize Stripe spend envelope using official/payments/stripe-link-cli.',
    'Provision sandbox SaaS credentials using official/payments/stripe-projects.',
    'Route per-call API payments through official/payments/mpp-agent.',
    'Block out-of-policy tool calls and emit audit events.',
    'Import evidence receipts and issue continue / revise / kill decision.',
  ],
};

export function buildDeterministicSkillPlan() {
  return [...OFFICIAL_PAYMENT_SKILLS];
}

export async function dispatchToHermes(proposal, evaluation) {
  const start = Date.now();
  const url = resolveHermesUrl();

  if (!url) {
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
        event: 'capital_experiment_evaluated',
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
