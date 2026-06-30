import { NextResponse } from 'next/server.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromUrl } from '../../../lib/authz.js';
import { paginationFromRequest, paginatedField } from '../../../lib/pagination.js';
import { getEvidenceArtifact, listEvidenceArtifacts } from '../../../lib/evidenceStore.js';
import { jsonError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_evidence');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;
  const url = new URL(request.url);
  const artifactId = url.searchParams.get('artifactId') || '';
  const runId = url.searchParams.get('runId') || '';
  const includeContent = url.searchParams.get('includeContent') === 'true';
  if (artifactId) {
    const artifact = getEvidenceArtifact({ tenantId: access.principal.tenantId, artifactId, includeContent });
    if (!artifact) return jsonError(404, 'evidence_artifact_not_found', `Evidence artifact not found: ${artifactId}`);
    return NextResponse.json({ auth: authContext(access.principal), artifact });
  }
  const page = paginatedField('artifacts', listEvidenceArtifacts({ tenantId: access.principal.tenantId, runId }), paginationFromRequest(request));
  return NextResponse.json({ auth: authContext(access.principal), ...page });
}
