import { NextResponse } from 'next/server.js';
import { getRenewalHistory, getAllVendorRelationships, seedDemoRenewalHistory, clearLedger } from '../../../lib/renewalLedger.js';
import { getCaseById, enterpriseCases } from '../../../lib/enterpriseCases.js';
import { readJsonBody, jsonError } from '../../../lib/validation.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromBody, tenantFromUrl } from '../../../lib/authz.js';
import { appendAudit } from '../../../lib/auditStore.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/renewals
 * Query params:
 *   ?caseId=<id> — get renewal history for a specific case
 *   ?all=true — get all vendor relationships
 *
 * Returns accumulated evidence across monthly renewal cycles.
 */
export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_renewals');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;

  const url = new URL(request.url);
  const caseId = url.searchParams.get('caseId');
  const all = url.searchParams.get('all') === 'true';
  const seed = url.searchParams.get('seed') === 'true';

  // Seed demo history if requested
  if (seed) {
    for (const c of enterpriseCases) {
      seedDemoRenewalHistory(c.id, c, { tenantId: access.principal.tenantId });
    }
  }

  if (all) {
    const relationships = getAllVendorRelationships({ tenantId: access.principal.tenantId });
    return NextResponse.json({ auth: authContext(access.principal), relationships });
  }

  if (caseId) {
    const caseDef = getCaseById(caseId);
    if (!caseDef) {
      return jsonError(404, 'case_not_found', `Unknown case: ${caseId}`);
    }
    const history = getRenewalHistory(caseId, { tenantId: access.principal.tenantId });
    return NextResponse.json({ auth: authContext(access.principal), ...history });
  }

  // Default: return all relationships
  const relationships = getAllVendorRelationships({ tenantId: access.principal.tenantId });
  return NextResponse.json({ auth: authContext(access.principal), relationships });
}

/**
 * POST /api/renewals
 * Actions: seed (create demo history), clear (reset ledger)
 */
export async function POST(request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;
  const permission = body.action === 'clear' ? 'clear_renewals' : 'manage_renewals';
  const access = await requireApiAccessAsync(request, permission);
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromBody(body));
  if (!tenantScope.ok) return tenantScope.response;

  if (body.action === 'seed') {
    for (const c of enterpriseCases) {
      seedDemoRenewalHistory(c.id, c, { tenantId: access.principal.tenantId });
    }
    const relationships = getAllVendorRelationships({ tenantId: access.principal.tenantId });
    appendAudit({ ...authContext(access.principal), kind: 'renewal', action: 'renewals_seeded', detail: 'Demo renewal relationships seeded', relationshipCount: relationships.length });
    return NextResponse.json({ auth: authContext(access.principal), status: 'seeded', relationships });
  }

  if (body.action === 'clear') {
    clearLedger({ tenantId: access.principal.tenantId });
    appendAudit({ ...authContext(access.principal), kind: 'renewal', action: 'renewals_cleared', detail: 'Renewal ledger cleared' });
    return NextResponse.json({ auth: authContext(access.principal), status: 'cleared' });
  }

  return jsonError(400, 'invalid_action', 'Use action: seed or clear');
}
