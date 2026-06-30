import { NextResponse } from 'next/server.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromBody, tenantFromUrl } from '../../../lib/authz.js';
import { paginationFromRequest, paginatedField } from '../../../lib/pagination.js';
import { getCaseById } from '../../../lib/enterpriseCases.js';
import { activatePolicyVersion, createPolicyVersion, diffPolicyVersions, getActivePolicyVersion, getPolicyVersion, listPolicyVersions, simulatePolicy } from '../../../lib/policyStore.js';
import { readJsonBody, jsonError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'manage_policy');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;
  const url = new URL(request.url);
  const caseId = url.searchParams.get('caseId') || '';
  const policyId = url.searchParams.get('policyId') || '';
  if (policyId) {
    const policy = getPolicyVersion({ tenantId: access.principal.tenantId, policyId });
    if (!policy) return jsonError(404, 'policy_not_found', `Policy not found: ${policyId}`);
    return NextResponse.json({ auth: authContext(access.principal), policy });
  }
  const page = paginatedField('policies', listPolicyVersions({ tenantId: access.principal.tenantId, caseId }), paginationFromRequest(request));
  return NextResponse.json({ auth: authContext(access.principal), activePolicy: caseId ? getActivePolicyVersion({ tenantId: access.principal.tenantId, caseId }) : null, ...page });
}

export async function POST(request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;
  const action = typeof body.action === 'string' ? body.action : 'create';
  const permission = action === 'simulate' ? 'view_evidence' : 'manage_policy';
  const access = await requireApiAccessAsync(request, permission);
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromBody(body));
  if (!tenantScope.ok) return tenantScope.response;

  if (action === 'create') {
    const caseId = typeof body.caseId === 'string' ? body.caseId : '';
    const caseDef = getCaseById(caseId);
    if (!caseDef) return jsonError(404, 'case_not_found', `Unknown case: ${caseId}`);
    const envelope = body.envelope && typeof body.envelope === 'object' ? body.envelope : caseDef.policyEnvelope;
    const previous = getActivePolicyVersion({ tenantId: access.principal.tenantId, caseId });
    const policy = createPolicyVersion({ tenantId: access.principal.tenantId, caseId, envelope, createdBy: access.principal.userId, notes: body.notes });
    appendAudit({ ...authContext(access.principal), kind: 'policy', action: 'policy_version_created', policyId: policy.id, caseId, detail: `Policy version ${policy.version} created` });
    return NextResponse.json({ auth: authContext(access.principal), policy, diffFromActive: previous ? diffPolicyVersions({ fromPolicy: previous.policy, toPolicy: policy.policy }) : null }, { status: 201 });
  }

  if (action === 'activate') {
    const policyId = typeof body.policyId === 'string' ? body.policyId : '';
    const result = activatePolicyVersion({ tenantId: access.principal.tenantId, policyId, activatedBy: access.principal.userId });
    if (!result.ok) return jsonError(result.code === 'policy_not_found' ? 404 : 409, result.code, result.message);
    appendAudit({ ...authContext(access.principal), kind: 'policy', action: 'policy_version_activated', policyId: result.policy.id, caseId: result.policy.caseId, detail: `Policy version ${result.policy.version} activated` });
    return NextResponse.json({ auth: authContext(access.principal), policy: result.policy });
  }

  if (action === 'simulate') {
    const policyId = typeof body.policyId === 'string' ? body.policyId : '';
    const policy = policyId ? getPolicyVersion({ tenantId: access.principal.tenantId, policyId }) : null;
    const envelope = policy?.policy || body.envelope;
    if (!envelope) return jsonError(400, 'policy_required', 'policyId or envelope is required');
    return NextResponse.json({ auth: authContext(access.principal), simulation: simulatePolicy({ policy: envelope, attemptedAction: body.attemptedAction || {} }) });
  }

  return jsonError(400, 'invalid_action', 'Use action: create, activate, or simulate');
}
