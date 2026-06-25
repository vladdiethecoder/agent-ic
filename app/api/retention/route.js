import { NextResponse } from 'next/server.js';
import { readAudit } from '../../../lib/auditStore.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromBody, tenantFromUrl } from '../../../lib/authz.js';
import { listEvidenceArtifacts } from '../../../lib/evidenceStore.js';
import { listPaymentEvents } from '../../../lib/paymentEvents.js';
import { listPolicyVersions } from '../../../lib/policyStore.js';
import { createLegalHold, evaluateRetention, getRetentionState, releaseLegalHold, resourceFromRecord, updateRetentionPolicy } from '../../../lib/retentionPolicy.js';
import { listTrialRuns } from '../../../lib/trialStore.js';
import { readJsonBody, jsonError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_audit_log');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;
  return NextResponse.json({ auth: authContext(access.principal), ...retentionPayload(access.principal.tenantId) });
}

export async function POST(request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const action = typeof body.action === 'string' ? body.action : 'evaluate';
  const permission = action === 'evaluate' ? 'view_audit_log' : 'manage_policy';
  const access = await requireApiAccessAsync(request, permission);
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromBody(body));
  if (!tenantScope.ok) return tenantScope.response;

  if (action === 'update_policy') {
    const policy = updateRetentionPolicy({ tenantId: access.principal.tenantId, updates: body.policy || {}, updatedBy: access.principal.userId });
    appendAudit({ ...authContext(access.principal), kind: 'retention', action: 'retention_policy_updated', detail: 'Retention policy updated' });
    return NextResponse.json({ auth: authContext(access.principal), policy });
  }
  if (action === 'create_hold') {
    try {
      const hold = createLegalHold({ tenantId: access.principal.tenantId, resourceType: body.resourceType, resourceId: body.resourceId, reason: body.reason, createdBy: access.principal.userId });
      appendAudit({ ...authContext(access.principal), kind: 'retention', action: 'legal_hold_created', detail: `Legal hold ${hold.id} created`, holdId: hold.id, resourceType: hold.resourceType, resourceId: hold.resourceId });
      return NextResponse.json({ auth: authContext(access.principal), hold }, { status: 201 });
    } catch (error) {
      return jsonError(400, 'invalid_legal_hold', error.message);
    }
  }
  if (action === 'release_hold') {
    const result = releaseLegalHold({ tenantId: access.principal.tenantId, holdId: body.holdId, releasedBy: access.principal.userId });
    if (!result.ok) return jsonError(404, result.code, result.message);
    appendAudit({ ...authContext(access.principal), kind: 'retention', action: 'legal_hold_released', detail: `Legal hold ${result.hold.id} released`, holdId: result.hold.id });
    return NextResponse.json({ auth: authContext(access.principal), hold: result.hold });
  }
  if (action === 'evaluate') {
    return NextResponse.json({ auth: authContext(access.principal), ...retentionPayload(access.principal.tenantId) });
  }
  return jsonError(400, 'invalid_action', 'Use action: evaluate, update_policy, create_hold, or release_hold');
}

function retentionPayload(tenantId) {
  const resources = knownResources(tenantId);
  return {
    ...getRetentionState({ tenantId }),
    evaluation: evaluateRetention({ tenantId, resources }),
  };
}

function knownResources(tenantId) {
  return [
    ...readAudit({ tenantId }).map((row) => resourceFromRecord('audit', row)),
    ...listEvidenceArtifacts({ tenantId }).map((row) => resourceFromRecord('evidence', row)),
    ...listTrialRuns({ tenantId }).map((row) => resourceFromRecord('trials', row)),
    ...listPaymentEvents({ tenantId }).map((row) => resourceFromRecord('payments', row)),
    ...listPolicyVersions({ tenantId }).map((row) => resourceFromRecord('policies', row)),
  ];
}
