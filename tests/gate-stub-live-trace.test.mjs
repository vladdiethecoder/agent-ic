import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as gateStubPost } from '../app/api/gate-stub/route.js';
import { GET as liveTraceGet } from '../app/api/live-trace/route.js';
import { POST as runV8Post } from '../app/api/run-capital-experiment-v8/route.js';
import { clearLiveTrace, readLiveTrace } from '../lib/liveTrace.js';

const jsonHeaders = { 'content-type': 'application/json' };

function gateRequest(body) {
  return new Request('http://localhost:3000/api/gate-stub', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
}

function runV8Request(body) {
  return new Request('http://localhost:3000/api/run-capital-experiment-v8', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
}

test('gate-stub allows spend within cap', async () => {
  const response = await gateStubPost(gateRequest({ amount: 50, cap: 100, proposalId: 'test' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.envelope_cap, 100);
});

test('gate-stub blocks spend above cap with canonical numbers', async () => {
  const response = await gateStubPost(gateRequest({ amount: 150, cap: 100, proposalId: 'test' }));
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, 'tool_scope_violation');
  assert.equal(body.attempted_amount, 150);
  assert.equal(body.envelope_cap, 100);
});

test('live-trace endpoint streams blocked request/response events', async () => {
  clearLiveTrace();

  const response = await runV8Post(runV8Request({ proposalId: 'atlas-freight-rma-copilot' }));
  assert.equal(response.status, 200);

  const events = readLiveTrace();
  assert.ok(events.length >= 2, 'live trace should contain request and response events');
  assert.ok(events.some((e) => e.type === 'request'));
  assert.ok(events.some((e) => e.type === 'response'));

  const requestEvent = events.find((e) => e.type === 'request');
  assert.equal(requestEvent.body.amount, 150);
  assert.equal(requestEvent.body.cap, 100);
});

test('live-trace SSE endpoint returns text/event-stream headers', async () => {
  const request = new Request('http://localhost:3000/api/live-trace', {
    method: 'GET',
    signal: AbortSignal.timeout(100),
  });

  const response = await liveTraceGet(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
});
