import { NextResponse } from 'next/server.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromUrl } from '../../../lib/authz.js';
import { listKeyOperationRequests } from '../../../lib/keyApprovalWorkflow.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_audit_log');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';

  const requests = listKeyOperationRequests({
    tenantId: access.principal.tenantId,
    status,
  });

  return NextResponse.json({ auth: authContext(access.principal), requests });
}
