import test from 'node:test';
import assert from 'node:assert/strict';

test('OpenAPI spec validates current API contract foundation', async () => {
  const { buildOpenApiSpec, validateOpenApiSpec } = await import('../lib/openapiSpec.js');
  const spec = buildOpenApiSpec({ publicUrl: 'https://agent-ic.example.com' });
  const validation = validateOpenApiSpec(spec);
  assert.equal(validation.ok, true);
  for (const path of ['/api/enterprise-trial', '/api/approvals', '/api/policies', '/api/payments', '/api/alerts', '/api/slo', '/api/incidents', '/api/scim/v2/Users']) {
    assert.ok(spec.paths[path], `${path} is documented`);
  }
  assert.equal(spec['x-agent-ic-production-ready'], false);
  assert.ok(spec.components.schemas.SpendApproval, 'spend approval schema is documented');
  assert.ok(spec.components.schemas.ProductionAccessDecision, 'production access decision schema is documented');
  assert.ok(spec.components.schemas.StrictProviderProofError, 'strict provider proof error schema is documented');
  assert.equal(spec.paths['/api/enterprise-trial'].post.responses['409'].content['application/json'].schema.$ref, '#/components/schemas/StrictProviderProofError');
  assert.equal(spec.paths['/api/proof-report'].get.responses['200'].content['application/json'].schema.$ref, '#/components/schemas/ProofReport');
  assert.equal(spec.paths['/api/enterprise-trial'].post.responses['200'].content['application/json'].schema.$ref, '#/components/schemas/EnterpriseTrialResult');
  assert.equal(JSON.stringify(spec).includes('sk_test_'), false);
  assert.equal(JSON.stringify(spec).includes('nvapi-'), false);
});

test('OpenAPI route returns public non-secret contract', async () => {
  const { GET } = await import(`../app/api/openapi/route.js?case=${Date.now()}`);
  const response = await GET();
  assert.equal(response.status, 200);
  const spec = await response.json();
  assert.equal(spec.openapi, '3.1.0');
  assert.ok(spec.paths['/api/openapi']);
  assert.equal(JSON.stringify(spec).includes('whsec_'), false);
});
