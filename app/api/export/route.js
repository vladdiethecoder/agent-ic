import { NextResponse } from 'next/server.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromUrl } from '../../../lib/authz.js';
import { archiveExportBundle } from '../../../lib/exportArchiveStore.js';
import { buildExportBundle } from '../../../lib/exportBundle.js';
import { jsonError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'export_evidence');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;
  const url = new URL(request.url);
  const includeAuditRows = url.searchParams.get('includeAuditRows') !== 'false';
  const bundle = buildExportBundle({ tenantId: access.principal.tenantId, generatedBy: access.principal.userId, includeAuditRows });
  appendAudit({ ...authContext(access.principal), kind: 'export', action: 'evidence_export_generated', detail: `Evidence export ${bundle.sha256.slice(0, 12)} generated`, exportHash: bundle.sha256, trialCount: bundle.summary.trialCount });
  return NextResponse.json({ auth: authContext(access.principal), bundle });
}

export async function POST(request) {
  const access = await requireApiAccessAsync(request, 'export_evidence');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;
  const url = new URL(request.url);
  const includeAuditRows = url.searchParams.get('includeAuditRows') !== 'false';
  const bundle = buildExportBundle({ tenantId: access.principal.tenantId, generatedBy: access.principal.userId, includeAuditRows });
  const archived = archiveExportBundle({ tenantId: access.principal.tenantId, bundle, archivedBy: access.principal.userId });
  if (!archived.ok) {
    return jsonError(archived.code === 'immutable_archive_conflict' ? 409 : 400, archived.code, archived.message);
  }
  appendAudit({ ...authContext(access.principal), kind: 'export', action: 'evidence_export_archived', detail: `Evidence export ${bundle.sha256.slice(0, 12)} archived`, exportHash: bundle.sha256, trialCount: bundle.summary.trialCount, replay: archived.replay });
  return NextResponse.json({ auth: authContext(access.principal), bundle, archive: archived.record }, { status: archived.replay ? 200 : 201 });
}
