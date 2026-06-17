import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as runV8Post } from '../app/api/run-capital-experiment-v8/route.js';

const jsonHeaders = { 'content-type': 'application/json' };

function request(body) {
  return new Request('http://localhost:3000/api/run-capital-experiment-v8', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
}

test('run-capital-experiment-v8', async (t) => {
  await t.test('returns CONTINUE and includes NemoClaw blocked call fallback', async () => {
    const response = await runV8Post(request({ proposalId: 'atlas-freight-rma-copilot' }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.decision.verdict, 'CONTINUE');
    assert.equal(body.envelope.cap, 100);
    assert.ok(body.blocked);
    assert.equal(body.blocked.kind, 'blocked');
    assert.ok(body.sandbox);
    assert.ok(body.sandbox.blockedCall);
    assert.equal(body.sandbox.blockedCall.status, 403);
    assert.ok(body.stripe.sessionId);
    assert.equal(body.stripe.mode, 'demo');
    assert.ok(Array.isArray(body.auditRows));
    assert.ok(body.auditRows.some((a) => a.action === 'envelope_created'));
    assert.ok(body.auditRows.some((a) => a.action === 'created Checkout Session'));
    assert.ok(body.auditRows.some((a) => a.action === 'DENIED'));
    assert.ok(body.auditRows.some((a) => a.action === 'evidence_imported'));
    assert.ok(body.auditRows.some((a) => a.action === 'decision_issued'));
  });

  await t.test('captures real blocked call from NemoClaw proxy when live', async () => {
    const oldProxyUrl = process.env.NEMOCLAW_PROXY_URL;
    const oldDemo = process.env.AGENT_IC_DEMO_MODE;
    const oldFetch = global.fetch;

    process.env.NEMOCLAW_PROXY_URL = 'http://localhost:9000';
    process.env.AGENT_IC_DEMO_MODE = 'false';
    global.fetch = async (url, options) => {
      if (url === 'http://localhost:9000/v1/sandbox') {
        return Response.json({
          sandboxId: 'nemoclaw-test-sandbox',
          status: 'ready',
          networkPolicy: 'deny-all except allow-listed tool endpoints',
          invariants: ['test-invariant'],
          policyTier: 'baseline',
          createdAt: new Date().toISOString(),
        });
      }
      if (url === 'http://localhost:9000/v1/gate') {
        const body = JSON.parse(options.body);
        assert.equal(body.proposalId, 'atlas-freight-rma-copilot');
        assert.equal(body.targetUri, 'https://premium-market-api.example.com/v1/lookup');
        assert.equal(body.sandboxId, 'nemoclaw-test-sandbox');
        return Response.json(
          {
            error: 'unapproved_external_vendor',
            policy: 'merchant_not_in_allow_list',
            detail: 'Host premium-market-api.example.com is not in the approved merchant list',
          },
          { status: 403 }
        );
      }
      return oldFetch(url, options);
    };

    t.after(() => {
      if (oldProxyUrl === undefined) delete process.env.NEMOCLAW_PROXY_URL;
      else process.env.NEMOCLAW_PROXY_URL = oldProxyUrl;
      if (oldDemo === undefined) delete process.env.AGENT_IC_DEMO_MODE;
      else process.env.AGENT_IC_DEMO_MODE = oldDemo;
      global.fetch = oldFetch;
    });

    const response = await runV8Post(request({ proposalId: 'atlas-freight-rma-copilot' }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.decision.verdict, 'CONTINUE');
    assert.ok(body.sandbox.blockedCall);
    assert.equal(body.sandbox.blockedCall.policy, 'merchant_not_in_allow_list');
    assert.equal(body.sandbox.blockedCall.host, 'premium-market-api.example.com');
    assert.ok(body.auditRows.some((a) => a.action === 'DENIED' && a.actor === 'NemoClaw live broker'));
  });

  await t.test('flips to KILL when QA agreement drops below threshold', async () => {
    const response = await runV8Post(request({ proposalId: 'atlas-freight-rma-copilot', qaAgreement: 82 }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.decision.verdict, 'KILL');
  });

  await t.test('rejects unknown proposal ids', async () => {
    const response = await runV8Post(request({ proposalId: 'missing-proposal' }));
    assert.equal(response.status, 404);
  });

  await t.test('rejects malformed JSON', async () => {
    const req = new Request('http://localhost:3000/api/run-capital-experiment-v8', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{',
    });
    const response = await runV8Post(req);
    assert.equal(response.status, 400);
  });
});
