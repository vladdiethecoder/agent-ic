import { NextResponse } from 'next/server.js';

export const dynamic = 'force-dynamic';

/**
 * Local policy-gate stub used in demo mode to prove the blocked-action path.
 * It returns a real HTTP 403 with structured policy metadata so the UI/terminal
 * can show an authentic network intercept instead of a pre-baked UI state.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const proposalId = body.proposalId || request.headers.get('x-proposal-id') || 'unknown';
  const attemptedAmount = Number(body.amount) || 0;
  const cap = Number(body.cap) || 100;
  const tool = body.tool || 'Premium market-rate lookup API';
  const category = body.category || 'Unapproved external data vendor';

  if (attemptedAmount <= cap) {
    return NextResponse.json({
      ok: true,
      allowed: true,
      envelope_cap: cap,
      attempted_amount: attemptedAmount,
      proposal_id: proposalId,
      tool,
      category,
      policy: 'NemoClaw / OpenShell-style operating envelope',
      timestamp: new Date().toISOString(),
    });
  }

  const blocked = {
    error: 'tool_scope_violation',
    status: 403,
    reason: `${tool} (${category}) is outside the approved SaaS list and the attempted amount exceeds the per-authorization cap.`,
    attempted_amount: attemptedAmount,
    envelope_cap: cap,
    proposal_id: proposalId,
    policy: 'NemoClaw / OpenShell-style operating envelope',
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(blocked, { status: 403 });
}
