import { NextResponse } from 'next/server.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromUrl } from '../../../lib/authz.js';
import { readAudit } from '../../../lib/auditStore.js';
import { paginationFromRequest, paginatedField } from '../../../lib/pagination.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_audit_log');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;

  const allEntries = readAudit({ tenantId: access.principal.tenantId, limit: 500 });
  const keyOps = allEntries.filter((entry) => entry.kind === 'key_operation');
  const page = paginatedField('entries', keyOps, paginationFromRequest(request));
  return NextResponse.json({ auth: authContext(access.principal), ...page });
}
