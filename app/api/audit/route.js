import { NextResponse } from 'next/server.js';
import { seededProposals } from '../../../lib/demoData.js';
import { scoreProposal } from '../../../lib/decisionEngine.js';
import { appendAudit, readAudit, resetAudit } from '../../../lib/auditStore.js';
import { getProposalOrError, readJsonBody } from '../../../lib/validation.js';
import { buildBlockedEvent, buildProviderReceipts } from '../../../lib/proofEngine.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ audit: readAudit() });
}

export async function POST(request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;

  if (body.reset) {
    if (body.confirmReset !== 'AGENT_IC_DEMO_RESET') {
      return NextResponse.json({ error: 'reset requires AGENT_IC_DEMO_RESET confirmation' }, { status: 403 });
    }
    resetAudit();
    return NextResponse.json({ audit: [] });
  }

  const entry = appendAudit({
    actor: body.actor || 'Agent IC UI',
    action: body.action || 'recorded event',
    proposalId: body.proposalId || null,
    detail: body.detail || '',
    kind: body.kind || 'manual',
  });

  return NextResponse.json({ entry, audit: readAudit() });
}

export async function PUT(request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;
  const { proposal, response } = getProposalOrError(seededProposals, body.proposalId, { allowDefault: true });
  if (response) return response;
  const evaluation = scoreProposal(proposal);
  evaluation.audit.forEach((entry) => appendAudit({ ...entry, proposalId: proposal.id, kind: 'seed' }));

  // Add blocked governance event for contrast
  const blockedEvent = buildBlockedEvent(proposal, evaluation);
  appendAudit(blockedEvent);

  // Add provider receipts snapshot
  const providerReceipts = buildProviderReceipts(evaluation, null, readAudit());

  return NextResponse.json({ audit: readAudit(), providerReceipts });
}
