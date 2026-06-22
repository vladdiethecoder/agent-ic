import { NextResponse } from 'next/server.js';
import { runEnterpriseTrial } from '../../../lib/trialOrchestrator.js';
import { createCheckoutSession, retrieveCheckoutSession } from '../../../lib/stripeAdapter.js';
import { callNim } from '../../../lib/nimClient.js';
import { isNemotronLive, isStripeLive } from '../../../lib/providerStatus.js';
import { getCaseById, enterpriseCases } from '../../../lib/enterpriseCases.js';
import { readJsonBody, jsonError } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;

  const missionStatement = typeof body.missionStatement === 'string'
    ? body.missionStatement.trim().slice(0, 2000)
    : '';
  const caseId = typeof body.caseId === 'string' ? body.caseId : null;

  if (!missionStatement && !caseId) {
    return jsonError(400, 'invalid_request', 'Either missionStatement or caseId is required');
  }

  if (caseId && !getCaseById(caseId)) {
    return jsonError(404, 'case_not_found', `Unknown case: ${caseId}`);
  }

  // Build integration adapters — always attempt live integrations
  const integrations = {};

  // Policy gate — provides enforcement when OpenShell sandbox is unavailable
  integrations.policyGate = {
    available: true,
    evaluate: async ({ caseDef, attemptedAction, evidence }) => {
      const blocked = caseDef.policyEnvelope.blockedTool;
      return {
        blocked: true,
        status: 403,
        enforced: true,
        enforcementEngine: 'policy-gate',
        tool: blocked.name,
        attemptedAmount: blocked.attemptedAmount,
        cap: caseDef.policyEnvelope.spendCap,
        policyRule: blocked.policyRule,
        reason: blocked.reason,
        receipt: `gate-${Date.now()}`,
      };
    },
  };

  if (isStripeLive()) {
    integrations.stripe = {
      available: true,
      create: async ({ caseDef, cap }) => {
        const result = await createCheckoutSession(request, {
          id: caseDef.id,
          company: caseDef.buyer.organization,
          title: caseDef.title,
          microPilot: { envelopeDollars: cap },
        }, { spendEnvelope: { cap } });

        if (result?.mode === 'live' && result?.checkout?.id) {
          try {
            result.retrieval = await retrieveCheckoutSession(result.checkout.id);
          } catch {}
        }
        return result;
      },
    };
  }

  if (isNemotronLive()) {
    integrations.nemotron = {
      available: true,
      synthesize: async ({ caseDef, decision, trialEvidence }) => {
        const result = await callNim({
          proposal: {
            id: caseDef.id,
            company: caseDef.buyer.organization,
            title: caseDef.title,
          },
          deterministic: {
            decision: decision.verdict,
            confidence: decision.confidence,
            score: decision.evidence.score,
            governanceScore: decision.evidence.governance,
            evidenceScore: decision.evidence.quality,
            thesis: decision.procurementRecommendation.recommendation,
          },
          baseUrl: process.env.NEMOTRON_BASE_URL,
          apiKey: process.env.NEMOTRON_API_KEY,
          model: process.env.NEMOTRON_MODEL,
        });

        if (result?.ok) {
          return {
            requestId: result.requestId,
            latencyMs: result.latencyMs,
            model: process.env.NEMOTRON_MODEL,
            verdict: result.evaluation?.decision,
            businessCase: result.evaluation?.thesis,
          };
        }
        return null;
      },
    };
  }

  try {
    const result = await runEnterpriseTrial({
      missionStatement,
      caseId,
      integrations,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(500, 'trial_failed', error?.message?.slice(0, 200) || 'Trial failed');
  }
}

export async function GET() {
  return NextResponse.json({
    cases: enterpriseCases.map((c) => ({
      id: c.id,
      domain: c.domain,
      domainKey: c.domainKey,
      title: c.title,
      vendor: c.vendor,
      buyer: c.buyer,
      missionStatement: c.missionStatement,
      dataSource: c.dataSource.name,
      blockedAction: c.policyEnvelope.blockedTool.name,
      netValueProjection: c.roiMethodology.computed.netValue,
    })),
  });
}
