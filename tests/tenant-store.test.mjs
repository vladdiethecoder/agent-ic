import test from 'node:test';
import assert from 'node:assert/strict';

test('tenant store writes collections atomically under sanitized tenant path', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-${Date.now()}-${Math.random()}`;
  const store = await import(`../lib/tenantStore.js?case=store${Date.now()}`);
  const manifest = store.ensureStore();
  assert.equal(manifest.schemaVersion, 1);
  assert.ok(manifest.migrations.some((migration) => migration.id === '001_initial_tenant_store'));

  store.writeTenantCollection('tenant/../A', 'approvals', { approvals: [{ id: 'a1' }] });
  const read = store.readTenantCollection('tenant/../A', 'approvals', { approvals: [] });
  assert.equal(read.approvals.length, 1);
  assert.equal(store.listTenantIds().some((id) => id.includes('..') || id.includes('/')), false);

  const health = store.storeHealth();
  assert.equal(health.ok, true);
  assert.equal(health.tenantCount, 1);
});

test('renewal ledger is isolated by tenant in tenant store', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-renewals-${Date.now()}-${Math.random()}`;
  const renewals = await import(`../lib/renewalLedger.js?case=renewals${Date.now()}`);
  const { getCaseById } = await import('../lib/enterpriseCases.js');
  const caseDef = getCaseById('safety-ops-complaint-triage');
  renewals.clearLedger();

  renewals.seedIllustrativeRenewalHistory(caseDef.id, caseDef, { tenantId: 'tenant_a' });
  const tenantA = renewals.getAllVendorRelationships({ tenantId: 'tenant_a' });
  const tenantB = renewals.getAllVendorRelationships({ tenantId: 'tenant_b' });

  assert.equal(tenantA.length, 1);
  assert.equal(tenantB.length, 0);
  assert.equal(renewals.getRenewalHistory(caseDef.id, { tenantId: 'tenant_a' }).cycles.length > 0, true);
  assert.equal(renewals.getRenewalHistory(caseDef.id, { tenantId: 'tenant_b' }).cycles.length, 0);
});

test('trial store persists completed run and isolates tenants', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-trials-${Date.now()}-${Math.random()}`;
  const trials = await import(`../lib/trialStore.js?case=trials${Date.now()}`);
  const result = {
    runId: 'trial_test_1',
    caseId: 'safety-ops-complaint-triage',
    domain: 'Safety Operations',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:10.000Z',
    durationMs: 10000,
    vendor: { name: 'Sentinel Routing Inc.', product: 'RouteGuard AI', productCategory: 'AI complaint-triage' },
    buyer: { organization: 'Northstar Automotive', division: 'Safety Ops' },
    spendEnvelope: { cap: 100, currency: 'USD' },
    stripe: { mode: 'live', testMode: true, sessionId: 'cs_test_1234567890abcdefghijklmnopqrstuvwxyz', amountDollars: 100 },
    policyBlock: { blockedTool: { name: 'CARFAX' }, result: { status: 403, blocked: true, enforcementEngine: 'policy-gate', attemptedAmount: 150, cap: 100, policyRule: 'spend_cap_exceeded' } },
    spendApproval: { required: false, status: 'not_required_for_local_trial' }, productionAccessDecision: { approved: false, status: 'not_approved', scope: 'governed_trial_only', recommendedAction: 'keep governed', blockers: ['production spend/access approval missing'] },
    workerResult: { evidence: { casesProcessed: 330, autoRouted: 301, humanReviewQueue: 29, accuracy: 0.91, falsePositiveRate: 0.01, dataHash: 'abc123', classificationMethod: { nemotronClassified: 3 }, source: 'NHTSA', serviceRuntimeMs: 1200 } },
    decision: { verdict: 'CONTINUE', confidence: 'high', businessCase: 'continue', metrics: { profitability: { netValue: 2504 }, riskAdjustedROI: { multiple: 4 }, wasteRatio: { ratio: 0.05 }, annualizedProjection: { annualValue: 30048 } } },
    playbook: { name: 'playbook', version: 'v1', steps: ['a', 'b'] },
  };

  const record = trials.recordTrialRun({ tenantId: 'tenant_a', userId: 'operator_1', result });
  assert.equal(record.runId, result.runId);
  assert.equal(record.stripe.sessionIdMasked.includes('cs_test_1234567890'), false);
  assert.equal(trials.getTrialRun({ tenantId: 'tenant_a', runId: result.runId }).evidence.dataHash, 'abc123');
  assert.equal(trials.getTrialRun({ tenantId: 'tenant_b', runId: result.runId }), null);
  assert.equal(trials.listTrialRuns({ tenantId: 'tenant_a' }).length, 1);
  assert.equal(trials.listTrialRuns({ tenantId: 'tenant_b' }).length, 0);
});

test('trials API returns tenant-scoped stored runs', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-trials-api-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = 'test-auth-secret-1234567890';
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { signTestJwt } = await import('../lib/authz.js');
  const trials = await import(`../lib/trialStore.js?case=trialsapi${Date.now()}`);
  const { GET } = await import(`../app/api/trials/route.js?case=trialsapi${Date.now()}`);
  trials.recordTrialRun({
    tenantId: 'tenant_a',
    userId: 'operator_1',
    result: { runId: 'trial_api_1', caseId: 'case-a', startedAt: '2026', decision: { metrics: {} }, workerResult: { evidence: {} }, spendEnvelope: {}, policyBlock: {}, spendApproval: { required: false, status: 'not_required_for_local_trial' }, productionAccessDecision: { approved: false, status: 'not_approved', scope: 'governed_trial_only', recommendedAction: 'keep governed', blockers: ['production spend/access approval missing'] } },
  });
  const token = signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }, 'test-auth-secret-1234567890');
  const response = await GET(new Request('https://agent-ic.example.com/api/trials?runId=trial_api_1', { headers: { authorization: `Bearer ${token}` } }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.trial.runId, 'trial_api_1');
});

test('evidence store records and retrieves tenant-scoped raw artifacts', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-evidence-${Date.now()}-${Math.random()}`;
  const evidence = await import(`../lib/evidenceStore.js?case=evidence${Date.now()}`);
  const artifact = evidence.recordEvidenceArtifact({ tenantId: 'tenant_a', runId: 'run_1', kind: 'worker-results', content: [{ id: 'row1', value: 1 }], createdBy: 'operator_1' });
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.listEvidenceArtifacts({ tenantId: 'tenant_a', runId: 'run_1' }).length, 1);
  assert.equal(evidence.listEvidenceArtifacts({ tenantId: 'tenant_b', runId: 'run_1' }).length, 0);
  const loaded = evidence.getEvidenceArtifact({ tenantId: 'tenant_a', artifactId: artifact.artifactId, includeContent: true });
  assert.equal(loaded.verified, true);
  assert.deepEqual(loaded.content, [{ id: 'row1', value: 1 }]);
});

test('evidence API returns tenant-scoped artifact content', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-store-evidence-api-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = 'test-auth-secret-1234567890';
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { signTestJwt } = await import('../lib/authz.js');
  const evidence = await import(`../lib/evidenceStore.js?case=evidenceapi${Date.now()}`);
  const { GET } = await import(`../app/api/evidence/route.js?case=evidenceapi${Date.now()}`);
  const artifact = evidence.recordEvidenceArtifact({ tenantId: 'tenant_a', runId: 'run_1', kind: 'trial-evidence', content: { ok: true }, createdBy: 'operator_1' });
  const token = signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', sub: 'auditor_1', tenantId: 'tenant_a', role: 'auditor' }, 'test-auth-secret-1234567890');
  const res = await GET(new Request(`https://agent-ic.example.com/api/evidence?artifactId=${artifact.artifactId}&includeContent=true`, { headers: { authorization: `Bearer ${token}` } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.artifact.verified, true);
  assert.deepEqual(body.artifact.content, { ok: true });
});
