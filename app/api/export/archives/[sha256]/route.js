import { NextResponse } from 'next/server.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromUrl } from '../../../../../lib/authz.js';
import { getArchivedExport } from '../../../../../lib/exportArchiveStore.js';
import { jsonError } from '../../../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const access = await requireApiAccessAsync(request, 'export_evidence');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;
  const { sha256 } = await params;
  const includeBundle = new URL(request.url).searchParams.get('includeBundle') === 'true';
  const result = getArchivedExport({ tenantId: access.principal.tenantId, sha256: decodeURIComponent(sha256), includeBundle });
  if (!result) return jsonError(404, 'archive_not_found', `Export archive not found: ${sha256}`);
  return NextResponse.json({ auth: authContext(access.principal), ...result });
}
