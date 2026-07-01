import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}
function minimalRoiMethodology() {
  return {
    baseline: { inputs: { cases: { value: 10 } }, result: { totalCost: 1200 } },
    agent: { inputs: { humanReviewCases: { value: 2 } }, result: { totalCost: 200 } },
    computed: { netValue: { formula: 'baseline.totalCost - agent.totalCost', value: 1000, unit: 'USD' } },
  };
}

test('archive export bundle is content-addressed and write-once', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-archive-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-archive-audit-${Date.now()}-${Math.random()}.jsonl`;
  process.env.AGENT_IC_EXPORT_SIGNING_KEY = 'export-signing-key-1234567890';
  process.env.AGENT_IC_EXPORT_REQUIRE_SIGNATURES = 'true';

  const evidence = await import(`../lib/evidenceStore.js?archive=${Date.now()}`);
  const trials = await import(`../lib/trialStore.js?archive=${Date.now()}`);
  const audit = await import(`../lib/auditStore.js?archive=${Date.now()}`);
  const archive = await import(`../lib/exportArchiveStore.js?archive=${Date.now()}`);
  const bundleMod = await import(`../lib/exportBundle.js?archive=${Date.now()}`);

  audit.resetAudit();
  evidence.recordEvidenceArtifact({ tenantId: 'tenant_a', runId: 'run_1', kind: 'trial-evidence', content: { ok: true } });
  trials.recordTrialRun({ tenantId: 'tenant_a', userId: 'operator_1', result: { runId: 'run_1', caseId: 'case-a', startedAt: '2026', decision: { metrics: {} }, workerResult: { evidence: {} }, spendEnvelope: {}, policyBlock: {}, spendApproval: { required: false, status: 'not_required_for_local_trial' }, productionAccessDecision: { approved: false, status: 'not_approved', scope: 'governed_trial_only', recommendedAction: 'keep governed', blockers: ['production spend/access approval missing'] }, roiMethodology: minimalRoiMethodology() } });
  audit.appendAudit({ tenantId: 'tenant_a', userId: 'operator_1', role: 'operator', action: 'trial_completed', kind: 'trial' });

  const bundle = bundleMod.buildExportBundle({ tenantId: 'tenant_a', generatedBy: 'auditor_1' });
  const first = archive.archiveExportBundle({ tenantId: 'tenant_a', bundle, archivedBy: 'auditor_1' });
  assert.equal(first.ok, true);
  assert.equal(first.replay, false);
  assert.equal(first.record.sha256, bundle.sha256);
  assert.equal(first.record.signature, bundle.signature);

  const second = archive.archiveExportBundle({ tenantId: 'tenant_a', bundle, archivedBy: 'auditor_1' });
  assert.equal(second.ok, true);
  assert.equal(second.replay, true);
  assert.equal(second.record.sha256, bundle.sha256);

  const list = archive.listExportArchives({ tenantId: 'tenant_a' });
  assert.equal(list.length, 1);
  assert.equal(list[0].sha256, bundle.sha256);

  const retrieved = archive.getArchivedExport({ tenantId: 'tenant_a', sha256: bundle.sha256, includeBundle: true });
  assert.equal(retrieved.record.sha256, bundle.sha256);
  assert.equal(retrieved.verification.ok, true);
  assert.equal(retrieved.verification.hashOk, true);
  assert.equal(retrieved.verification.signature.ok, true);
  assert.equal(retrieved.bundle.sha256, bundle.sha256);

  const tampered = JSON.parse(JSON.stringify(bundle));
  tampered.summary.trialCount = 999;
  tampered.sha256 = bundleMod.hashBundle(tampered);
  const tamperArchive = archive.archiveExportBundle({ tenantId: 'tenant_a', bundle: tampered, archivedBy: 'auditor_1' });
  assert.equal(tamperArchive.ok, false);
  assert.equal(tamperArchive.code, 'signature_mismatch');

  const missing = archive.getArchivedExport({ tenantId: 'tenant_a', sha256: 'a'.repeat(64) });
  assert.equal(missing, null);

  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  delete process.env.AGENT_IC_EXPORT_REQUIRE_SIGNATURES;
});

test('archive API routes are guarded and tenant-scoped', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-archive-api-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_AUDIT_FILE = `.agent-ic/test-archive-api-audit-${Date.now()}-${Math.random()}.jsonl`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  process.env.AGENT_IC_EXPORT_SIGNING_KEY = 'export-signing-key-1234567890';
  process.env.AGENT_IC_EXPORT_REQUIRE_SIGNATURES = 'true';

  const evidence = await import(`../lib/evidenceStore.js?archiveapi=${Date.now()}`);
  const trials = await import(`../lib/trialStore.js?archiveapi=${Date.now()}`);
  const audit = await import(`../lib/auditStore.js?archiveapi=${Date.now()}`);

  audit.resetAudit();
  evidence.recordEvidenceArtifact({ tenantId: 'tenant_a', runId: 'run_1', kind: 'trial-evidence', content: { ok: true } });
  trials.recordTrialRun({ tenantId: 'tenant_a', userId: 'operator_1', result: { runId: 'run_1', caseId: 'case-a', startedAt: '2026', decision: { metrics: {} }, workerResult: { evidence: {} }, spendEnvelope: {}, policyBlock: {}, spendApproval: { required: false, status: 'not_required_for_local_trial' }, productionAccessDecision: { approved: false, status: 'not_approved', scope: 'governed_trial_only', recommendedAction: 'keep governed', blockers: ['production spend/access approval missing'] }, roiMethodology: minimalRoiMethodology() } });

  const { POST: exportPost } = await import(`../app/api/export/route.js?archiveapi=${Date.now()}`);
  const auditorToken = authHeader({ sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' });
  const postRes = await exportPost(new Request('https://agent-ic.example.com/api/export?tenantId=tenant_a', {
    method: 'POST',
    headers: { authorization: auditorToken },
  }));
  assert.equal(postRes.status, 201);
  const postBody = await postRes.json();
  const sha256 = postBody.bundle.sha256;
  assert.equal(postBody.archive.sha256, sha256);
  assert.equal(postBody.archive.signature, postBody.bundle.signature);

  const { GET: listGet } = await import(`../app/api/export/archives/route.js?archiveapi=${Date.now()}`);
  const listRes = await listGet(new Request('https://agent-ic.example.com/api/export/archives?tenantId=tenant_a', {
    headers: { authorization: auditorToken },
  }));
  assert.equal(listRes.status, 200);
  const listBody = await listRes.json();
  assert.equal(listBody.archives.length, 1);
  assert.equal(listBody.archives[0].sha256, sha256);

  const { GET: archiveGet } = await import(`../app/api/export/archives/[sha256]/route.js?archiveapi=${Date.now()}`);
  const archiveRes = await archiveGet(new Request(`https://agent-ic.example.com/api/export/archives/${sha256}?tenantId=tenant_a&includeBundle=true`, {
    headers: { authorization: auditorToken },
  }), { params: Promise.resolve({ sha256 }) });
  assert.equal(archiveRes.status, 200);
  const archiveBody = await archiveRes.json();
  assert.equal(archiveBody.record.sha256, sha256);
  assert.equal(archiveBody.verification.ok, true);
  assert.equal(archiveBody.bundle.sha256, sha256);

  const operatorToken = authHeader({ sub: 'procurement_1', tenantId: 'tenant_a', role: 'procurement_admin' });
  const operatorPost = await exportPost(new Request('https://agent-ic.example.com/api/export?tenantId=tenant_a', {
    method: 'POST',
    headers: { authorization: operatorToken },
  }));
  assert.equal(operatorPost.status, 201);

  const crossTenant = authHeader({ sub: 'auditor_1', tenantId: 'tenant_b', role: 'auditor' });
  const crossList = await listGet(new Request('https://agent-ic.example.com/api/export/archives?tenantId=tenant_a', {
    headers: { authorization: crossTenant },
  }));
  assert.equal(crossList.status, 403);

  const notFound = await archiveGet(new Request('https://agent-ic.example.com/api/export/archives/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?tenantId=tenant_a', {
    headers: { authorization: auditorToken },
  }), { params: Promise.resolve({ sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }) });
  assert.equal(notFound.status, 404);

  delete process.env.AGENT_IC_EXPORT_SIGNING_KEY;
  delete process.env.AGENT_IC_EXPORT_REQUIRE_SIGNATURES;
});
