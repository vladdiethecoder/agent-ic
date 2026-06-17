import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchToHermes, OFFICIAL_PAYMENT_SKILLS } from '../lib/hermesClient.js';

function makeProposal() {
  return {
    id: 'atlas-freight-rma-copilot',
    company: 'Atlas Freight',
    title: 'Autonomous RMA + claims copilot',
    pain: 'Late freight exceptions drain margins',
    ask: 185000,
    durationWeeks: 12,
    microPilot: { mission: 'Triage late-freight cases', durationHours: 72 },
  };
}

function makeEvaluation() {
  return {
    proposalId: 'atlas-freight-rma-copilot',
    decision: 'CONTINUE',
    score: 82,
    governanceScore: 79,
    evidenceScore: 76,
    confidence: 'medium',
    recommendedBudget: 185000,
    autonomousSpendCap: 35000,
    paybackDays: 38,
    roiMultiple: 2.36,
    thesis: 'Strong ROI with bounded autonomy.',
    nextActions: ['Create Stripe Checkout Session'],
    riskRegister: [{ name: 'Tool overreach', severity: 'medium', mitigation: 'Scope limits' }],
  };
}

test('Hermes client dispatch and fallback behavior', { concurrency: false }, async (t) => {
  await t.test('returns task and playbook on success', async () => {
    const oldUrl = process.env.HERMES_AGENT_URL;
    const oldToken = process.env.HERMES_AGENT_TOKEN;
    const oldFetch = global.fetch;

    process.env.HERMES_AGENT_URL = 'http://localhost:8080/webhooks/agent-ic-evaluate';
    process.env.HERMES_AGENT_TOKEN = 'test-token';

    global.fetch = async (url, options) => {
      assert.equal(url, process.env.HERMES_AGENT_URL);
      assert.equal(options.headers.authorization, 'Bearer test-token');
      const body = JSON.parse(options.body);
      assert.equal(body.proposal.id, 'atlas-freight-rma-copilot');
      assert.equal(body.evaluation.decision, 'CONTINUE');
      assert.equal(body.source, 'agent-ic-v8');
      assert.deepEqual(body.requestedSkills, OFFICIAL_PAYMENT_SKILLS);
      return Response.json({
        taskId: 'task-abc-123',
        skillPlan: ['ingest', 'evaluate', 'execute'],
        playbook: { id: 'playbook-1' },
      });
    };

    try {
      const result = await dispatchToHermes(makeProposal(), makeEvaluation());
      assert.equal(result.ok, true);
      assert.equal(result.taskId, 'task-abc-123');
      assert.deepEqual(result.skillPlan, ['ingest', 'evaluate', 'execute']);
      assert.deepEqual(result.playbook, { id: 'playbook-1' });
      assert.equal(result.skillSource, 'hermes-gateway');
      assert.equal(result.error, null);
      assert.ok(Number.isFinite(result.latencyMs));
    } finally {
      if (oldUrl === undefined) delete process.env.HERMES_AGENT_URL;
      else process.env.HERMES_AGENT_URL = oldUrl;
      if (oldToken === undefined) delete process.env.HERMES_AGENT_TOKEN;
      else process.env.HERMES_AGENT_TOKEN = oldToken;
      global.fetch = oldFetch;
    }
  });

  await t.test('falls back gracefully when gateway is not configured', async () => {
    const oldUrl = process.env.HERMES_AGENT_URL;
    const oldFetch = global.fetch;
    delete process.env.HERMES_AGENT_URL;
    global.fetch = async () => {
      throw new Error('fetch should not be called');
    };

    try {
      const result = await dispatchToHermes(makeProposal(), makeEvaluation());
      assert.equal(result.ok, false);
      assert.equal(result.taskId, null);
      assert.equal(result.error, 'HERMES_AGENT_URL not configured');
      assert.deepEqual(result.skillPlan, OFFICIAL_PAYMENT_SKILLS);
      assert.equal(result.skillSource, 'deterministic-catalog');
      assert.ok(result.playbook);
      assert.ok(Number.isFinite(result.latencyMs));
    } finally {
      if (oldUrl === undefined) delete process.env.HERMES_AGENT_URL;
      else process.env.HERMES_AGENT_URL = oldUrl;
      global.fetch = oldFetch;
    }
  });

  await t.test('falls back gracefully on HTTP error', async () => {
    const oldUrl = process.env.HERMES_AGENT_URL;
    const oldFetch = global.fetch;
    process.env.HERMES_AGENT_URL = 'http://localhost:8080/webhooks/agent-ic-evaluate';

    global.fetch = async () => {
      return new Response('gateway timeout', { status: 504 });
    };

    try {
      const result = await dispatchToHermes(makeProposal(), makeEvaluation());
      assert.equal(result.ok, false);
      assert.equal(result.taskId, null);
      assert.match(result.error, /504/);
      assert.deepEqual(result.skillPlan, OFFICIAL_PAYMENT_SKILLS);
      assert.equal(result.skillSource, 'deterministic-catalog');
      assert.ok(result.playbook);
      assert.ok(Number.isFinite(result.latencyMs));
    } finally {
      if (oldUrl === undefined) delete process.env.HERMES_AGENT_URL;
      else process.env.HERMES_AGENT_URL = oldUrl;
      global.fetch = oldFetch;
    }
  });

  await t.test('falls back gracefully on network error', async () => {
    const oldUrl = process.env.HERMES_AGENT_URL;
    const oldFetch = global.fetch;
    process.env.HERMES_AGENT_URL = 'http://localhost:8080/webhooks/agent-ic-evaluate';

    global.fetch = async () => {
      throw new TypeError('fetch failed');
    };

    try {
      const result = await dispatchToHermes(makeProposal(), makeEvaluation());
      assert.equal(result.ok, false);
      assert.equal(result.taskId, null);
      assert.match(result.error, /fetch failed/);
      assert.deepEqual(result.skillPlan, OFFICIAL_PAYMENT_SKILLS);
      assert.equal(result.skillSource, 'deterministic-catalog');
      assert.ok(result.playbook);
      assert.ok(Number.isFinite(result.latencyMs));
    } finally {
      if (oldUrl === undefined) delete process.env.HERMES_AGENT_URL;
      else process.env.HERMES_AGENT_URL = oldUrl;
      global.fetch = oldFetch;
    }
  });

  await t.test('supports task_id and skill_plan fallback fields', async () => {
    const oldUrl = process.env.HERMES_AGENT_URL;
    const oldFetch = global.fetch;
    process.env.HERMES_AGENT_URL = 'http://localhost:8080/webhooks/agent-ic-evaluate';

    global.fetch = async () => {
      return Response.json({ task_id: 'task-legacy-1', skill_plan: ['step-a', 'step-b'] });
    };

    try {
      const result = await dispatchToHermes(makeProposal(), makeEvaluation());
      assert.equal(result.ok, true);
      assert.equal(result.taskId, 'task-legacy-1');
      assert.deepEqual(result.skillPlan, ['step-a', 'step-b']);
    } finally {
      if (oldUrl === undefined) delete process.env.HERMES_AGENT_URL;
      else process.env.HERMES_AGENT_URL = oldUrl;
      global.fetch = oldFetch;
    }
  });
});
