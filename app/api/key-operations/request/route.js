import { NextResponse } from 'next/server.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromUrl } from '../../../../lib/authz.js';
import { requestKeyOperation } from '../../../../lib/keyApprovalWorkflow.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const access = await requireApiAccessAsync(request, 'create_trial');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;

  const body = await request.json().catch(() => ({}));
  const { operation, keyId, justification } = body;

  if (!operation || !justification) {
    return NextResponse.json({ error: 'operation and justification required' }, { status: 400 });
  }

  const req = requestKeyOperation({
    operation,
    keyId: keyId || 'unknown',
    requester: access.principal.userId,
    justification,
    tenantId: access.principal.tenantId,
  });

  return NextResponse.json({ auth: authContext(access.principal), request: req }, { status: 201 });
}
