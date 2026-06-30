import { NextResponse } from 'next/server.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromUrl } from '../../../lib/authz.js';
import { paginationFromRequest, paginatedField } from '../../../lib/pagination.js';
import { getTrialRun, listTrialRuns } from '../../../lib/trialStore.js';
import { jsonError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_evidence');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;

  const url = new URL(request.url);
  const runId = url.searchParams.get('runId') || '';
  const caseId = url.searchParams.get('caseId') || '';
  if (runId) {
    const trial = getTrialRun({ tenantId: access.principal.tenantId, runId });
    if (!trial) return jsonError(404, 'trial_not_found', `Trial not found: ${runId}`);
    return NextResponse.json({ auth: authContext(access.principal), trial });
  }

  const page = paginatedField('trials', listTrialRuns({ tenantId: access.principal.tenantId, caseId, limit: 500 }), paginationFromRequest(request));
  return NextResponse.json({ auth: authContext(access.principal), ...page });
}
