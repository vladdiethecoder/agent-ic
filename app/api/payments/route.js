import { NextResponse } from 'next/server.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromBody, tenantFromUrl } from '../../../lib/authz.js';
import { paginationFromRequest, paginatedField } from '../../../lib/pagination.js';
import { getPaymentEvent, listPaymentEvents, recordPaymentReconciliation } from '../../../lib/paymentEvents.js';
import { retrieveCheckoutSession } from '../../../lib/stripeAdapter.js';
import { jsonError, readJsonBody, sanitizeProviderError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_audit_log');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromUrl(request));
  if (!tenantScope.ok) return tenantScope.response;
  const url = new URL(request.url);
  const eventId = url.searchParams.get('eventId') || '';
  if (eventId) {
    const event = getPaymentEvent({ tenantId: access.principal.tenantId, eventId });
    if (!event) return jsonError(404, 'payment_event_not_found', `Payment event not found: ${eventId}`);
    return NextResponse.json({ auth: authContext(access.principal), event });
  }
  const page = paginatedField('events', listPaymentEvents({ tenantId: access.principal.tenantId, limit: 500 }), paginationFromRequest(request));
  return NextResponse.json({ auth: authContext(access.principal), ...page });
}

export async function POST(request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const action = typeof body.action === 'string' ? body.action : '';
  const access = await requireApiAccessAsync(request, 'approve_spend');
  if (!access.ok) return access.response;
  const tenantScope = requireTenantScope(access.principal, tenantFromBody(body));
  if (!tenantScope.ok) return tenantScope.response;

  if (action !== 'reconcile') return jsonError(400, 'invalid_action', 'Use action: reconcile');
  const eventId = String(body.eventId || '').trim();
  const sessionId = String(body.sessionId || '').trim();
  if (!eventId) return jsonError(400, 'event_id_required', 'eventId is required');
  if (!sessionId) return jsonError(400, 'session_id_required', 'sessionId is required for Stripe retrieval');

  try {
    const session = await retrieveCheckoutSession(sessionId);
    const result = recordPaymentReconciliation({ tenantId: access.principal.tenantId, eventId, sessionId, session, reconciledBy: access.principal.userId });
    if (!result.ok) return jsonError(result.code === 'payment_event_not_found' ? 404 : 409, result.code, result.message);
    appendAudit({
      ...authContext(access.principal),
      kind: 'payment',
      action: result.reconciliation.ok ? 'stripe_payment_reconciled' : 'stripe_payment_reconciliation_mismatch',
      detail: `Stripe Checkout Session reconciliation ${result.reconciliation.ok ? 'matched' : 'mismatched'} for event ${eventId}`,
      stripeEventId: eventId,
      reconciliationOk: result.reconciliation.ok,
      paymentStatus: result.reconciliation.checkoutSession.paymentStatus,
    });
    return NextResponse.json({ auth: authContext(access.principal), event: result.event, reconciliation: result.reconciliation });
  } catch (error) {
    return jsonError(502, 'stripe_reconciliation_failed', sanitizeProviderError(error));
  }
}
