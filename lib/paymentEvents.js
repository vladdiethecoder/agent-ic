import { readTenantCollection, writeTenantCollection } from './tenantStore.js';

const COLLECTION = 'payment-events';
const EMPTY_STATE = { events: [] };

export function recordPaymentEvent({ tenantId, event }) {
  if (!tenantId) throw new Error('tenantId is required');
  if (!event?.id) throw new Error('event.id is required');
  const state = readState(tenantId);
  const normalized = normalizeStripeEvent({ tenantId, event });
  const existing = state.events.find((item) => item.eventId === normalized.eventId);
  if (existing) return { event: existing, replay: true };
  state.events.push(normalized);
  writeState(tenantId, state);
  return { event: normalized, replay: false };
}

export function listPaymentEvents({ tenantId, limit = 50 } = {}) {
  if (!tenantId) return [];
  return readState(tenantId).events
    .slice()
    .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))
    .slice(0, Math.max(0, Number(limit) || 50));
}

export function getPaymentEvent({ tenantId, eventId }) {
  if (!tenantId || !eventId) return null;
  return readState(tenantId).events.find((event) => event.eventId === eventId) || null;
}

export function recordPaymentReconciliation({ tenantId, eventId, sessionId, session, reconciledBy = 'system' }) {
  if (!tenantId) throw new Error('tenantId is required');
  if (!eventId) throw new Error('eventId is required');
  if (!session?.id) throw new Error('session.id is required');
  const state = readState(tenantId);
  const event = state.events.find((item) => item.eventId === eventId);
  if (!event) return { ok: false, code: 'payment_event_not_found', message: `Payment event not found: ${eventId}` };
  const expectedMasked = event.checkoutSession?.idMasked || null;
  const retrievedMasked = maskId(session.id);
  if (sessionId && expectedMasked && maskId(sessionId) !== expectedMasked) {
    return { ok: false, code: 'checkout_session_mismatch', message: 'Requested Checkout Session does not match the recorded payment event' };
  }
  const reconciliation = {
    recordType: 'stripe-payment-reconciliation-v1',
    reconciledAt: new Date().toISOString(),
    reconciledBy,
    provider: 'stripe',
    checkoutSession: {
      idMasked: retrievedMasked,
      paymentStatus: session.payment_status || null,
      status: session.status || null,
      amountTotal: session.amount_total || null,
      currency: session.currency || null,
      metadata: safeMetadata(session.metadata),
    },
    matchesWebhook: {
      checkoutSessionId: !expectedMasked || expectedMasked === retrievedMasked,
      paymentStatus: !event.checkoutSession?.paymentStatus || event.checkoutSession.paymentStatus === (session.payment_status || null),
      status: !event.checkoutSession?.status || event.checkoutSession.status === (session.status || null),
      amountTotal: !event.checkoutSession?.amountTotal || event.checkoutSession.amountTotal === (session.amount_total || null),
      currency: !event.checkoutSession?.currency || event.checkoutSession.currency === (session.currency || null),
    },
  };
  reconciliation.ok = Object.values(reconciliation.matchesWebhook).every(Boolean);
  event.reconciliation = reconciliation;
  writeState(tenantId, state);
  return { ok: true, event, reconciliation };
}

export function clearPaymentEvents({ tenantId }) {
  writeState(tenantId, EMPTY_STATE);
}

function normalizeStripeEvent({ tenantId, event }) {
  const object = event.data?.object || {};
  return {
    recordType: 'stripe-payment-event-v1',
    tenantId,
    eventId: event.id,
    type: event.type,
    livemode: Boolean(event.livemode),
    created: event.created || null,
    receivedAt: new Date().toISOString(),
    checkoutSession: object.object === 'checkout.session' ? {
      idMasked: maskId(object.id),
      paymentStatus: object.payment_status || null,
      status: object.status || null,
      clientReferenceId: object.client_reference_id || null,
      amountTotal: object.amount_total || null,
      currency: object.currency || null,
      metadata: safeMetadata(object.metadata),
    } : null,
  };
}

function safeMetadata(metadata = {}) {
  return Object.fromEntries(
    Object.entries(metadata || {}).map(([key, value]) => [String(key).slice(0, 80), String(value).slice(0, 200)])
  );
}

function readState(tenantId) {
  const state = readTenantCollection(tenantId, COLLECTION, EMPTY_STATE);
  return { events: Array.isArray(state.events) ? state.events : [] };
}

function writeState(tenantId, state) {
  return writeTenantCollection(tenantId, COLLECTION, { events: state.events || [] });
}

function maskId(value) {
  if (!value) return null;
  const text = String(value);
  if (text.length <= 14) return text;
  return `${text.slice(0, 8)}…${text.slice(-4)}`;
}
