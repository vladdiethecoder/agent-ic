import test from 'node:test';
import assert from 'node:assert/strict';
import { rotationPolicyConfig, evaluateRotationPolicy, checkRotationPolicy } from '../lib/rotationPolicy.js';
import { resetAudit, readAudit } from '../lib/auditStore.js';
import { execFileSync } from 'node:child_process';

test('rotationPolicyConfig reads defaults', () => {
  const config = rotationPolicyConfig({});
  assert.equal(config.maxAgeDays, 90);
  assert.equal(config.expireWarningDays, 7);
  assert.equal(config.minActiveKeys, 1);
  assert.equal(config.requirePolicy, false);
});

test('rotationPolicyConfig reads env vars', () => {
  const config = rotationPolicyConfig({
    AGENT_IC_KEY_MAX_AGE_DAYS: '60',
    AGENT_IC_KEY_EXPIRE_WARNING_DAYS: '14',
    AGENT_IC_KEY_MIN_ACTIVE: '2',
    AGENT_IC_KEY_ROTATION_POLICY_REQUIRED: 'true',
  });
  assert.equal(config.maxAgeDays, 60);
  assert.equal(config.expireWarningDays, 14);
  assert.equal(config.minActiveKeys, 2);
  assert.equal(config.requirePolicy, true);
});

test('evaluateRotationPolicy passes with healthy key ring', () => {
  const ring = [
    { key: 'active', keyId: 'primary', expiresAt: '2099-01-01T00:00:00Z', priority: 1 },
  ];
  const result = evaluateRotationPolicy(ring, { maxAgeDays: 90, expireWarningDays: 7, minActiveKeys: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 0);
  assert.equal(result.health.activeKeys, 1);
});

test('evaluateRotationPolicy detects no active keys', () => {
  const ring = [
    { key: 'expired', keyId: 'old', expiresAt: '2020-01-01T00:00:00Z', priority: 1 },
  ];
  const result = evaluateRotationPolicy(ring, { maxAgeDays: 90, expireWarningDays: 7, minActiveKeys: 1 });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'no_active_keys'));
});

test('evaluateRotationPolicy detects insufficient active keys', () => {
  const ring = [
    { key: 'active', keyId: 'primary', expiresAt: '2099-01-01T00:00:00Z', priority: 1 },
  ];
  const result = evaluateRotationPolicy(ring, { maxAgeDays: 90, expireWarningDays: 7, minActiveKeys: 2 });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'insufficient_active_keys'));
});

test('evaluateRotationPolicy detects expired key', () => {
  const ring = [
    { key: 'expired', keyId: 'old', expiresAt: '2020-01-01T00:00:00Z', priority: 1 },
  ];
  const result = evaluateRotationPolicy(ring, { maxAgeDays: 90, expireWarningDays: 7, minActiveKeys: 1 });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'no_active_keys'));
});

test('evaluateRotationPolicy detects key expired when some active remain', () => {
  const ring = [
    { key: 'active', keyId: 'new', expiresAt: '2099-01-01T00:00:00Z', priority: 2 },
    { key: 'expired', keyId: 'old', expiresAt: '2020-01-01T00:00:00Z', priority: 1 },
  ];
  const result = evaluateRotationPolicy(ring, { maxAgeDays: 90, expireWarningDays: 7, minActiveKeys: 1 });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'key_expired'));
});

test('evaluateRotationPolicy detects expiring soon', () => {
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const ring = [
    { key: 'active', keyId: 'primary', expiresAt: soon, priority: 1 },
  ];
  const result = evaluateRotationPolicy(ring, { maxAgeDays: 90, expireWarningDays: 7, minActiveKeys: 1 });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'key_expiring_soon'));
});

test('checkRotationPolicy logs violations to audit', () => {
  resetAudit();
  process.env.AGENT_IC_AUDIT_SIGNING_KEY = 'audit-signing-key-1234567890';
  process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID = 'test-key';
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID;
  process.env.AGENT_IC_KEY_EXPIRE_WARNING_DAYS = '7';
  process.env.AGENT_IC_SIGNING_KEY_RING = JSON.stringify([
    { key: 'expired-key-1234567890', keyId: 'expired', expiresAt: '2020-01-01T00:00:00Z', priority: 1 },
  ]);

  const result = checkRotationPolicy();
  assert.equal(result.ok, false);

  const entries = readAudit({});
  const violations = entries.filter((e) => e.action === 'key_policy_violation');
  assert.ok(violations.length >= 1);

  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY;
  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID;
  delete process.env.AGENT_IC_KEY_EXPIRE_WARNING_DAYS;
  delete process.env.AGENT_IC_SIGNING_KEY_RING;
});

test('CLI exits 0 when policy passes', () => {
  process.env.AGENT_IC_EXPORT_SIGNING_KEY = 'healthy-key-1234567890';
  process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID = 'healthy';
  process.env.AGENT_IC_KEY_EXPIRE_WARNING_DAYS = '7';
  process.env.AGENT_IC_SIGNING_KEY_RING = '';

  try {
    execFileSync('node', ['scripts/rotation-policy-check.mjs'], {
      env: { ...process.env },
      encoding: 'utf8',
    });
    assert.ok(true);
  } catch (error) {
    assert.fail(`Expected exit 0, got ${error.status}`);
  }

  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID;
  delete process.env.AGENT_IC_KEY_EXPIRE_WARNING_DAYS;
  delete process.env.AGENT_IC_SIGNING_KEY_RING;
});

test('CLI exits 1 when policy fails', () => {
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID;
  process.env.AGENT_IC_KEY_EXPIRE_WARNING_DAYS = '7';
  process.env.AGENT_IC_SIGNING_KEY_RING = JSON.stringify([
    { key: 'expired-key-1234567890', keyId: 'expired', expiresAt: '2020-01-01T00:00:00Z', priority: 1 },
  ]);

  try {
    execFileSync('node', ['scripts/rotation-policy-check.mjs'], {
      env: { ...process.env },
      encoding: 'utf8',
    });
    assert.fail('Expected exit 1');
  } catch (error) {
    assert.equal(error.status, 1);
  }

  delete process.env.AGENT_IC_KEY_EXPIRE_WARNING_DAYS;
  delete process.env.AGENT_IC_SIGNING_KEY_RING;
});

test('rotation-policy API is RBAC-guarded', async () => {
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET='test-secret-1234567890';
  process.env.AGENT_IC_AUTH_ISSUER='https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE='agent-ic';
  process.env.AGENT_IC_EXPORT_SIGNING_KEY = 'healthy-key-1234567890';
  process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID = 'healthy';

  const { signTestJwt } = await import('../lib/authz.js');
  const auditorToken = `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }, 'test-secret-1234567890')}`;

  const { GET } = await import(`../app/api/rotation-policy/route.js?rp=${Date.now()}`);
  const res = await GET(new Request('https://agent-ic.example.com/api/rotation-policy?tenantId=tenant_a', {
    headers: { authorization: auditorToken } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.status.ok, 'boolean');

  const operatorToken = `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }, 'test-secret-1234567890')}`;
  const denied = await GET(new Request('https://agent-ic.example.com/api/rotation-policy?tenantId=tenant_a', {
    headers: { authorization: operatorToken } }));
  assert.equal(denied.status, 403);

  delete process.env.AGENT_IC_DEPLOYMENT_MODE;
  delete process.env.AGENT_IC_AUTH_HS256_SECRET;
  delete process.env.AGENT_IC_AUTH_ISSUER;
  delete process.env.AGENT_IC_AUTH_AUDIENCE;
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY_ID;
});
