import { NextResponse } from 'next/server.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { incrementCounter, recordEvent } from '../../../lib/observability.js';
import { recordPaymentEvent } from '../../../lib/paymentEvents.js';
import { verifyStripeSignature } from '../../../lib/stripeAdapter.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const raw = await request.text();
  const signature = request.headers.get('stripe-signature') || '';
  const verified = verifyStripeSignature(raw, signature, process.env.STRIPE_WEBHOOK_SECRET);
  if (!verified.ok) {
    incrementCounter('agent_ic_stripe_webhook_rejected_total', { reason: verified.error || 'unknown' });
    return NextResponse.json({ error: 'Invalid Stripe webhook signature', code: 'stripe_signature_invalid' }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Malformed Stripe webhook JSON', code: 'malformed_json' }, { status: 400 });
  }

  const object = event.data?.object || {};
  const tenantId = object.metadata?.tenant_id || object.metadata?.tenantId || 'local-tenant';
  const recorded = recordPaymentEvent({ tenantId, event });
  incrementCounter('agent_ic_stripe_webhooks_total', { tenantId, type: event.type, replay: String(recorded.replay) });
  recordEvent({ level: 'info', kind: 'payment', action: 'stripe_webhook_recorded', tenantId, eventId: event.id, type: event.type, replay: recorded.replay });
  appendAudit({
    tenantId,
    userId: 'stripe-webhook',
    role: 'system',
    kind: 'payment',
    action: recorded.replay ? 'stripe_webhook_replayed' : 'stripe_webhook_recorded',
    detail: `Stripe webhook ${event.type} recorded`,
    stripeEventId: event.id,
    stripeType: event.type,
    paymentStatus: recorded.event.checkoutSession?.paymentStatus || null,
  });

  return NextResponse.json({ ok: true, replay: recorded.replay, event: recorded.event });
}
