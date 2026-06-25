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
