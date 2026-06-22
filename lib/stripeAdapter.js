import { createHmac, timingSafeEqual } from 'node:crypto';
import { sanitizeProviderError } from './validation.js';
import { isStripeLive } from './providerStatus.js';

export function isDemoMode() {
  return !isStripeLive();
}

export function computeSpendCapDollars(evaluation) {
  if (evaluation?.spendEnvelope?.cap) {
    return evaluation.spendEnvelope.cap;
  }
  if (Number.isFinite(Number(evaluation?.autonomousSpendCap)) && Number(evaluation.autonomousSpendCap) > 0) {
    return Math.round(Number(evaluation.autonomousSpendCap));
  }
  return 100;
}

export async function createCheckoutSession(request, proposal, evaluationOverride = null, opts = {}) {
  const evaluation = evaluationOverride || {};
  const demoMode = isDemoMode();
  const spendCapDollars = computeSpendCapDollars(evaluation);
  const idempotencyKey = typeof opts.idempotencyKey === 'string' ? opts.idempotencyKey.trim().slice(0, 200) : null;

  if (demoMode) {
    throw new Error('Stripe not configured. Set STRIPE_SECRET_KEY to run governed trials.');
  }

  const origin = new URL(request.url).origin;
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${origin}/?stripe=success&proposal=${proposal.id}`);
  params.set('cancel_url', `${origin}/?stripe=cancelled&proposal=${proposal.id}`);
  params.set('client_reference_id', proposal.id);
  params.set('metadata[proposal_id]', proposal.id);
  params.set('metadata[governance_policy]', 'Agent IC governed envelope');
  params.set('metadata[autonomous_spend_cap_dollars]', String(spendCapDollars));
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(spendCapDollars * 100));
  params.set('line_items[0][price_data][product_data][name]', `Agent IC governed service-trial authorization — ${proposal.company}`);
  params.set(
    'line_items[0][price_data][product_data][description]',
    `${proposal.title}. Authorized by Agent IC; no spend above cap without audit entry.`
  );

  const headers = {
    authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) {
    headers['idempotency-key'] = idempotencyKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers,
      body: params,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const checkout = await stripeResponse.json().catch(() => ({ error: { message: 'Stripe returned non-JSON response' } }));
    if (!stripeResponse.ok) {
      const message = checkout?.error?.message || `HTTP ${stripeResponse.status}`;
      throw new Error(message);
    }
    return { mode: 'live', checkout, spendCapDollars, evaluation };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

export async function pollCheckoutSession(sessionId, { timeoutMs = 15_000, intervalMs = 1_500 } = {}) {
  if (!sessionId) throw new Error('sessionId is required');
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }

  const url = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`;
  const headers = {
    authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
  };
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let interval;
    let timedOut = false;

    const cleanup = () => {
      if (interval) clearInterval(interval);
    };

    const attempt = async () => {
      if (timedOut) return;
      try {
        const response = await fetch(url, { headers });
        const session = await response.json().catch(() => ({}));
        if (!response.ok) {
          cleanup();
          reject(new Error(session?.error?.message || `Stripe HTTP ${response.status}`));
          return;
        }
        if (session.payment_status === 'paid') {
          cleanup();
          resolve(session);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          timedOut = true;
          cleanup();
          const timeoutError = new Error(`Payment status polling timed out after ${timeoutMs}ms`);
          timeoutError.name = 'StripePollTimeout';
          timeoutError.session = session;
          reject(timeoutError);
        }
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    interval = setInterval(attempt, intervalMs);
    attempt();
  });
}

export async function retrieveCheckoutSession(sessionId) {
  if (!sessionId) throw new Error('sessionId is required');
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }

  const url = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const session = await response.json().catch(() => ({ error: { message: 'Stripe returned non-JSON response' } }));
    if (!response.ok) {
      throw new Error(session?.error?.message || `Stripe HTTP ${response.status}`);
    }
    return session;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

export function verifyStripeSignature(payload, signatureHeader, secret) {
  if (!secret) return { ok: false, error: 'STRIPE_WEBHOOK_SECRET not configured' };
  if (!signatureHeader) return { ok: false, error: 'missing stripe-signature header' };

  const parts = signatureHeader.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) {
    return { ok: false, error: 'invalid stripe-signature header format' };
  }

  try {
    const signedPayload = `${timestamp}.${payload}`;
    const expected = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== signatureBuf.length || !timingSafeEqual(expectedBuf, signatureBuf)) {
      return { ok: false, error: 'stripe signature mismatch' };
    }
    return { ok: true, timestamp: Number(timestamp) };
  } catch {
    return { ok: false, error: 'stripe signature verification failed' };
  }
}

export function getProposalOrError(seededProposals, proposalId, opts = {}) {
  if (!proposalId && opts.allowDefault) {
    return { proposal: seededProposals[0], response: null };
  }
  const proposal = seededProposals.find((p) => p.id === proposalId);
  if (!proposal) {
    return {
      proposal: null,
      response: { error: 'proposal_not_found', message: `Unknown proposal: ${proposalId}` },
    };
  }
  return { proposal, response: null };
}
