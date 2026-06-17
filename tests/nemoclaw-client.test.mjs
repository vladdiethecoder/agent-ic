import test from 'node:test';
import assert from 'node:assert/strict';
import { gateToolCall, createOpenShellSandbox } from '../lib/nemoclawClient.js';
import { governancePolicy } from '../lib/demoData.js';

test('NemoClaw client behavior', async (t) => {
  const oldProxyUrl = process.env.NEMOCLAW_PROXY_URL;
  const oldFetch = global.fetch;

  t.after(() => {
    if (oldProxyUrl === undefined) delete process.env.NEMOCLAW_PROXY_URL;
    else process.env.NEMOCLAW_PROXY_URL = oldProxyUrl;
    global.fetch = oldFetch;
  });

  await t.test('returns deterministic fallback when proxy URL is unset', async () => {
    delete process.env.NEMOCLAW_PROXY_URL;
    global.fetch = oldFetch;
    const result = await gateToolCall({
      name: 'Premium market-rate lookup API',
      category: 'Unapproved external data vendor',
      amount: 150,
      proposalId: 'atlas-freight-rma-copilot',
    });
    assert.equal(result.ok, false);
    assert.equal(result.allowed, false);
    assert.match(result.error, /not configured/i);
    assert.ok(result.blockedCall);
    assert.equal(result.blockedCall.status, 403);
    assert.equal(result.blockedCall.policy, 'proxy_unconfigured');
  });

  await t.test('blocks amount above per-call cap', async () => {
    process.env.NEMOCLAW_PROXY_URL = 'http://localhost:9000';
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(url, 'http://localhost:9000/v1/gate');
      assert.equal(body.targetUri, 'https://allowed-tool.example.com/v1/lookup');
      return Response.json(
        {
          error: 'unapproved_external_vendor',
          policy: 'per_authorization_cap_exceeded',
          detail: `Amount ${body.amount} USD exceeds per-call cap`,
        },
        { status: 403 }
      );
    };

    const result = await gateToolCall({
      name: 'Allowed tool',
      targetUri: 'https://allowed-tool.example.com/v1/lookup',
      category: 'logistics',
      amount: 150,
      proposalId: 'atlas-freight-rma-copilot',
    });
    assert.equal(result.ok, false);
    assert.equal(result.allowed, false);
    assert.equal(result.blockedCall.policy, 'per_authorization_cap_exceeded');
  });

  await t.test('blocks host not in allow list', async () => {
    process.env.NEMOCLAW_PROXY_URL = 'http://localhost:9000';
    global.fetch = async () =>
      Response.json(
        {
          error: 'unapproved_external_vendor',
          policy: 'merchant_not_in_allow_list',
          detail: 'Host blocked.example.com is not in the approved merchant list',
        },
        { status: 403 }
      );

    const result = await gateToolCall({
      name: 'Blocked tool',
      targetUri: 'https://blocked.example.com/v1/lookup',
      category: 'unapproved_external_data_vendor',
      amount: 25,
      proposalId: 'atlas-freight-rma-copilot',
    });
    assert.equal(result.ok, false);
    assert.equal(result.blockedCall.policy, 'merchant_not_in_allow_list');
  });

  await t.test('allows approved merchant under cap', async () => {
    process.env.NEMOCLAW_PROXY_URL = 'http://localhost:9000';
    global.fetch = async () =>
      Response.json(
        {
          allowed: true,
          issuedCredential: 'nemoclaw_test_cred',
          expiry: '2026-06-17T03:00:00.000Z',
        },
        { status: 200 }
      );

    const result = await gateToolCall({
      name: 'Allowed tool',
      targetUri: 'https://api.shipwell.com/v1/events',
      category: 'logistics',
      amount: 25,
      proposalId: 'atlas-freight-rma-copilot',
    });
    assert.equal(result.ok, true);
    assert.equal(result.allowed, true);
    assert.equal(result.issuedCredential, 'nemoclaw_test_cred');
    assert.equal(result.blockedCall, null);
  });

  await t.test('sanitizes network errors', async () => {
    process.env.NEMOCLAW_PROXY_URL = 'http://localhost:9000';
    global.fetch = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:9000');
    };

    const result = await gateToolCall({
      name: 'Some tool',
      category: 'data',
      amount: 25,
      proposalId: 'atlas-freight-rma-copilot',
    });
    assert.equal(result.ok, false);
    assert.equal(result.allowed, false);
    assert.equal(result.blockedCall.policy, 'proxy_unreachable');
  });

  await t.test('createOpenShellSandbox returns deterministic fallback when proxy URL is unset', async () => {
    delete process.env.NEMOCLAW_PROXY_URL;
    global.fetch = oldFetch;
    const proposal = { id: 'atlas-freight-rma-copilot' };
    const evaluation = { decision: 'CONTINUE', autonomousSpendCap: 35000 };
    const result = await createOpenShellSandbox(proposal, evaluation);
    assert.equal(result.ok, false);
    assert.match(result.sandboxId, /sandbox-atlas-freight-rma-copilot-fallback/);
    assert.equal(result.networkPolicy, 'deny-all except allow-listed tool endpoints');
    assert.deepEqual(result.invariants, governancePolicy.invariants);
    assert.equal(result.status, 'ready');
    assert.match(result.error, /not configured/i);
  });

  await t.test('createOpenShellSandbox returns sandbox when proxy is live', async () => {
    process.env.NEMOCLAW_PROXY_URL = 'http://localhost:9000';
    global.fetch = async (url, options) => {
      assert.equal(url, 'http://localhost:9000/v1/sandbox');
      const body = JSON.parse(options.body);
      assert.equal(body.proposalId, 'atlas-freight-rma-copilot');
      return Response.json({
        sandboxId: 'nemoclaw-test-sandbox',
        status: 'ready',
        networkPolicy: 'deny-all except allow-listed tool endpoints',
        invariants: governancePolicy.invariants,
        policyTier: 'baseline',
        createdAt: new Date().toISOString(),
      });
    };

    const proposal = { id: 'atlas-freight-rma-copilot' };
    const evaluation = { decision: 'CONTINUE', autonomousSpendCap: 35000 };
    const result = await createOpenShellSandbox(proposal, evaluation);
    assert.equal(result.ok, true);
    assert.equal(result.sandboxId, 'nemoclaw-test-sandbox');
    assert.equal(result.status, 'ready');
    assert.equal(result.error, null);
  });

  await t.test('gateToolCall includes sandboxId when provided', async () => {
    process.env.NEMOCLAW_PROXY_URL = 'http://localhost:9000';
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.sandboxId, 'nemoclaw-test-sandbox');
      assert.equal(url, 'http://localhost:9000/v1/gate');
      return Response.json({ allowed: true, issuedCredential: 'cred-with-sandbox' });
    };

    const result = await gateToolCall({
      targetUri: 'https://api.shipwell.com/v1/events',
      amount: 25,
      proposalId: 'atlas-freight-rma-copilot',
      sandboxId: 'nemoclaw-test-sandbox',
    });
    assert.equal(result.ok, true);
    assert.equal(result.issuedCredential, 'cred-with-sandbox');
  });
});
