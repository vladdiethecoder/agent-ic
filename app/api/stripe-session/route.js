import { NextResponse } from 'next/server.js';
import { seededProposals } from '../../../lib/demoData.js';
import { scoreProposal } from '../../../lib/decisionEngine.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { getProposalOrError as validateProposal, isKillDecision, jsonError, readJsonBody, sanitizeProviderError } from '../../../lib/validation.js';
import { buildProviderReceipts } from '../../../lib/proofEngine.js';
import { createCheckoutSession } from '../../../lib/stripeAdapter.js';
import { StripeSessionRequestSchema, parseSchema } from '../../../lib/schemas.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;
  const schemaResult = parseSchema(StripeSessionRequestSchema, body);
  if (!schemaResult.ok) {
    return jsonError(400, 'invalid_request', schemaResult.error.message);
  }
  const validatedBody = schemaResult.data;
  const { proposal, response } = validateProposal(seededProposals, validatedBody.proposalId, { allowDefault: true });
  if (response) return response;

  const evaluation = validatedBody.evaluation || scoreProposal(proposal);
  if (isKillDecision(evaluation)) {
    return jsonError(409, 'spend_blocked_by_kill_decision', 'KILL decisions cannot authorize Stripe spend');
  }

  try {
    const stripeResult = await createCheckoutSession(request, proposal, evaluation, {
      idempotencyKey: validatedBody.idempotencyKey,
    });
    const audit = appendAudit({
      actor: stripeResult.mode === 'live' ? 'Stripe live adapter' : 'Stripe demo adapter',
      action: 'created Checkout Session',
      proposalId: proposal.id,
      detail: `${stripeResult.mode} session ${stripeResult.checkout.id} for ${proposal.company} governed pilot authorization`,
      kind: 'stripe',
      provider_mode: stripeResult.mode === 'live' ? 'live' : 'mock',
    });
    const providerReceipts = buildProviderReceipts(evaluation, stripeResult, [audit]);
    return NextResponse.json({ ...stripeResult, audit, providerReceipts });
  } catch (error) {
    const detail = sanitizeProviderError(error?.name === 'AbortError' ? 'Stripe request timed out' : error);
    const audit = appendAudit({
      actor: 'Stripe live adapter',
      action: 'Checkout Session creation failed',
      proposalId: proposal.id,
      detail,
      kind: 'stripe-error',
    });
    return NextResponse.json(
      { mode: 'live', error: { message: detail }, audit },
      { status: error?.name === 'AbortError' ? 504 : 502 }
    );
  }
}
