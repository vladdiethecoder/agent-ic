import { NextResponse } from 'next/server.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { authContext, requireApiAccessAsync } from '../../../lib/authz.js';
import { paginationFromRequest, paginatedField } from '../../../lib/pagination.js';
import { deactivateTenant, ensureDefaultTenant, listTenants, upsertTenant } from '../../../lib/tenantRegistry.js';
import { readJsonBody, jsonError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'manage_users');
  if (!access.ok) return access.response;
  ensureDefaultTenant();
  const status = new URL(request.url).searchParams.get('status') || '';
  const page = paginatedField('tenants', listTenants({ status }), paginationFromRequest(request));
  return NextResponse.json({ auth: authContext(access.principal), ...page });
}

export async function POST(request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const action = typeof body.action === 'string' ? body.action : 'upsert';
  const access = await requireApiAccessAsync(request, 'manage_users');
  if (!access.ok) return access.response;
  if (action === 'upsert') {
    try {
      const tenant = upsertTenant({ tenantId: body.tenantId, name: body.name, status: body.status, updatedBy: access.principal.userId });
      appendAudit({ ...authContext(access.principal), kind: 'tenant', action: 'tenant_upserted', detail: `Tenant ${tenant.tenantId} upserted`, targetTenantId: tenant.tenantId });
      return NextResponse.json({ auth: authContext(access.principal), tenant });
    } catch (error) {
      return jsonError(400, 'invalid_tenant', error.message);
    }
  }
  if (action === 'deactivate') {
    const result = deactivateTenant({ tenantId: body.tenantId, updatedBy: access.principal.userId });
    if (!result.ok) return jsonError(404, result.code, result.message);
    appendAudit({ ...authContext(access.principal), kind: 'tenant', action: 'tenant_deactivated', detail: `Tenant ${body.tenantId} deactivated`, targetTenantId: body.tenantId });
    return NextResponse.json({ auth: authContext(access.principal), tenant: result.tenant });
  }
  return jsonError(400, 'invalid_action', 'Use action: upsert or deactivate');
}
