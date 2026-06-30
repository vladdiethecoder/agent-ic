const base = process.env.AGENT_IC_BASE_URL || 'http://localhost:3000';
const caseId = process.env.AGENT_IC_SMOKE_CASE_ID || 'safety-ops-complaint-triage';
const missionStatement = process.env.AGENT_IC_SMOKE_MISSION ||
  'Evaluate RouteGuard AI for complaint triage before signing a $14,400 annual contract';

async function main() {
  const health = await json(`${base}/api/health`);
  assert(health.status === 'ok' || health.ok === true, 'health ok');
  assert(health.services?.nemotron === true, 'Nemotron configured');
  assert(health.services?.stripe === true, 'Stripe configured');

  const ready = await json(`${base}/api/ready`);
  assert(ready.status === 'ready', 'readiness endpoint ready');
  assert(Array.isArray(ready.checks), 'readiness checks array');

  const proof = await json(`${base}/api/proof-report`);
  assert(proof.ok === true, 'proof report ok');
  assert(proof.proofSurfaces?.primaryRoute === '/trial', 'proof report points to primary trial route');
  assert(proof.proofSurfaces?.spend?.includes('Stripe Checkout receipt'), 'proof report uses honest Stripe non-production wording');
  assert(proof.workloadEvidence?.rowCount > 0, 'proof report includes workload row count');
  assert(/^[a-f0-9]{64}$/.test(proof.workloadEvidence?.sha256 || ''), 'proof report includes workload hash');

  const catalogue = await json(`${base}/api/enterprise-trial`);
  assert(Array.isArray(catalogue.cases), 'enterprise cases array');
  assert(catalogue.cases.length >= 4, 'enterprise cases loaded');
  assert(catalogue.cases.some((c) => c.id === caseId), 'smoke case available');

  const trial = await json(`${base}/api/enterprise-trial`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ caseId, missionStatement }),
  });

  const evidence = trial.workerResult?.evidence || trial.evidence || {};
  const classification = evidence.classificationMethod || {};
  const liveClassification = classification.mode === 'nemotron-sample-plus-pattern-extension'
    && Number(classification.nemotronClassified || 0) > 0
    && Number(classification.patternExtended || 0) > 0
    && Boolean(classification.nemotronRequestId || classification.nemotronRequestIdMasked);
  const deterministicFallback = classification.mode === 'deterministic-fallback'
    && Number(classification.deterministicClassified || 0) > 0
    && Boolean(classification.unavailableReason);
  assert(trial.runId, 'trial run id');
  assert(['CONTINUE', 'REVISE', 'KILL'].includes(trial.decision?.verdict), 'procurement verdict');
  assert(evidence.casesProcessed > 0, 'worker processed cases');
  assert(evidence.autoRouted > 0, 'worker routed cases');
  assert(evidence.humanReviewQueue >= 0, 'worker human-review queue');
  assert(liveClassification || deterministicFallback, 'classification proof or explicit fallback recorded');
  assert(trial.policyBlock?.result?.blocked === true, 'policy block enforced');
  assert(trial.policyBlock?.result?.attemptedAmount > trial.spendEnvelope?.cap, 'policy block over-cap amount');
  assert(trial.stripe?.sessionId, 'Stripe session created');
  assert(trial.playbook?.steps?.length > 0, 'playbook generated');

  const storedTrial = await json(`${base}/api/trials?runId=${encodeURIComponent(trial.runId)}`);
  assert(storedTrial.trial?.runId === trial.runId, 'stored trial retrievable');
  assert(storedTrial.trial?.evidence?.dataHash, 'stored trial evidence hash');

  assert(Array.isArray(trial.evidenceArtifacts) && trial.evidenceArtifacts.length >= 2, 'evidence artifacts recorded');
  const evidenceList = await json(`${base}/api/evidence?runId=${encodeURIComponent(trial.runId)}`);
  assert(evidenceList.artifacts?.length >= 2, 'evidence artifacts retrievable');
  const rawArtifact = evidenceList.artifacts.find((artifact) => artifact.kind === 'worker-results');
  assert(rawArtifact?.sha256, 'worker-results artifact hash');

  const renewals = await json(`${base}/api/renewals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'seed' }),
  });
  assert(Array.isArray(renewals.relationships), 'renewal relationships array');
  assert(renewals.relationships.length >= 4, 'renewal relationships seeded');

  console.log(JSON.stringify({
    ok: true,
    services: health.services,
    readiness: ready.status,
    proofReport: {
      primaryRoute: proof.proofSurfaces.primaryRoute,
      workloadRows: proof.workloadEvidence.rowCount,
      workloadHash: proof.workloadEvidence.sha256.slice(0, 12),
    },
    caseCount: catalogue.cases.length,
    runId: trial.runId,
    verdict: trial.decision.verdict,
    casesProcessed: evidence.casesProcessed,
    autoRouted: evidence.autoRouted,
    humanReviewQueue: evidence.humanReviewQueue,
    classificationMode: classification.mode,
    nemotronClassified: classification.nemotronClassified || 0,
    patternExtended: classification.patternExtended || 0,
    deterministicClassified: classification.deterministicClassified || 0,
    classificationUnavailableReason: classification.unavailableReason || null,
    policyBlocked: trial.policyBlock.result.blocked,
    stripeSessionCreated: Boolean(trial.stripe.sessionId),
    storedTrial: storedTrial.trial.runId,
    evidenceArtifacts: evidenceList.artifacts.length,
    renewalRelationships: renewals.relationships.length,
  }, null, 2));
}

async function json(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${url} failed ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Smoke assertion failed: ${message}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
