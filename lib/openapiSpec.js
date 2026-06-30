const API_VERSION = '2026-06-23.foundation-v1';

const json = { description: 'JSON response' };
const error = { description: 'Structured error response' };

const pathDefs = {
  '/api/health': { get: op('healthCheck', 'Public liveness check', false) },
  '/api/ready': { get: op('readinessCheck', 'Readiness and dependency status', false) },
  '/api/openapi': { get: op('openApiContract', 'OpenAPI contract for Agent IC API foundation', false) },
  '/api/enterprise-trial': { get: op('listEnterpriseCases', 'List enterprise trial cases', false), post: op('runEnterpriseTrial', 'Run governed enterprise trial') },
  '/api/renewals': { get: op('listRenewals', 'List renewal evidence'), post: op('mutateRenewals', 'Mutate renewal evidence') },
  '/api/proof-report': { get: op('getProofReport', 'Get proof and audit report') },
  '/api/live-trace': { get: op('getLiveTrace', 'Get live trace events'), post: op('mutateLiveTrace', 'Reset live trace with confirmation') },
  '/api/events': { get: op('streamEvents', 'Stream server-sent audit events') },
  '/api/approvals': { get: op('listApprovals', 'List spend approvals'), post: op('mutateApprovals', 'Request or decide spend approvals') },
  '/api/policies': { get: op('listPolicies', 'List policy versions'), post: op('mutatePolicies', 'Create activate or evaluate policy versions') },
  '/api/trials': { get: op('listTrials', 'List stored trial runs') },
  '/api/evidence': { get: op('listEvidence', 'List or retrieve evidence artifacts') },
  '/api/payments': { get: op('listPayments', 'List payment events'), post: op('reconcilePayment', 'Reconcile Stripe payment state') },
  '/api/stripe-webhook': { post: op('stripeWebhook', 'Receive verified Stripe webhook', false, ['stripeSignature']) },
  '/api/memberships': { get: op('listMemberships', 'List tenant memberships'), post: op('mutateMemberships', 'Upsert or deactivate tenant memberships') },
  '/api/tenants': { get: op('listTenants', 'List tenant registry'), post: op('mutateTenants', 'Upsert or deactivate tenant records') },
  '/api/session': { get: op('getSession', 'Get current browser session'), post: op('createSession', 'Create browser session from signed identity'), delete: op('deleteSession', 'Revoke current browser session') },
  '/api/retention': { get: op('getRetention', 'Get retention policy and preview'), post: op('mutateRetention', 'Update retention policy or legal holds') },
  '/api/export': { get: op('exportEvidence', 'Build tenant-scoped compliance export bundle') },
  '/api/metrics': { get: op('getMetrics', 'Get metrics JSON or Prometheus text') },
  '/api/alerts': { get: op('getAlerts', 'Evaluate alert thresholds') },
  '/api/slo': { get: op('getSlo', 'Evaluate SLO and error budgets') },
  '/api/telemetry/export': { get: op('dryRunTelemetryExport', 'Dry-run telemetry export'), post: op('exportTelemetry', 'Export telemetry payload') },
  '/api/incidents': { get: op('listIncidents', 'List incident reviews'), post: op('mutateIncidents', 'Create or update incident reviews') },
  '/api/scim/v2/Users': { get: op('scimListUsers', 'SCIM list users', false, ['scimBearer']), post: op('scimCreateUser', 'SCIM provision user', false, ['scimBearer']) },
  '/api/scim/v2/Users/{userId}': { get: op('scimGetUser', 'SCIM get user', false, ['scimBearer']), put: op('scimReplaceUser', 'SCIM replace user', false, ['scimBearer']), patch: op('scimPatchUser', 'SCIM patch user', false, ['scimBearer']), delete: op('scimDeleteUser', 'SCIM deactivate user', false, ['scimBearer']) },
};

export function buildOpenApiSpec({ publicUrl = 'https://agent-ic.example.com' } = {}) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Agent IC API',
      version: API_VERSION,
      summary: 'Enterprise procurement control plane for governed agentic services.',
      description: 'Production-readiness contract foundation. This API contract is versioned but not a claim that all production deployment blockers are closed.',
    },
    servers: [{ url: publicUrl }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'readiness' }, { name: 'trials' }, { name: 'governance' }, { name: 'identity' },
      { name: 'evidence' }, { name: 'payments' }, { name: 'operations' }, { name: 'scim' },
    ],
    paths: pathDefs,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        stripeSignature: { type: 'apiKey', in: 'header', name: 'stripe-signature' },
        scimBearer: { type: 'http', scheme: 'bearer' },
      },
      schemas: {
        Error: objectSchema({ error: { type: 'string' }, code: { type: 'string' } }, ['error', 'code']),
        StrictProviderProofError: objectSchema({
          error: { type: 'string' },
          code: { type: 'string', enum: ['strict_provider_proof_missing'] },
          decision: { type: 'string', enum: ['blocked'] },
          missingProof: { type: 'array', items: { type: 'string' } },
        }, ['error', 'code', 'decision', 'missingProof']),
        AuthContext: objectSchema({ tenantId: { type: 'string' }, userId: { type: 'string' }, role: { type: 'string' }, authSource: { type: 'string' } }),
        SpendApproval: objectSchema({
          required: { type: 'boolean' },
          status: { type: 'string', enum: ['approved', 'pending', 'rejected', 'missing', 'not_required_for_local_trial'] },
          idMasked: { type: ['string', 'null'] },
          spendCap: { type: ['number', 'null'] },
          caseId: { type: ['string', 'null'] },
          decidedAt: { type: ['string', 'null'] },
          decidedByRole: { type: ['string', 'null'] },
          evidence: { type: 'string' },
        }, ['required', 'status']),
        ProductionAccessDecision: objectSchema({
          approved: { type: 'boolean' },
          status: { type: 'string', enum: ['approved', 'not_approved'] },
          scope: { type: 'string', enum: ['scoped_production_access', 'governed_trial_only'] },
          recommendedAction: { type: 'string' },
          blockers: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'object', additionalProperties: true },
        }, ['approved', 'status', 'scope', 'blockers']),
        TrialRun: objectSchema({
          runId: { type: 'string' },
          caseId: { type: 'string' },
          spendApproval: { $ref: '#/components/schemas/SpendApproval' },
          productionAccessDecision: { $ref: '#/components/schemas/ProductionAccessDecision' },
          evidence: { type: 'object', additionalProperties: true },
          decision: { type: 'object', additionalProperties: true },
          policyBlock: { type: 'object', additionalProperties: true },
        }, ['runId', 'caseId', 'spendApproval', 'productionAccessDecision']),
        ProofReport: objectSchema({
          ok: { type: 'boolean' },
          product: { type: 'string' },
          auth: { $ref: '#/components/schemas/AuthContext' },
          proofSurfaces: { type: 'object', additionalProperties: true },
          workloadEvidence: { type: 'object', additionalProperties: true },
          latestTrial: { anyOf: [{ $ref: '#/components/schemas/TrialRun' }, { type: 'null' }] },
        }, ['ok', 'product', 'proofSurfaces', 'workloadEvidence']),
        EnterpriseTrialResult: objectSchema({
          runId: { type: 'string' },
          caseId: { type: 'string' },
          stripe: { type: 'object', additionalProperties: true },
          spendApproval: { $ref: '#/components/schemas/SpendApproval' },
          productionAccessDecision: { $ref: '#/components/schemas/ProductionAccessDecision' },
          workerResult: { type: 'object', additionalProperties: true },
          policyBlock: { type: 'object', additionalProperties: true },
          decision: { type: 'object', additionalProperties: true },
        }, ['runId', 'caseId', 'productionAccessDecision']),
        GenericObject: { type: 'object', additionalProperties: true },
      },
    },
    'x-agent-ic-api-version': API_VERSION,
    'x-agent-ic-production-ready': false,
    'x-agent-ic-deprecation-policy': 'no-removal-without-documented-successor',
  };
}

export function validateOpenApiSpec(spec = buildOpenApiSpec()) {
  const failures = [];
  if (!String(spec.openapi || '').startsWith('3.')) failures.push('openapi_version_missing');
  if (!spec.info?.version) failures.push('info_version_missing');
  if (!spec.paths || Object.keys(spec.paths).length < 10) failures.push('paths_missing');
  const seen = new Set();
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(methods || {})) {
      if (!operation.operationId) failures.push(`operation_id_missing:${method}:${path}`);
      if (seen.has(operation.operationId)) failures.push(`operation_id_duplicate:${operation.operationId}`);
      seen.add(operation.operationId);
      if (!operation.responses?.['200'] && !operation.responses?.['201'] && !operation.responses?.['204']) failures.push(`success_response_missing:${operation.operationId}`);
      if (!operation.responses?.default) failures.push(`default_response_missing:${operation.operationId}`);
    }
  }
  const serialized = JSON.stringify(spec);
  for (const pattern of [/sk_(test|live)_/i, /whsec_/i, /nvapi-/i]) {
    if (pattern.test(serialized)) failures.push(`secret_pattern:${pattern}`);
  }
  return { ok: failures.length === 0, failures, operationCount: seen.size, pathCount: Object.keys(spec.paths || {}).length, version: spec.info?.version };
}


function op(operationId, summary, secured = true, securityNames = null) {
  const operation = {
    operationId,
    summary,
    parameters: [
      { name: 'tenantId', in: 'query', required: false, schema: { type: 'string' }, description: 'Tenant scope; must match authenticated principal when supplied.' },
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200 }, description: 'Maximum list items to return for paginated list endpoints.' },
      { name: 'cursor', in: 'query', required: false, schema: { type: 'string' }, description: 'Zero-based cursor offset returned by prior paginated list response.' },
      { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' }, description: 'Optional idempotency key for mutation routes that support replay protection.' },
      { name: 'x-agent-ic-csrf', in: 'header', required: false, schema: { type: 'string' }, description: 'Required for session-cookie authenticated JSON mutations.' },
      { name: 'x-agent-ic-api-version', in: 'header', required: false, schema: { type: 'string', enum: [API_VERSION] }, description: 'Optional explicit API version. Unsupported explicit versions fail closed.' },
    ],
    responses: {
      '200': json,
      default: { ...error, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
  };
  const responseSchemaRef = responseSchemaRefForOperation(operationId);
  if (responseSchemaRef) {
    operation.responses['200'] = {
      ...operation.responses['200'],
      content: { 'application/json': { schema: { $ref: responseSchemaRef } } },
    };
  }
  if (operationId === 'runEnterpriseTrial') {
    operation.responses['409'] = {
      description: 'Fail-closed governance response, including strict provider proof denial.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/StrictProviderProofError' } } },
    };
  }
  if (operationId.startsWith('scim')) operation.tags = ['scim'];
  if (operationId.toLowerCase().includes('payment') || operationId.toLowerCase().includes('stripe')) operation.tags = ['payments'];
  if (operationId.toLowerCase().includes('alert') || operationId.toLowerCase().includes('metric') || operationId.toLowerCase().includes('slo') || operationId.toLowerCase().includes('incident')) operation.tags = ['operations'];
  if (secured) operation.security = [{ bearerAuth: [] }];
  if (securityNames) operation.security = [Object.fromEntries(securityNames.map((name) => [name, []]))];
  return operation;
}


function responseSchemaRefForOperation(operationId) {
  switch (operationId) {
    case 'getProofReport':
      return '#/components/schemas/ProofReport';
    case 'runEnterpriseTrial':
      return '#/components/schemas/EnterpriseTrialResult';
    case 'listTrials':
      return '#/components/schemas/TrialRun';
    default:
      return null;
  }
}

function objectSchema(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: true };
}
