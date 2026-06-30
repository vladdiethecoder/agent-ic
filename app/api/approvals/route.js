import { NextResponse } from 'next/server.js';
import { requestSpendApproval, decideSpendApproval, listApprovals } from '../../../lib/approvalWorkflow.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromBody, tenantFromUrl } from '../../../lib/authz.js';
import { paginationFromRequest, paginatedField } from '../../../lib/pagination.js';
import { getCaseById } from '../../../lib/enterpriseCases.js';
import { beginIdempotentRequest, completeIdempotentRequest, fingerprintPayload, idempotencyConflictResponse, idempotencyHeaders, idempotencyInProgressResponse, idempotencyKeyFromRequest } from '../../../lib/idempotencyStore.js';
import { readJsonBody, jsonError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'approve_spend');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;

  const status = new URL(request.url).searchParams.get('status') || '';
  const page = paginatedField('approvals', listApprovals({ tenantId: access.principal.tenantId, status }), paginationFromRequest(request));
  return NextResponse.json({ auth: authContext(access.principal), ...page });
}

export async function POST(request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;
  const action = typeof body.action === 'string' ? body.action : 'request';
  const permission = action === 'request' ? 'create_trial' : 'approve_spend';
  const access = await requireApiAccessAsync(request, permission);
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromBody(body));
  if (!tenantScope.ok) return tenantScope.response;

  const idempotencyKey = idempotencyKeyFromRequest(request, body);
  const idempotencyScope = `approvals:${action}`;
  const idempotencyFingerprint = fingerprintPayload({ action, tenantId: access.principal.tenantId, caseId: body.caseId, approvalId: body.approvalId, spendCap: body.spendCap, decision: action });
  const idempotency = beginIdempotentRequest({ tenantId: access.principal.tenantId, key: idempotencyKey, scope: idempotencyScope, fingerprint: idempotencyFingerprint });
  if (idempotency.status === 'conflict') {
    return NextResponse.json(idempotencyConflictResponse(idempotency.record), { status: 409, headers: idempotencyHeaders('conflict') });
  }
  if (idempotency.status === 'in_progress') {
    return NextResponse.json(idempotencyInProgressResponse(idempotency.record), { status: 409, headers: idempotencyHeaders('in_progress') });
  }
  if (idempotency.status === 'replay') {
    return NextResponse.json(idempotency.record.responseBody, { status: idempotency.record.status, headers: idempotencyHeaders('replay') });
  }

  if (action === 'request') {
    const caseId = typeof body.caseId === 'string' ? body.caseId : '';
    const caseDef = getCaseById(caseId);
    if (!caseDef) return jsonError(404, 'case_not_found', `Unknown case: ${caseId}`);
    const spendCap = Number(body.spendCap ?? caseDef.policyEnvelope.spendCap);
    if (!Number.isFinite(spendCap) || spendCap <= 0) return jsonError(400, 'invalid_spend_cap', 'spendCap must be positive');
    const approval = requestSpendApproval({
      principal: access.principal,
      caseId,
      spendCap,
      reason: body.reason,
      policySummary: caseDef.policyEnvelope.networkPolicy,
    });
    appendAudit({ ...authContext(access.principal), kind: 'approval', action: 'spend_approval_requested', approvalId: approval.id, caseId, spendCap, detail: `Spend approval requested for ${caseId}` });
    const responseBody = { auth: authContext(access.principal), approval };
    completeIdempotentRequest({ tenantId: access.principal.tenantId, key: idempotencyKey, scope: idempotencyScope, fingerprint: idempotencyFingerprint, responseBody, status: 201 });
    return NextResponse.json(responseBody, { status: 201, headers: idempotencyHeaders(idempotency.status === 'new' ? 'stored' : '') });
  }

  if (action === 'approve' || action === 'reject') {
    const approvalId = typeof body.approvalId === 'string' ? body.approvalId : '';
    const result = decideSpendApproval({ principal: access.principal, approvalId, decision: action, reason: body.reason });
    if (!result.ok) return jsonError(result.code === 'approval_not_found' ? 404 : 409, result.code, result.message);
    appendAudit({ ...authContext(access.principal), kind: 'approval', action: `spend_approval_${result.approval.status}`, approvalId: result.approval.id, caseId: result.approval.caseId, spendCap: result.approval.spendCap, detail: `Spend approval ${result.approval.status}` });
    const responseBody = { auth: authContext(access.principal), approval: result.approval };
    completeIdempotentRequest({ tenantId: access.principal.tenantId, key: idempotencyKey, scope: idempotencyScope, fingerprint: idempotencyFingerprint, responseBody, status: 200 });
    return NextResponse.json(responseBody, { headers: idempotencyHeaders(idempotency.status === 'new' ? 'stored' : '') });
  }

  return jsonError(400, 'invalid_action', 'Use action: request, approve, or reject');
}
