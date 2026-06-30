import { NextResponse } from 'next/server.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromBody, tenantFromUrl } from '../../../lib/authz.js';
import { paginationFromRequest, paginatedField } from '../../../lib/pagination.js';
import { createIncidentReview, incidentSummary, listIncidentReviews, updateIncidentReview } from '../../../lib/incidentReviewStore.js';
import { jsonError, readJsonBody } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_metrics');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;
  const status = new URL(request.url).searchParams.get('status') || '';
  const page = paginatedField('incidents', listIncidentReviews({ tenantId: access.principal.tenantId, status }), paginationFromRequest(request));
  return NextResponse.json({ auth: authContext(access.principal), summary: incidentSummary({ tenantId: access.principal.tenantId }), ...page });
}

export async function POST(request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const action = String(body.action || 'create');
  const access = await requireApiAccessAsync(request, 'manage_renewals');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromBody(body));
  if (!tenantScope.ok) return tenantScope.response;
  try {
    if (action === 'create') {
      const incident = createIncidentReview({
        tenantId: access.principal.tenantId,
        title: body.title,
        severity: body.severity,
        sourceAlertId: body.sourceAlertId,
        runbook: body.runbook,
        owner: body.owner || access.principal.userId,
        summary: body.summary,
        evidence: body.evidence,
        drill: body.drill === true,
        createdBy: access.principal.userId,
      });
      appendAudit({ ...authContext(access.principal), kind: 'incident', action: 'incident_review_created', detail: `Incident review ${incident.id} created`, incidentId: incident.id, severity: incident.severity, sourceAlertId: incident.sourceAlertId });
      return NextResponse.json({ auth: authContext(access.principal), incident }, { status: 201 });
    }
    if (action === 'update') {
      const result = updateIncidentReview({ tenantId: access.principal.tenantId, incidentId: body.incidentId, status: body.status, summary: body.summary, correctiveAction: body.correctiveAction, evidence: body.evidence, updatedBy: access.principal.userId });
      if (!result.ok) return jsonError(404, result.code, result.message);
      appendAudit({ ...authContext(access.principal), kind: 'incident', action: 'incident_review_updated', detail: `Incident review ${result.incident.id} updated`, incidentId: result.incident.id, status: result.incident.status });
      return NextResponse.json({ auth: authContext(access.principal), incident: result.incident });
    }
    return jsonError(400, 'invalid_action', 'Use action: create or update');
  } catch (error) {
    return jsonError(400, 'invalid_incident_review', error.message);
  }
}
