import { NextResponse } from 'next/server.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { sanitizeProviderError } from '../../../lib/validation.js';
import { verifyStripeSignature } from '../../../lib/stripeAdapter.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  let rawPayload = '';
  try {
    rawPayload = await request.text();
  } catch (error) {
    return NextResponse.json({ error: 'failed to read body', detail: sanitizeProviderError(error) }, { status: 400 });
  }

  const signatureHeader = request.headers.get('stripe-signature') || '';
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json({
      ok: true,
      warning: 'STRIPE_WEBHOOK_SECRET not configured; signature not verified',
      received: true,
    });
  }

  const verification = verifyStripeSignature(rawPayload, signatureHeader, secret);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawPayload);
  } catch {
    return NextResponse.json({ error: 'malformed_json' }, { status: 400 });
  }

  const eventType = event.type;
  const sessionId = event?.data?.object?.id || 'unknown';

  if (eventType === 'checkout.session.completed' || eventType === 'payment_intent.succeeded') {
    appendAudit({
      actor: 'Stripe webhook',
      action: 'payment_confirmed',
      proposalId: event?.data?.object?.client_reference_id || event?.data?.object?.metadata?.proposal_id || null,
      detail: `${eventType} — session ${sessionId}`,
      kind: 'stripe',
      stripeEventType: eventType,
      stripeSessionId: sessionId,
    });
  }

  return NextResponse.json({ ok: true, received: true, type: eventType, sessionId });
}
