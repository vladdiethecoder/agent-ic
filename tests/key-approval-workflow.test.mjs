import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requestKeyOperation,
  approveKeyOperation,
  rejectKeyOperation,
  getKeyOperationRequest,
  listKeyOperationRequests,
  requireApprovedOperation,
  resetKeyApprovalStore,
} from '../lib/keyApprovalWorkflow.js';
import { resetAudit, readAudit } from '../lib/auditStore.js';

test('requestKeyOperation creates pending approval', () => {
  resetKeyApprovalStore();
  const req = requestKeyOperation({
    operation: 'key_generate',
    keyId: 'test-key-1',
    requester: 'user_1',
    justification: 'Need new signing key for tenant_a',
    tenantId: 'tenant_a',
  });
  assert.equal(req.operation, 'key_generate');
  assert.equal(req.keyId, 'test-key-1');
  assert.equal(req.requester, 'user_1');
  assert.equal(req.status, 'pending');
  assert.equal(req.tenantId, 'tenant_a');
  assert.ok(req.approvalId.startsWith('key-op-'));
});

test('approveKeyOperation approves pending request', () => {
  resetKeyApprovalStore();
  const req = requestKeyOperation({
    operation: 'key_generate',
    keyId: 'test-key-2',
    requester: 'user_1',
    justification: 'Need new key',
    tenantId: 'tenant_a',
  });

  const result = approveKeyOperation({
    approvalId: req.approvalId,
    approver: 'owner_1',
    tenantId: 'tenant_a',
  });

  assert.equal(result.ok, true);
  assert.equal(result.request.status, 'approved');
  assert.equal(result.request.approver, 'owner_1');
});

test('approveKeyOperation rejects wrong tenant', () => {
  resetKeyApprovalStore();
  const req = requestKeyOperation({
    operation: 'key_generate',
    keyId: 'test-key-3',
    requester: 'user_1',
    justification: 'Need new key',
    tenantId: 'tenant_a',
  });

  const result = approveKeyOperation({
    approvalId: req.approvalId,
    approver: 'owner_1',
    tenantId: 'tenant_b',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'tenant_mismatch');
});

test('rejectKeyOperation rejects pending request', () => {
  resetKeyApprovalStore();
  const req = requestKeyOperation({
    operation: 'key_rotate',
    keyId: 'test-key-4',
    requester: 'user_1',
    justification: 'Rotate old key',
    tenantId: 'tenant_a',
  });

  const result = rejectKeyOperation({
    approvalId: req.approvalId,
    approver: 'owner_1',
    tenantId: 'tenant_a',
  });

  assert.equal(result.ok, true);
  assert.equal(result.request.status, 'rejected');
});

test('approveKeyOperation fails on already approved request', () => {
  resetKeyApprovalStore();
  const req = requestKeyOperation({
    operation: 'key_generate',
    keyId: 'test-key-5',
    requester: 'user_1',
    justification: 'Need new key',
    tenantId: 'tenant_a',
  });

  approveKeyOperation({ approvalId: req.approvalId, approver: 'owner_1', tenantId: 'tenant_a' });
  const result = approveKeyOperation({ approvalId: req.approvalId, approver: 'owner_2', tenantId: 'tenant_a' });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'already_processed');
});

test('getKeyOperationRequest retrieves request', () => {
  resetKeyApprovalStore();
  const req = requestKeyOperation({
    operation: 'key_generate',
    keyId: 'test-key-6',
    requester: 'user_1',
    justification: 'Need new key',
    tenantId: 'tenant_a',
  });

  const retrieved = getKeyOperationRequest(req.approvalId);
  assert.equal(retrieved.approvalId, req.approvalId);
});

test('listKeyOperationRequests filters by tenant and status', () => {
  resetKeyApprovalStore();
  requestKeyOperation({ operation: 'key_generate', keyId: 'k1', requester: 'u1', justification: 'j1', tenantId: 'tenant_a' });
  requestKeyOperation({ operation: 'key_rotate', keyId: 'k2', requester: 'u2', justification: 'j2', tenantId: 'tenant_b' });

  const tenantA = listKeyOperationRequests({ tenantId: 'tenant_a', status: 'pending' });
  assert.equal(tenantA.length, 1);
  assert.equal(tenantA[0].tenantId, 'tenant_a');

  const allPending = listKeyOperationRequests({ status: 'pending' });
  assert.equal(allPending.length, 2);
});

test('requireApprovedOperation validates approved request', () => {
  resetKeyApprovalStore();
  const req = requestKeyOperation({
    operation: 'key_generate',
    keyId: 'test-key-7',
    requester: 'user_1',
    justification: 'Need new key',
    tenantId: 'tenant_a',
  });

  // Not approved yet
  const unapproved = requireApprovedOperation({ approvalId: req.approvalId, operation: 'key_generate', tenantId: 'tenant_a' });
  assert.equal(unapproved.ok, false);
  assert.equal(unapproved.code, 'not_approved');

  // Approve
  approveKeyOperation({ approvalId: req.approvalId, approver: 'owner_1', tenantId: 'tenant_a' });

  // Now approved
  const approved = requireApprovedOperation({ approvalId: req.approvalId, operation: 'key_generate', tenantId: 'tenant_a' });
  assert.equal(approved.ok, true);
  assert.equal(approved.request.approvalId, req.approvalId);
});

test('requireApprovedOperation detects operation mismatch', () => {
  resetKeyApprovalStore();
  const req = requestKeyOperation({
    operation: 'key_generate',
    keyId: 'test-key-8',
    requester: 'user_1',
    justification: 'Need new key',
    tenantId: 'tenant_a',
  });
  approveKeyOperation({ approvalId: req.approvalId, approver: 'owner_1', tenantId: 'tenant_a' });

  const mismatch = requireApprovedOperation({ approvalId: req.approvalId, operation: 'key_rotate', tenantId: 'tenant_a' });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'operation_mismatch');
});

test('requireApprovedOperation requires approvalId', () => {
  const result = requireApprovedOperation({ approvalId: null, operation: 'key_generate', tenantId: 'tenant_a' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'approval_required');
});

test('key operation approval logs to audit', () => {
  resetAudit();
  resetKeyApprovalStore();
  process.env.AGENT_IC_AUDIT_SIGNING_KEY = 'audit-signing-key-1234567890';
  process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID = 'test-key';

  const req = requestKeyOperation({
    operation: 'key_generate',
    keyId: 'audit-key',
    requester: 'user_1',
    justification: 'Need new key',
    tenantId: 'tenant_a',
  });
  approveKeyOperation({ approvalId: req.approvalId, approver: 'owner_1', tenantId: 'tenant_a' });

  const entries = readAudit({});
  const requestOps = entries.filter((e) => e.action === 'key_approval_request');
  const approveOps = entries.filter((e) => e.action === 'key_approval_approve');

  assert.ok(requestOps.length >= 1);
  assert.ok(approveOps.length >= 1);

  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY;
  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID;
});

test('key-operations request API is RBAC-guarded', async () => {
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET='test-secret-1234567890';
  process.env.AGENT_IC_AUTH_ISSUER='https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE='agent-ic';

  const { signTestJwt } = await import('../lib/authz.js');
  const operatorToken = `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }, 'test-secret-1234567890')}`;

  const { POST } = await import(`../app/api/key-operations/request/route.js?kor=${Date.now()}`);
  const res = await POST(new Request('https://agent-ic.example.com/api/key-operations/request?tenantId=tenant_a', {
    method: 'POST',
    headers: { authorization: operatorToken, 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'key_generate', keyId: 'api-key', justification: 'Need new key' }),
  }));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.request.operation, 'key_generate');

  // Unauthenticated should fail
  const denied = await POST(new Request('https://agent-ic.example.com/api/key-operations/request?tenantId=tenant_a', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'key_generate', keyId: 'api-key', justification: 'Need new key' }),
  }));
  assert.equal(denied.status, 401);

  delete process.env.AGENT_IC_DEPLOYMENT_MODE;
  delete process.env.AGENT_IC_AUTH_HS256_SECRET;
  delete process.env.AGENT_IC_AUTH_ISSUER;
  delete process.env.AGENT_IC_AUTH_AUDIENCE;
});

test('key-operations approve API is RBAC-guarded', async () => {
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET='test-secret-1234567890';
  process.env.AGENT_IC_AUTH_ISSUER='https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE='agent-ic';

  resetKeyApprovalStore();
  const req = requestKeyOperation({
    operation: 'key_generate',
    keyId: 'approve-key',
    requester: 'operator_1',
    justification: 'Need new key',
    tenantId: 'tenant_a',
  });

  const { signTestJwt } = await import('../lib/authz.js');
  const ownerToken = `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'owner_1', tenantId: 'tenant_a', role: 'owner' }, 'test-secret-1234567890')}`;

  const { POST } = await import(`../app/api/key-operations/approve/route.js?koa=${Date.now()}`);
  const res = await POST(new Request('https://agent-ic.example.com/api/key-operations/approve?tenantId=tenant_a', {
    method: 'POST',
    headers: { authorization: ownerToken, 'content-type': 'application/json' },
    body: JSON.stringify({ approvalId: req.approvalId }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.request.status, 'approved');

  // Operator should not be able to approve
  const operatorToken = `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }, 'test-secret-1234567890')}`;
  const denied = await POST(new Request('https://agent-ic.example.com/api/key-operations/approve?tenantId=tenant_a', {
    method: 'POST',
    headers: { authorization: operatorToken, 'content-type': 'application/json' },
    body: JSON.stringify({ approvalId: req.approvalId }),
  }));
  assert.equal(denied.status, 403);

  delete process.env.AGENT_IC_DEPLOYMENT_MODE;
  delete process.env.AGENT_IC_AUTH_HS256_SECRET;
  delete process.env.AGENT_IC_AUTH_ISSUER;
  delete process.env.AGENT_IC_AUTH_AUDIENCE;
});
