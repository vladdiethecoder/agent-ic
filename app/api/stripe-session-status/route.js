import { NextResponse } from 'next/server.js';
import { pollCheckoutSession } from '../../../lib/stripeAdapter.js';
import { sanitizeProviderError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const timeoutMs = Number(searchParams.get('timeoutMs'));
  const pollOpts = Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {};

  try {
    const session = await pollCheckoutSession(sessionId, pollOpts);
    return NextResponse.json({
      paid: session.payment_status === 'paid',
      status: session.status,
      paymentStatus: session.payment_status,
      session,
    });
  } catch (error) {
    const status = error?.name === 'StripePollTimeout' ? 202 : 502;
    return NextResponse.json(
      {
        paid: false,
        status: error?.session?.status || 'unknown',
        paymentStatus: error?.session?.payment_status || 'unpaid',
        session: error?.session || null,
        error: sanitizeProviderError(error),
      },
      { status }
    );
  }
}
