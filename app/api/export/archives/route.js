import { NextResponse } from 'next/server.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromUrl } from '../../../../lib/authz.js';
import { listExportArchives } from '../../../../lib/exportArchiveStore.js';
import { paginationFromRequest, paginatedField } from '../../../../lib/pagination.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'export_evidence');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;
  const page = paginatedField('archives', listExportArchives({ tenantId: access.principal.tenantId }), paginationFromRequest(request));
  return NextResponse.json({ auth: authContext(access.principal), ...page });
}
