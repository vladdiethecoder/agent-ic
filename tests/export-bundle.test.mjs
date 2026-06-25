import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('export bundle summarizes tenant-scoped evidence and hashes deterministically', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-export-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-export-audit-${Date.now()}-${Math.random()}.jsonl`;
  const evidence = await import(`../lib/evidenceStore.js?export=${Date.now()}`);
  const trials = await import(`../lib/trialStore.js?export=${Date.now()}`);
  const audit = await import(`../lib/auditStore.js?export=${Date.now()}`);
  const exp = await import(`../lib/exportBundle.js?export=${Date.now()}`);
  audit.resetAudit();
  evidence.recordEvidenceArtifact({ tenantId: 'tenant_a', runId: 'run_1', kind: 'trial-evidence', content: { ok: true } });
  trials.recordTrialRun({ tenantId: 'tenant_a', userId: 'operator_1', result: { runId: 'run_1', caseId: 'case-a', startedAt: '2026', decision: { metrics: {} }, workerResult: { evidence: {} }, spendEnvelope: {}, policyBlock: {} } });
  audit.appendAudit({ tenantId: 'tenant_a', userId: 'operator_1', role: 'operator', action: 'trial_completed', kind: 'trial' });
  process.env.AGENT_IC_EXPORT_SIGNING_KEY = 'export-signing-key-1234567890';
  process.env.AGENT_IC_EXPORT_REQUIRE_SIGNATURES = 'true';
  const bundle = exp.buildExportBundle({ tenantId: 'tenant_a', generatedBy: 'auditor_1' });
  assert.equal(bundle.summary.trialCount, 1);
  assert.equal(bundle.summary.evidenceArtifactCount, 1);
  assert.equal(bundle.summary.auditChainOk, true);
  assert.match(bundle.sha256, /^[a-f0-9]{64}$/);
  assert.equal(exp.hashBundle(bundle), bundle.sha256);
  assert.equal(bundle.signatureAlg, 'HMAC-SHA256');
  assert.match(bundle.signature, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(bundle).includes('export-signing-key'), false);
  assert.equal(exp.verifyExportBundleSignature(bundle).ok, true);
  bundle.summary.trialCount = 999;
  assert.equal(exp.hashBundle(bundle) === bundle.sha256, false);
  assert.equal(exp.verifyExportBundleSignature(bundle).ok, true);
  bundle.sha256 = exp.hashBundle(bundle);
  assert.equal(exp.verifyExportBundleSignature(bundle).code, 'signature_mismatch');
  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  delete process.env.AGENT_IC_EXPORT_REQUIRE_SIGNATURES;
});

test('export API is guarded and tenant-scoped', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-export-api-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { GET } = await import(`../app/api/export/route.js?export=${Date.now()}`);
  const operator = await GET(new Request('https://agent-ic.example.com/api/export', { headers: { authorization: authHeader({ sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' }) } }));
  assert.equal(operator.status, 403);
  const auditor = await GET(new Request('https://agent-ic.example.com/api/export?tenantId=tenant_a', { headers: { authorization: authHeader({ sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }) } }));
  assert.equal(auditor.status, 200);
  const body = await auditor.json();
  assert.equal(body.bundle.tenantId, 'tenant_a');
  assert.match(body.bundle.sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(body.bundle).includes('export-signing-key'), false);
  const cross = await GET(new Request('https://agent-ic.example.com/api/export?tenantId=tenant_b', { headers: { authorization: authHeader({ sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }) } }));
  assert.equal(cross.status, 403);
});
