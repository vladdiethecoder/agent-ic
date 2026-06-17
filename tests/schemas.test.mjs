import test from 'node:test';
import assert from 'node:assert/strict';
import { seededProposals } from '../lib/demoData.js';
import { scoreProposal } from '../lib/decisionEngine.js';
import { buildProviderReceipts } from '../lib/proofEngine.js';
import {
  AuditRequestSchema,
  EvaluateRequestSchema,
  GovernancePolicySchema,
  HermesPlaybookSchema,
  ProposalSchema,
  ProviderReceiptsSchema,
  RunCapitalExperimentRequestSchema,
  SpendEnvelopeSchema,
  StripeSessionRequestSchema,
  parseSchema,
} from '../lib/schemas.js';

test('Zod schemas validate core domain shapes', async (t) => {
  await t.test('ProposalSchema accepts seeded proposals', () => {
    for (const proposal of seededProposals) {
      const result = parseSchema(ProposalSchema, proposal);
      assert.equal(result.ok, true, `${proposal.id} must validate`);
      assert.equal(result.data.id, proposal.id);
    }
  });

  await t.test('ProposalSchema rejects invalid numeric fields', () => {
    const bad = { ...seededProposals[0], ask: -100 };
    const result = parseSchema(ProposalSchema, bad);
    assert.equal(result.ok, false);
  });

  await t.test('SpendEnvelopeSchema accepts generated envelope', () => {
    const evaluation = scoreProposal(seededProposals[0]);
    const result = parseSchema(SpendEnvelopeSchema, evaluation.spendEnvelope);
    assert.equal(result.ok, true);
    assert.equal(result.data.cap, 100);
  });

  await t.test('GovernancePolicySchema accepts seeded policy', async () => {
    const { governancePolicy } = await import('../lib/demoData.js');
    const result = parseSchema(GovernancePolicySchema, governancePolicy);
    assert.equal(result.ok, true);
    assert.ok(result.data.invariants.length > 0);
  });

  await t.test('API request schemas parse expected inputs', () => {
    assert.equal(parseSchema(EvaluateRequestSchema, { proposalId: 'atlas-freight-rma-copilot' }).ok, true);
    assert.equal(parseSchema(EvaluateRequestSchema, {}).ok, true);
    assert.equal(parseSchema(StripeSessionRequestSchema, { proposalId: 'atlas-freight-rma-copilot' }).ok, true);
    assert.equal(parseSchema(RunCapitalExperimentRequestSchema, { proposalId: 'atlas-freight-rma-copilot', qaAgreement: '85' }).ok, true);
    assert.equal(parseSchema(AuditRequestSchema, { action: 'test', kind: 'test' }).ok, true);
  });

  await t.test('HermesPlaybookSchema accepts generated playbook', async () => {
    const { buildHermesPlaybook } = await import('../lib/proofEngine.js');
    const evaluation = scoreProposal(seededProposals[0]);
    const playbook = buildHermesPlaybook(seededProposals[0], evaluation);
    const result = parseSchema(HermesPlaybookSchema, playbook);
    assert.equal(result.ok, true);
    assert.equal(result.data.id, playbook.id);
  });

  await t.test('ProviderReceiptsSchema accepts built receipts with v10 fields', () => {
    const evaluation = scoreProposal(seededProposals[0]);
    const receipts = buildProviderReceipts(
      evaluation,
      { mode: 'demo', checkout: { id: 'cs_test_1', amount_total: 10000, metadata: { a: 'b' } } },
      [],
      {
        hermesTask: {
          ok: true,
          taskId: 'task-abc',
          skillPlan: ['ingest', 'evaluate'],
          playbook: { id: 'playbook-1' },
        },
        nemotronLatencyMs: 1234,
        nemotronRequestId: 'nim_req_123',
      }
    );

    const result = parseSchema(ProviderReceiptsSchema, receipts);
    assert.equal(result.ok, true, result.error?.message);
    assert.equal(result.data.nemotron.requestId, 'nim_req_123');
    assert.equal(result.data.hermes.taskId, 'task-abc');
    assert.deepEqual(result.data.hermes.skillPlan, ['ingest', 'evaluate']);
    assert.equal(result.data.governance.policyId, result.data.governance.policyHash);
  });
});
