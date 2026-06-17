import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProviderStates,
  getProviderState,
  isHermesLive,
  isNemoclawLive,
  resolveHermesUrl,
  resolveNemoclawProxyUrl,
} from '../lib/providerStatus.js';

test('provider status', { concurrency: false }, async (t) => {
  const oldEnv = { ...process.env };

  t.after(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in oldEnv)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(oldEnv)) {
      process.env[key] = value;
    }
  });

  await t.test('buildProviderStates returns structured state objects', () => {
    delete process.env.NEMOTRON_API_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.HERMES_AGENT_URL;
    delete process.env.HERMES_GATEWAY_URL;
    delete process.env.HERMES_WEBHOOK_URL;
    delete process.env.NEMOCLAW_PROXY_URL;
    delete process.env.OPENSHELL_COMMAND;
    delete process.env.NEMOCLAW_POLICY_MODE;
    process.env.AGENT_IC_DEMO_MODE = 'false';

    const states = buildProviderStates();
    assert.equal(states.demoMode, false);
    for (const key of ['nemotron', 'stripe', 'hermes', 'nemoclaw']) {
      assert.ok(states[key], `${key} state must exist`);
      assert.ok(['live', 'mock', 'error'].includes(states[key].state));
      assert.ok(['live', 'demo'].includes(states[key].mode));
    }
    assert.equal(states.nemotron.state, 'mock');
    assert.equal(states.nemotron.mode, 'demo');
    assert.equal(states.stripe.state, 'mock');
    assert.equal(states.hermes.state, 'mock');
    assert.equal(states.nemoclaw.state, 'mock');
  });

  await t.test('demo mode overrides configured credentials to mock', () => {
    process.env.AGENT_IC_DEMO_MODE = 'true';
    process.env.NEMOTRON_API_KEY = 'nvapi-test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    const states = buildProviderStates();
    assert.equal(states.demoMode, true);
    assert.equal(states.nemotron.state, 'mock');
    assert.equal(states.stripe.state, 'mock');
    assert.equal(states.nemotron.mode, 'demo');
  });

  await t.test('credentials without demo mode report live', () => {
    process.env.AGENT_IC_DEMO_MODE = 'false';
    process.env.NEMOTRON_API_KEY = 'nvapi-test';

    const state = getProviderState('NEMOTRON_API_KEY');
    assert.equal(state.state, 'live');
    assert.equal(state.mode, 'live');
    assert.equal(state.detail, undefined);
  });

  await t.test('HERMES_AGENT_URL aliases work', () => {
    process.env.AGENT_IC_DEMO_MODE = 'false';
    delete process.env.HERMES_AGENT_URL;

    for (const key of ['HERMES_GATEWAY_URL', 'HERMES_WEBHOOK_URL']) {
      delete process.env.HERMES_GATEWAY_URL;
      delete process.env.HERMES_WEBHOOK_URL;
      process.env[key] = 'http://localhost:9999/webhook';

      assert.equal(isHermesLive(), true, `${key} should activate Hermes`);
      assert.equal(resolveHermesUrl(), 'http://localhost:9999/webhook');
      const states = buildProviderStates();
      assert.equal(states.hermes.state, 'live');
    }
  });

  await t.test('NEMOCLAW_PROXY_URL aliases work', () => {
    process.env.AGENT_IC_DEMO_MODE = 'false';
    delete process.env.NEMOCLAW_PROXY_URL;

    for (const key of ['OPENSHELL_COMMAND', 'NEMOCLAW_POLICY_MODE']) {
      delete process.env.OPENSHELL_COMMAND;
      delete process.env.NEMOCLAW_POLICY_MODE;
      process.env[key] = 'http://localhost:7777';

      assert.equal(isNemoclawLive(), true, `${key} should activate NemoClaw`);
      assert.equal(resolveNemoclawProxyUrl(), 'http://localhost:7777');
      const states = buildProviderStates();
      assert.equal(states.nemoclaw.state, 'live');
    }
  });

  await t.test('primary env keys take precedence over aliases', () => {
    process.env.AGENT_IC_DEMO_MODE = 'false';
    process.env.HERMES_AGENT_URL = 'http://primary.example.com';
    process.env.HERMES_GATEWAY_URL = 'http://alias.example.com';

    assert.equal(resolveHermesUrl(), 'http://primary.example.com');
    assert.equal(isHermesLive(), true);
  });

  await t.test('missing credentials include helpful detail', () => {
    process.env.AGENT_IC_DEMO_MODE = 'false';
    delete process.env.NEMOTRON_API_KEY;

    const state = getProviderState('NEMOTRON_API_KEY');
    assert.equal(state.state, 'mock');
    assert.equal(state.mode, 'demo');
    assert.match(state.detail, /NEMOTRON_API_KEY not configured/);
  });
});
