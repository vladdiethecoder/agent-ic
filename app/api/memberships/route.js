import { NextResponse } from 'next/server.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromBody, tenantFromUrl } from '../../../lib/authz.js';
import { paginationFromRequest, paginatedField } from '../../../lib/pagination.js';
import { deactivateMembership, listMemberships, upsertMembership } from '../../../lib/membershipStore.js';
import { readJsonBody, jsonError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'manage_users');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;
  const status = new URL(request.url).searchParams.get('status') || '';
  const page = paginatedField('memberships', listMemberships({ tenantId: access.principal.tenantId, status }), paginationFromRequest(request));
  return NextResponse.json({ auth: authContext(access.principal), ...page });
}

export async function POST(request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const action = typeof body.action === 'string' ? body.action : 'upsert';
  const access = await requireApiAccessAsync(request, 'manage_users');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromBody(body));
  if (!tenantScope.ok) return tenantScope.response;

  if (action === 'upsert') {
    try {
      const membership = upsertMembership({ tenantId: access.principal.tenantId, userId: body.userId, role: body.role, status: body.status, displayName: body.displayName, updatedBy: access.principal.userId });
      appendAudit({ ...authContext(access.principal), kind: 'membership', action: 'membership_upserted', detail: `Membership ${membership.userId} -> ${membership.role}`, targetUserId: membership.userId, targetRole: membership.role });
      return NextResponse.json({ auth: authContext(access.principal), membership });
    } catch (error) {
      return jsonError(400, 'invalid_membership', error.message);
    }
  }
  if (action === 'deactivate') {
    const result = deactivateMembership({ tenantId: access.principal.tenantId, userId: body.userId, updatedBy: access.principal.userId });
    if (!result.ok) return jsonError(404, result.code, result.message);
    appendAudit({ ...authContext(access.principal), kind: 'membership', action: 'membership_deactivated', detail: `Membership ${body.userId} deactivated`, targetUserId: body.userId });
    return NextResponse.json({ auth: authContext(access.principal), membership: result.membership });
  }
  return jsonError(400, 'invalid_action', 'Use action: upsert or deactivate');
}
