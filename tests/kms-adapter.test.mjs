import test from 'node:test';
import assert from 'node:assert/strict';
import { kmsConfig, createKmsAdapter } from '../lib/kmsAdapter.js';
import { resetAudit, readAudit } from '../lib/auditStore.js';

test('kmsConfig reads defaults', () => {
  const config = kmsConfig({});
  assert.equal(config.backend, 'local');
  assert.equal(config.required, false);
  assert.equal(config.region, 'us-east-1');
  assert.equal(config.keySpec, 'HMAC_256');
});

test('kmsConfig reads env vars', () => {
  const config = kmsConfig({
    AGENT_IC_KMS_BACKEND: 'aws',
    AGENT_IC_KMS_REQUIRED: 'true',
    AGENT_IC_KMS_REGION: 'eu-west-1',
    AGENT_IC_KMS_KEY_SPEC: 'AES_256',
  });
  assert.equal(config.backend, 'aws');
  assert.equal(config.required, true);
  assert.equal(config.region, 'eu-west-1');
  assert.equal(config.keySpec, 'AES_256');
});

test('local KMS adapter generates keys and signs/verifies', async () => {
  const adapter = await createKmsAdapter({ AGENT_IC_KMS_BACKEND: 'local' });
  assert.equal(adapter.backend, 'local');

  const systemPrincipal = { role: 'system', userId: 'system', tenantId: 'system' };
  const key = await adapter.generateKey({ keyId: 'test-key-1', keySpec: 'HMAC_256', principal: systemPrincipal });
  assert.equal(key.keyId, 'test-key-1');
  assert.equal(key.keySpec, 'HMAC_256');

  const data = 'test-data-123';
  const signature = await adapter.sign(data, 'test-key-1', { principal: systemPrincipal });
  assert.equal(typeof signature, 'string');
  assert.equal(signature.length, 64); // hex SHA-256

  const ok = await adapter.verify(signature, data, 'test-key-1', { principal: systemPrincipal });
  assert.equal(ok, true);

  const bad = await adapter.verify('wrong-sig', data, 'test-key-1', { principal: systemPrincipal });
  assert.equal(bad, false);
});

test('local KMS adapter getKeyMetadata and listKeys', async () => {
  const adapter = await createKmsAdapter({ AGENT_IC_KMS_BACKEND: 'local' });
  const systemPrincipal = { role: 'system', userId: 'system', tenantId: 'system' };
  await adapter.generateKey({ keyId: 'meta-key-1', principal: systemPrincipal });

  const meta = await adapter.getKeyMetadata('meta-key-1', { principal: systemPrincipal });
  assert.equal(meta.keyId, 'meta-key-1');
  assert.equal(meta.backend, 'local');

  const keys = await adapter.listKeys({ principal: systemPrincipal });
  assert.ok(keys.some((k) => k.keyId === 'meta-key-1'));
});

test('local KMS adapter rotateKey', async () => {
  resetAudit();
  process.env.AGENT_IC_AUDIT_SIGNING_KEY = 'audit-signing-key-1234567890';
  process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID = 'test-key';

  const adapter = await createKmsAdapter({ AGENT_IC_KMS_BACKEND: 'local' });
  const systemPrincipal = { role: 'system', userId: 'system', tenantId: 'system' };
  const rotated = await adapter.rotateKey({ keyId: 'rotate-key-1', keySpec: 'HMAC_256', principal: systemPrincipal });
  assert.equal(rotated.keyId, 'rotate-key-1');

  const entries = readAudit({});
  const rotateOps = entries.filter((e) => e.action === 'key_rotate');
  assert.ok(rotateOps.length >= 1);

  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY;
  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID;
});

test('AWS KMS adapter falls back to local when SDK unavailable', async () => {
  const adapter = await createKmsAdapter({ AGENT_IC_KMS_BACKEND: 'aws' });
  // Should fall back to local since aws-sdk is not installed
  assert.equal(adapter.backend, 'local');

  const systemPrincipal = { role: 'system', userId: 'system', tenantId: 'system' };
  const key = await adapter.generateKey({ keyId: 'aws-fallback-key', principal: systemPrincipal });
  assert.equal(key.keyId, 'aws-fallback-key');
});

test('GCP KMS adapter falls back to local when SDK unavailable', async () => {
  const adapter = await createKmsAdapter({ AGENT_IC_KMS_BACKEND: 'gcp' });
  assert.equal(adapter.backend, 'local');
});

test('Vault KMS adapter falls back to local when SDK unavailable', async () => {
  const adapter = await createKmsAdapter({ AGENT_IC_KMS_BACKEND: 'vault' });
  assert.equal(adapter.backend, 'local');
});

test('KMS adapter logs operations to audit', async () => {
  resetAudit();
  process.env.AGENT_IC_AUDIT_SIGNING_KEY = 'audit-signing-key-1234567890';
  process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID = 'test-key';

  const adapter = await createKmsAdapter({ AGENT_IC_KMS_BACKEND: 'local' });
  const systemPrincipal = { role: 'system', userId: 'system', tenantId: 'system' };
  await adapter.generateKey({ keyId: 'audit-key-1', principal: systemPrincipal });
  await adapter.sign('data', 'audit-key-1', { principal: systemPrincipal });
  await adapter.verify('sig', 'data', 'audit-key-1', { principal: systemPrincipal });

  const entries = readAudit({});
  const generateOps = entries.filter((e) => e.action === 'key_generate');
  const signOps = entries.filter((e) => e.action === 'key_sign');
  const verifyOps = entries.filter((e) => e.action === 'key_verify');

  assert.ok(generateOps.length >= 1);
  assert.ok(signOps.length >= 1);
  assert.ok(verifyOps.length >= 1);

  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY;
  delete process.env.AGENT_IC_AUDIT_SIGNING_KEY_ID;
});

test('unknown backend falls back to local', async () => {
  const adapter = await createKmsAdapter({ AGENT_IC_KMS_BACKEND: 'unknown' });
  assert.equal(adapter.backend, 'local');
});
