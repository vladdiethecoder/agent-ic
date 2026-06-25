import test from 'node:test';
import assert from 'node:assert/strict';
import { signTestJwt } from '../lib/authz.js';

const AUTH_SECRET = 'test-auth-secret-1234567890';
function authHeader(claims) {
  return `Bearer ${signTestJwt({ iss: 'https://idp.example.com', aud: 'agent-ic', ...claims }, AUTH_SECRET)}`;
}

test('incident review store creates updates lists and summarizes drills', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-incident-store-${Date.now()}-${Math.random()}`;
  const store = await import(`../lib/incidentReviewStore.js?store=${Date.now()}`);
  const incident = store.createIncidentReview({ tenantId: 'tenant_a', title: 'Provider outage drill', severity: 'critical', sourceAlertId: 'trial-failure-rate', runbook: 'docs/runbooks/provider-outage.md', drill: true, createdBy: 'owner_1' });
  assert.equal(incident.status, 'drill_completed');
  assert.equal(store.incidentSummary({ tenantId: 'tenant_a' }).drills, 1);
  const updated = store.updateIncidentReview({ tenantId: 'tenant_a', incidentId: incident.id, status: 'closed', correctiveAction: 'Reviewed escalation.' });
  assert.equal(updated.ok, true);
  assert.equal(updated.incident.correctiveActions.length, 1);
  assert.equal(store.listIncidentReviews({ tenantId: 'tenant_a' }).length, 1);
});

test('incidents API is guarded tenant-scoped and supports lifecycle', async () => {
  process.env.AGENT_IC_STORE_ROOT = `.agent-ic/test-incident-api-${Date.now()}-${Math.random()}`;
  process.env.AGENT_IC_DEPLOYMENT_MODE = 'production';
  process.env.AGENT_IC_AUTH_HS256_SECRET = AUTH_SECRET;
  process.env.AGENT_IC_AUTH_ISSUER = 'https://idp.example.com';
  process.env.AGENT_IC_AUTH_AUDIENCE = 'agent-ic';
  const { GET, POST } = await import(`../app/api/incidents/route.js?case=${Date.now()}`);
  const owner = authHeader({ sub: 'owner_1', tenantId: 'tenant_a', role: 'owner' });
  const operator = authHeader({ sub: 'operator_1', tenantId: 'tenant_a', role: 'operator' });

  const denied = await POST(new Request('https://agent-ic.example.com/api/incidents', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: operator }, body: JSON.stringify({ action: 'create', tenantId: 'tenant_a', title: 'Denied incident' }),
  }));
  assert.equal(denied.status, 403);

  const created = await POST(new Request('https://agent-ic.example.com/api/incidents', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: owner }, body: JSON.stringify({ action: 'create', tenantId: 'tenant_a', title: 'Payment mismatch incident', severity: 'warning', sourceAlertId: 'stripe-webhook-rejected', runbook: 'docs/runbooks/payment-incident.md' }),
  }));
  assert.equal(created.status, 201);
  const incident = (await created.json()).incident;
  assert.equal(incident.status, 'open');

  const listed = await GET(new Request('https://agent-ic.example.com/api/incidents?tenantId=tenant_a', { headers: { authorization: operator } }));
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).summary.open, 1);

  const cross = await GET(new Request('https://agent-ic.example.com/api/incidents?tenantId=tenant_b', { headers: { authorization: operator } }));
  assert.equal(cross.status, 403);

  const closed = await POST(new Request('https://agent-ic.example.com/api/incidents', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: owner }, body: JSON.stringify({ action: 'update', tenantId: 'tenant_a', incidentId: incident.id, status: 'closed', correctiveAction: 'Added reconciliation monitor.' }),
  }));
  assert.equal(closed.status, 200);
  assert.equal((await closed.json()).incident.status, 'closed');
});
