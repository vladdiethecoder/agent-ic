import { NextResponse } from 'next/server.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromUrl } from '../../../../lib/authz.js';
import { approveKeyOperation } from '../../../../lib/keyApprovalWorkflow.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const access = await requireApiAccessAsync(request, 'manage_users');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;

  const body = await request.json().catch(() => ({}));
  const { approvalId } = body;

  if (!approvalId) {
    return NextResponse.json({ error: 'approvalId required' }, { status: 400 });
  }

  const result = approveKeyOperation({
    approvalId,
    approver: access.principal.userId,
    tenantId: access.principal.tenantId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ auth: authContext(access.principal), request: result.request });
}
