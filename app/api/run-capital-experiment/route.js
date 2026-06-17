import { NextResponse } from 'next/server.js';
import { seededProposals, governancePolicy } from '../../../lib/demoData.js';
import { scoreMicroPilot } from '../../../lib/decisionEngine.js';
import { appendAudit, readAudit } from '../../../lib/auditStore.js';
import { readJsonBody, sanitizeProviderError } from '../../../lib/validation.js';
import {
  buildBlockedEvent,
  buildBoardPacket,
  buildHermesPlaybook,
  buildProviderReceipts,
  buildRunOrchestrationPayload,
} from '../../../lib/proofEngine.js';
import { createCheckoutSession } from '../../../lib/stripeAdapter.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;

  const proposalId = body.proposalId || seededProposals[0].id;
  const proposal = seededProposals.find((p) => p.id === proposalId);
  if (!proposal) {
    return NextResponse.json({ error: 'proposal_not_found' }, { status: 404 });
  }

  const overrides = {
    qaAgreement: Number.isFinite(Number(body.qaAgreement)) ? Number(body.qaAgreement) : undefined,
    envelopeCap: Number.isFinite(Number(body.envelopeCap)) ? Number(body.envelopeCap) : undefined,
  };

  try {
    const evaluation = scoreMicroPilot(proposal, overrides);
    const cap = evaluation.spendEnvelope.cap;

    const envelopeAudit = appendAudit({
      actor: 'Agent IC policy engine',
      action: 'envelope_created',
      proposalId: proposal.id,
      detail: `Spend cap ${cap} USD, ${evaluation.spendEnvelope.allowedTools.length} allowed tools, ${governancePolicy.killCriteria.length} kill criteria`,
      kind: 'evaluation',
    });

    let stripeResult;
    let stripeError = null;
    try {
      stripeResult = await createCheckoutSession(request, proposal, evaluation);
    } catch (error) {
      stripeError = sanitizeProviderError(error);
    }

    const stripeAudit = appendAudit({
      actor: stripeResult?.mode === 'live' ? 'Stripe live adapter' : 'Stripe demo adapter',
      action: stripeError ? 'Checkout Session creation failed' : 'created Checkout Session',
      proposalId: proposal.id,
      detail: stripeError
        ? stripeError
        : `${stripeResult.mode} session ${stripeResult.checkout.id} for cap ${cap} USD`,
      kind: stripeError ? 'stripe-error' : 'stripe',
    });

    const blockedEvent = buildBlockedEvent(proposal, evaluation);
    const blockedAudit = appendAudit({
      ...blockedEvent,
      proposalId: proposal.id,
    });

    const evidenceAudit = appendAudit({
      actor: 'ROI evidence collector',
      action: 'evidence_imported',
      proposalId: proposal.id,
      detail: `${evaluation.evidenceReceipts.find((r) => r.metric === 'cases_processed')?.value ?? 0} cases, QA ${evaluation.evidenceReceipts.find((r) => r.metric === 'qa_agreement')?.value ?? 0}%, net ${evaluation.evidenceReceipts.find((r) => r.metric === 'net_value')?.value ?? 0} USD`,
      kind: 'evidence',
    });

    const hermesPlaybook = buildHermesPlaybook(proposal, evaluation);
    const providerReceipts = buildProviderReceipts(evaluation, stripeResult || null, readAudit());
    const boardPacket = buildBoardPacket(evaluation, null, readAudit());

    const decisionAudit = appendAudit({
      actor: 'Agent IC decision engine',
      action: 'decision_issued',
      proposalId: proposal.id,
      detail: `${evaluation.microPilot.decision} — next cap ${evaluation.microPilot.nextCap} USD, autonomy ${evaluation.microPilot.autonomy}`,
      kind: 'evaluation',
    });

    const audit = readAudit();
    const payload = buildRunOrchestrationPayload(
      proposal,
      evaluation,
      stripeResult || null,
      blockedEvent,
      hermesPlaybook,
      boardPacket,
      audit
    );

    return NextResponse.json({
      ...payload,
      providerReceipts,
      liveError: stripeError,
      audit,
    });
  } catch (error) {
    const message = sanitizeProviderError(error);
    return NextResponse.json({ error: 'run_failed', message }, { status: 500 });
  }
}
