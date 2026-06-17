import { NextResponse } from 'next/server.js';
import { seededProposals } from '../../../lib/demoData.js';
import { scoreProposal } from '../../../lib/decisionEngine.js';
import { buildProviderStates } from '../../../lib/providerStatus.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const proposal = seededProposals[0];
  const evaluation = scoreProposal(proposal);
  return NextResponse.json({
    ok: true,
    app: 'Agent IC',
    proposalCount: seededProposals.length,
    seededScenario: proposal.id,
    decision: evaluation.decision,
    budget: evaluation.recommendedBudget,
    integrations: buildProviderStates(),
  });
}
