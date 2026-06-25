import test from 'node:test';
import assert from 'node:assert/strict';
import { hasKeyAccess, requireKeyAccess, keyAccessPolicy, KEY_PERMISSIONS } from '../lib/keyAccessPolicy.js';
import { resetAudit, readAudit } from '../lib/auditStore.js';

test('hasKeyAccess allows owner for all operations', () => {
  assert.equal(hasKeyAccess('owner', 'key_generate'), true);
  assert.equal(hasKeyAccess('owner', 'key_rotate'), true);
  assert.equal(hasKeyAccess('owner', 'key_sign'), true);
  assert.equal(hasKeyAccess('owner', 'key_verify'), true);
  assert.equal(hasKeyAccess('owner', 'key_read_metadata'), true);
  assert.equal(hasKeyAccess('owner', 'key_audit'), true);
});

test('hasKeyAccess allows auditor for sign, verify, read, audit', () => {
  assert.equal(hasKeyAccess('auditor', 'key_sign'), true);
  assert.equal(hasKeyAccess('auditor', 'key_verify'), true);
  assert.equal(hasKeyAccess('auditor', 'key_read_metadata'), true);
  assert.equal(hasKeyAccess('auditor', 'key_audit'), true);
  assert.equal(hasKeyAccess('auditor', 'key_generate'), false);
  assert.equal(hasKeyAccess('auditor', 'key_rotate'), false);
});

test('hasKeyAccess allows operator for verify and read only', () => {
  assert.equal(hasKeyAccess('operator', 'key_verify'), true);
  assert.equal(hasKeyAccess('operator', 'key_read_metadata'), true);
  assert.equal(hasKeyAccess('operator', 'key_generate'), false);
  assert.equal(hasKeyAccess('operator', 'key_rotate'), false);
  assert.equal(hasKeyAccess('operator', 'key_sign'), false);
  assert.equal(hasKeyAccess('operator', 'key_audit'), false);
});

test('hasKeyAccess denies unknown roles', () => {
  assert.equal(hasKeyAccess('unknown', 'key_generate'), false);
  assert.equal(hasKeyAccess('unknown', 'key_sign'), false);
});

test('requireKeyAccess returns ok for allowed role', () => {
  const result = requireKeyAccess({ role: 'owner', userId: 'user_1', tenantId: 'tenant_a' }, 'key_generate');
  assert.equal(result.ok, true);
});

test('requireKeyAccess returns forbidden for denied role', () => {
  resetAudit();
  process.env.AGENT_IC_AUDIT_SIGNING_KEY = 'audit-signing-key-1234567890';
  process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID = 'test-key';

  const result = requireKeyAccess({ role: 'operator', userId: 'user_1', tenantId: 'tenant_a' }, 'key_generate');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'forbidden');

  const entries = readAudit({});
  const denied = entries.filter((e) => e.action === 'key_access_denied');
  assert.ok(denied.length >= 1);

  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY;
  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID;
});

test('requireKeyAccess returns unauthenticated for missing principal', () => {
  const result = requireKeyAccess(null, 'key_generate');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unauthenticated');
});

test('keyAccessPolicy returns permission map', () => {
  const policy = keyAccessPolicy();
  assert.equal(policy.version, '2026-06-23-v1');
  assert.equal(typeof policy.permissions, 'object');
  assert.ok(policy.permissions.key_generate);
  assert.ok(policy.permissions.key_rotate);
});

test('KMS adapter enforces key access on generate', async () => {
  const { createKmsAdapter } = await import('../lib/kmsAdapter.js');
  const adapter = await createKmsAdapter({ AGENT_IC_KMS_BACKEND: 'local' });

  // Owner should succeed
  const owner = { role: 'owner', userId: 'owner_1', tenantId: 'tenant_a' };
  const key = await adapter.generateKey({ keyId: 'test-key', principal: owner });
  assert.equal(key.keyId, 'test-key');

  // Operator should fail
  const operator = { role: 'operator', userId: 'operator_1', tenantId: 'tenant_a' };
  try {
    await adapter.generateKey({ keyId: 'test-key-2', principal: operator });
    assert.fail('Expected access denied');
  } catch (error) {
    assert.ok(error.message.includes('Access denied'));
  }
});

test('KMS adapter enforces key access on sign', async () => {
  const { createKmsAdapter } = await import('../lib/kmsAdapter.js');
  const adapter = await createKmsAdapter({ AGENT_IC_KMS_BACKEND: 'local' });

  const owner = { role: 'owner', userId: 'owner_1', tenantId: 'tenant_a' };
  await adapter.generateKey({ keyId: 'sign-key', principal: owner });

  // Owner can sign
  const sig = await adapter.sign('data', 'sign-key', { principal: owner });
  assert.equal(typeof sig, 'string');

  // Operator cannot sign
  const operator = { role: 'operator', userId: 'operator_1', tenantId: 'tenant_a' };
  try {
    await adapter.sign('data', 'sign-key', { principal: operator });
    assert.fail('Expected access denied');
  } catch (error) {
    assert.ok(error.message.includes('Access denied'));
  }
});

test('KMS adapter enforces key access on verify', async () => {
  const { createKmsAdapter } = await import('../lib/kmsAdapter.js');
  const adapter = await createKmsAdapter({ AGENT_IC_KMS_BACKEND: 'local' });

  const owner = { role: 'owner', userId: 'owner_1', tenantId: 'tenant_a' };
  await adapter.generateKey({ keyId: 'verify-key', principal: owner });
  const sig = await adapter.sign('data', 'verify-key', { principal: owner });

  // Operator CAN verify
  const operator = { role: 'operator', userId: 'operator_1', tenantId: 'tenant_a' };
  const ok = await adapter.verify(sig, 'data', 'verify-key', { principal: operator });
  assert.equal(ok, true);
});

test('KMS adapter enforces key access on metadata', async () => {
  const { createKmsAdapter } = await import('../lib/kmsAdapter.js');
  const adapter = await createKmsAdapter({ AGENT_IC_KMS_BACKEND: 'local' });

  const owner = { role: 'owner', userId: 'owner_1', tenantId: 'tenant_a' };
  await adapter.generateKey({ keyId: 'meta-key', principal: owner });

  // Operator CAN read metadata
  const operator = { role: 'operator', userId: 'operator_1', tenantId: 'tenant_a' };
  const meta = await adapter.getKeyMetadata('meta-key', { principal: operator });
  assert.equal(meta.keyId, 'meta-key');
});

test('key-access policy API is RBAC-guarded', async () => {
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET='test-secret-1234567890';
  process.env.AGENT_IC_AUTH_ISSUER='https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE='agent-ic';

  const { signTestJwt } = await import('../lib/authz.js');
  const auditorToken = `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }, 'test-secret-1234567890')}`;

  const { GET } = await import(`../app/api/key-access/policy/route.js?kap=${Date.now()}`);
  const res = await GET(new Request('https://agent-ic.example.com/api/key-access/policy?tenantId=tenant_a', {
    headers: { authorization: auditorToken } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.policy.version, '2026-06-23-v1');
  assert.ok(body.policy.permissions.key_generate);

  const operatorToken = `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }, 'test-secret-1234567890')}`;
  const denied = await GET(new Request('https://agent-ic.example.com/api/key-access/policy?tenantId=tenant_a', {
    headers: { authorization: operatorToken } }));
  assert.equal(denied.status, 403);

  delete process.env.AGENT_IC_DEPLOYMENT_MODE;
  delete process.env.AGENT_IC_AUTH_HS256_SECRET;
  delete process.env.AGENT_IC_AUTH_ISSUER;
  delete process.env.AGENT_IC_AUTH_AUDIENCE;
});
