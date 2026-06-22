import { NextResponse } from 'next/server.js';
import { getRenewalHistory, getAllVendorRelationships, seedDemoRenewalHistory, clearLedger } from '../../../lib/renewalLedger.js';
import { getCaseById, enterpriseCases } from '../../../lib/enterpriseCases.js';
import { readJsonBody, jsonError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/renewals
 * Query params:
 *   ?caseId=<id> — get renewal history for a specific case
 *   ?all=true — get all vendor relationships
 *
 * Returns accumulated evidence across monthly renewal cycles.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const caseId = url.searchParams.get('caseId');
  const all = url.searchParams.get('all') === 'true';
  const seed = url.searchParams.get('seed') === 'true';

  // Seed demo history if requested
  if (seed) {
    for (const c of enterpriseCases) {
      seedDemoRenewalHistory(c.id, c);
    }
  }

  if (all) {
    const relationships = getAllVendorRelationships();
    return NextResponse.json({ relationships });
  }

  if (caseId) {
    const caseDef = getCaseById(caseId);
    if (!caseDef) {
      return jsonError(404, 'case_not_found', `Unknown case: ${caseId}`);
    }
    const history = getRenewalHistory(caseId);
    return NextResponse.json(history);
  }

  // Default: return all relationships
  const relationships = getAllVendorRelationships();
  return NextResponse.json({ relationships });
}

/**
 * POST /api/renewals
 * Actions: seed (create demo history), clear (reset ledger)
 */
export async function POST(request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;

  if (body.action === 'seed') {
    for (const c of enterpriseCases) {
      seedDemoRenewalHistory(c.id, c);
    }
    const relationships = getAllVendorRelationships();
    return NextResponse.json({ status: 'seeded', relationships });
  }

  if (body.action === 'clear') {
    clearLedger();
    return NextResponse.json({ status: 'cleared' });
  }

  return jsonError(400, 'invalid_action', 'Use action: seed or clear');
}
