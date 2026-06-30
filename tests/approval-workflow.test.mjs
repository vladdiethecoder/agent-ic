import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('approval workflow requests and approves tenant-scoped spend', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-approvals-${Date.now()}-${Math.random()}`;
  const mod = await import(`../lib/approvalWorkflow.js?case=flow${Date.now()}`);
  mod.clearApprovals();
  const principal = { tenantId: 'tenant_a', userId: 'operator_1', role: 'operator' };
  const approval = mod.requestSpendApproval({ principal, caseId: 'safety-ops-complaint-triage', spendCap: 100, reason: 'trial' });
  assert.equal(approval.status, 'pending');
  assert.equal(mod.requireApprovedSpend({ tenantId: 'tenant_a', approvalId: approval.id, caseId: approval.caseId, spendCap: 100 }).ok, false);

  const decision = mod.decideSpendApproval({ principal: { tenantId: 'tenant_a', userId: 'finance_1', role: 'finance_approver' }, approvalId: approval.id, decision: 'approve', reason: 'approved' });
  assert.equal(decision.ok, true);
  const allowed = mod.requireApprovedSpend({ tenantId: 'tenant_a', approvalId: approval.id, caseId: approval.caseId, spendCap: 100 });
  assert.equal(allowed.ok, true);
  assert.equal(mod.requireApprovedSpend({ tenantId: 'tenant_b', approvalId: approval.id, caseId: approval.caseId, spendCap: 100 }).ok, false);
  assert.equal(mod.requireApprovedSpend({ tenantId: 'tenant_a', approvalId: approval.id, caseId: approval.caseId, spendCap: 250 }).ok, false);
});

test('approvals API enforces request and approval roles', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-approvals-api-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-approvals-audit-${Date.now()}-${Math.random()}.jsonl`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const approvals = await import(`../lib/approvalWorkflow.js?api=${Date.now()}`);
  approvals.clearApprovals();
  const { POST } = await import(`../app/api/approvals/route.js?api=${Date.now()}`);

  const requestResponse = await POST(new Request('https://agent-ic.example.com/api/approvals', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader({ sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }),
    },
    body: JSON.stringify({ action: 'request', tenantId: 'tenant_a', caseId: 'safety-ops-complaint-triage', spendCap: 100 }),
  }));
  assert.equal(requestResponse.status, 201);
  const requested = await requestResponse.json();
  assert.equal(requested.approval.status, 'pending');

  const wrongRole = await POST(new Request('https://agent-ic.example.com/api/approvals', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader({ sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }),
    },
    body: JSON.stringify({ action: 'approve', tenantId: 'tenant_a', approvalId: requested.approval.id }),
  }));
  assert.equal(wrongRole.status, 403);

  const approveResponse = await POST(new Request('https://agent-ic.example.com/api/approvals', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader({ sub: 'finance_1', tenantId: 'tenant_a', role: 'finance_approver' }),
    },
    body: JSON.stringify({ action: 'approve', tenantId: 'tenant_a', approvalId: requested.approval.id }),
  }));
  assert.equal(approveResponse.status, 200);
  const approved = await approveResponse.json();
  assert.equal(approved.approval.status, 'approved');
});

test('production enterprise trial requires approval id', async () => {
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-trial-approvals-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-trial-approval-audit-${Date.now()}-${Math.random()}.jsonl`;
  const { POST } = await import(`../app/api/enterprise-trial/route.js?approval=missing${Date.now()}`);
  const response = await POST(new Request('https://agent-ic.example.com/api/enterprise-trial', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader({ sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }),
    },
    body: JSON.stringify({ tenantId: 'tenant_a', caseId: 'safety-ops-complaint-triage' }),
  }));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.code, 'approval_required');
});


test('production enterprise trial forces strict provider proof even when request omits flag', async () => {
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  delete process.env.AGENT_IC_REQUIRE_LIVE_PROOF;
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-trial-strict-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-trial-strict-audit-${Date.now()}-${Math.random()}.jsonl`;

  const approvals = await import(`../lib/approvalWorkflow.js?strict=${Date.now()}`);
  approvals.clearApprovals({ tenantId: 'tenant_a' });
  const requested = approvals.requestSpendApproval({
    principal: { tenantId: 'tenant_a', userId: 'operator_1', role: 'operator' },
    caseId: 'safety-ops-complaint-triage',
    spendCap: 100,
    reason: 'strict proof route test',
  });
  const approved = approvals.decideSpendApproval({
    principal: { tenantId: 'tenant_a', userId: 'finance_1', role: 'finance_approver' },
    approvalId: requested.id,
    decision: 'approve',
    reason: 'approved for strict proof test',
  });
  assert.equal(approved.ok, true);

  const audit = await import('../lib/auditStore.js');
  const { POST } = await import(`../app/api/enterprise-trial/route.js?approval=strict${Date.now()}`);
  const requestBody = {
    tenantId: 'tenant_a',
    caseId: 'safety-ops-complaint-triage',
    approvalId: requested.id,
    missionStatement: 'Evaluate RouteGuard AI before production access.',
  };
  const makeRequest = () => new Request('https://agent-ic.example.com/api/enterprise-trial', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': 'strict-proof-missing-key',
      authorization: authHeader({ sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }),
    },
    body: JSON.stringify(requestBody),
  });
  const response = await POST(makeRequest());
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(response.headers.get('x-agent-ic-idempotency'), 'stored');
  assert.equal(body.code, 'strict_provider_proof_missing');
  assert.equal(body.decision, 'blocked');
  assert.match(body.error, /Strict provider proof required/);
  assert.ok(body.missingProof.includes('Stripe Checkout receipt'));
  assert.ok(body.missingProof.includes('Hermes dispatch receipt'));

  const replay = await POST(makeRequest());
  assert.equal(replay.status, 409);
  assert.equal(replay.headers.get('x-agent-ic-idempotency'), 'replay');
  const replayBody = await replay.json();
  assert.equal(replayBody.code, 'strict_provider_proof_missing');
  assert.deepEqual(replayBody.missingProof, body.missingProof);
  const auditRows = audit.readAudit({ tenantId: 'tenant_a' })
    .filter((row) => row.action === 'enterprise_trial_blocked_strict_proof_missing');
  assert.equal(auditRows.length, 1, 'idempotent replay does not duplicate strict-proof audit row');
  assert.deepEqual(auditRows[0].strictProofMissing, body.missingProof);
});
