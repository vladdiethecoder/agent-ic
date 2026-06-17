import { NextResponse } from 'next/server.js';
import { seededProposals } from '../../../lib/demoData.js';
import { scoreProposal } from '../../../lib/decisionEngine.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { getProposalOrError, jsonError, readJsonBody } from '../../../lib/validation.js';
import { buildHermesPlaybook, buildProviderReceipts, buildOperationalRun, buildBlockedEvent, buildBoardPacket } from '../../../lib/proofEngine.js';
import { isNemotronLive } from '../../../lib/providerStatus.js';
import { callNim } from '../../../lib/nimClient.js';
import { EvaluateRequestSchema, parseSchema } from '../../../lib/schemas.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;
  const schemaResult = parseSchema(EvaluateRequestSchema, body);
  if (!schemaResult.ok) {
    return jsonError(400, 'invalid_request', schemaResult.error.message);
  }
  const validatedBody = schemaResult.data;
  const { proposal, response } = getProposalOrError(seededProposals, validatedBody.proposalId, { allowDefault: true });
  if (response) return response;

  const deterministic = scoreProposal(proposal);
  const liveAllowed = isNemotronLive();

  let evaluation = deterministic;
  let liveError = null;
  let nemotronLatencyMs = null;
  let nemotronRequestId = null;

  if (liveAllowed) {
    const result = await callNim({
      proposal,
      deterministic,
      baseUrl: process.env.NEMOTRON_BASE_URL,
      apiKey: process.env.NEMOTRON_API_KEY,
      model: process.env.NEMOTRON_MODEL,
    });
    nemotronLatencyMs = result.latencyMs;
    nemotronRequestId = result.requestId || null;
    if (result.ok) {
      evaluation = result.evaluation;
    } else {
      liveError = result.error;
      evaluation = {
        ...deterministic,
        evaluator: 'NVIDIA NIM / Nemotron failed; deterministic fallback used',
        liveError,
      };
    }
  }

  const audit = appendAudit({
    actor: evaluation.evaluator,
    action: 'evaluated proposal',
    proposalId: proposal.id,
    detail: `${evaluation.decision} / score ${evaluation.score} / budget ${evaluation.recommendedBudget}`,
    kind: 'evaluation',
    provider_mode: liveAllowed ? (liveError ? 'fallback' : 'live') : 'mock',
  });

  const hermesPlaybook = buildHermesPlaybook(proposal, evaluation);
  const providerReceipts = buildProviderReceipts(evaluation, null, [audit], { nemotronLatencyMs, nemotronRequestId });
  const operationalRun = buildOperationalRun(proposal, evaluation, 4);
  const blockedEvent = buildBlockedEvent(proposal, evaluation);
  const boardPacket = buildBoardPacket(evaluation, null, [audit]);

  return NextResponse.json({
    proposal,
    evaluation,
    audit,
    liveError,
    hermesPlaybook,
    providerReceipts,
    operationalRun,
    blockedEvent,
    boardPacket,
    spendEnvelope: evaluation.spendEnvelope,
    blockedAction: evaluation.blockedAction,
    evidenceReceipts: evaluation.evidenceReceipts,
  });
}
