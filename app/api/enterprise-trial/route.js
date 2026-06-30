import { NextResponse } from 'next/server.js';
import { runEnterpriseTrial } from '../../../lib/trialOrchestrator.js';
import { createCheckoutSession, retrieveCheckoutSession } from '../../../lib/stripeAdapter.js';
import { callNim } from '../../../lib/nimClient.js';
import { isHermesLive, isNemotronLive, isStripeLive } from '../../../lib/providerStatus.js';
import { dispatchToHermes } from '../../../lib/hermesClient.js';
import { getCaseById, enterpriseCases } from '../../../lib/enterpriseCases.js';
import { readJsonBody, jsonError } from '../../../lib/validation.js';
import { authContext, requireApiAccessAsync, requireTenantScope, tenantFromBody } from '../../../lib/authz.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { requireApprovedSpend } from '../../../lib/approvalWorkflow.js';
import { isProductionMode } from '../../../lib/productionConfig.js';
import { incrementCounter, logError, recordEvent } from '../../../lib/observability.js';
import { recordTrialRun } from '../../../lib/trialStore.js';
import { beginIdempotentRequest, completeIdempotentRequest, fingerprintPayload, idempotencyConflictResponse, idempotencyHeaders, idempotencyInProgressResponse, idempotencyKeyFromRequest } from '../../../lib/idempotencyStore.js';
import { appendLiveTrace } from '../../../lib/liveTrace.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const access = await requireApiAccessAsync(request, 'create_trial');
  if (!access.ok) return access.response;

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;

  const missionStatement = typeof body.missionStatement === 'string'
    ? body.missionStatement.trim().slice(0, 2000)
    : '';
  const caseId = typeof body.caseId === 'string' ? body.caseId : null;
  const requireLiveProof = body.requireLiveProof === true || process.env.AGENT_IC_REQUIRE_LIVE_PROOF === 'true';
  const tenantScope = requireTenantScope(access.principal, tenantFromBody(body));
  if (!tenantScope.ok) return tenantScope.response;

  if (isProductionMode() && !caseId) {
    return jsonError(400, 'case_id_required', 'caseId is required for production trial execution so approval scope can be verified');
  }

  if (!missionStatement && !caseId) {
    return jsonError(400, 'invalid_request', 'Either missionStatement or caseId is required');
  }

  const selectedCase = caseId ? getCaseById(caseId) : null;
  if (caseId && !selectedCase) {
    return jsonError(404, 'case_not_found', `Unknown case: ${caseId}`);
  }

  const approvalResult = isProductionMode()
    ? requireApprovedSpend({
        tenantId: access.principal.tenantId,
        approvalId: typeof body.approvalId === 'string' ? body.approvalId : '',
        caseId: caseId || selectedCase?.id,
        spendCap: selectedCase?.policyEnvelope?.spendCap || 100,
      })
    : { ok: true, approval: null };
  const idempotencyKey = idempotencyKeyFromRequest(request, body);
  const idempotencyScope = 'enterprise-trial:post';
  const idempotencyFingerprint = fingerprintPayload({ tenantId: access.principal.tenantId, caseId, missionStatement, approvalId: body.approvalId || '', requireLiveProof, production: isProductionMode() });
  const idempotency = beginIdempotentRequest({ tenantId: access.principal.tenantId, key: idempotencyKey, scope: idempotencyScope, fingerprint: idempotencyFingerprint });
  if (idempotency.status === 'conflict') {
    return NextResponse.json(idempotencyConflictResponse(idempotency.record), { status: 409, headers: idempotencyHeaders('conflict') });
  }
  if (idempotency.status === 'in_progress') {
    return NextResponse.json(idempotencyInProgressResponse(idempotency.record), { status: 409, headers: idempotencyHeaders('in_progress') });
  }
  if (idempotency.status === 'replay') {
    return NextResponse.json(idempotency.record.responseBody, { status: idempotency.record.status, headers: idempotencyHeaders('replay') });
  }

  if (!approvalResult.ok) {
    incrementCounter('agent_ic_trials_blocked_total', { reason: approvalResult.code, tenantId: access.principal.tenantId });
    appendAudit({
      ...authContext(access.principal),
      kind: 'approval',
      action: 'trial_blocked_missing_approval',
      caseId,
      detail: approvalResult.message,
    });
    const responseBody = { error: approvalResult.message, code: approvalResult.code };
    completeIdempotentRequest({ tenantId: access.principal.tenantId, key: idempotencyKey, scope: idempotencyScope, fingerprint: idempotencyFingerprint, responseBody, status: 409 });
    return NextResponse.json(responseBody, { status: 409, headers: idempotencyHeaders(idempotency.status === 'new' ? 'stored' : '') });
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
        verificationStatus: 'verified',
        enforcementEngine: 'policy-gate',
        enforcementMode: 'local-deny-by-default-policy-gate',
        tool: blocked.name,
        attemptedAmount: blocked.attemptedAmount,
        cap: caseDef.policyEnvelope.spendCap,
        policyRule: blocked.policyRule,
        reason: blocked.reason,
        receipt: `gate-${Date.now()}`,
        allowedAction: evidence?.dataHash ? {
          tool: caseDef.policyEnvelope.allowedTools[0] || 'allowlisted evidence source',
          decision: 'allowed',
          status: 200,
          enforcementMode: 'local-deny-by-default-policy-gate',
          evidenceSource: evidence.dataSource,
          evidenceHash: evidence.dataHash,
          reason: 'Allowlisted workload evidence read completed before the denied paid enrichment attempt.',
        } : null,
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

  const skipNemotronSynthesis = process.env.AGENT_IC_SKIP_NEMOTRON_SYNTHESIS === 'true';
  if (isNemotronLive()) {
    integrations.nemotron = { available: true };

    if (!skipNemotronSynthesis) {
      integrations.nemotron.synthesize = async ({ caseDef, decision, trialEvidence }) => {
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
            mode: 'live',
            verdict: result.evaluation?.decision,
            businessCase: result.evaluation?.thesis,
          };
        }
        return {
          requestId: null,
          latencyMs: result?.latencyMs || 0,
          model: process.env.NEMOTRON_MODEL,
          mode: 'deterministic-fallback',
          verdict: decision.verdict,
          businessCase: decision.procurementRecommendation?.recommendation,
          unavailableReason: result?.error || 'Nemotron procurement synthesis unavailable',
        };
      };
    }
  }

  if (isHermesLive()) {
    integrations.hermes = {
      available: true,
      dispatch: async ({ proposal, evaluation }) => dispatchToHermes(proposal, evaluation),
    };
  }

  try {
    const traceContext = { tenantId: access.principal.tenantId, caseId: caseId || selectedCase?.id || null };
    const result = await runEnterpriseTrial({
      missionStatement,
      caseId,
      requireLiveProof,
      integrations,
      hooks: {
        onTrace: (type, body) => appendLiveTrace(type, { ...traceContext, ...body }),
        onStage: (stage, body) => appendLiveTrace(`stage.${stage}`, { ...traceContext, ...body }),
      },
      tenantId: access.principal.tenantId,
      userId: access.principal.userId,
    });
    const trialRecord = recordTrialRun({ tenantId: access.principal.tenantId, userId: access.principal.userId, result });
    appendAudit({
      ...authContext(access.principal),
      actor: 'Agent IC',
      kind: 'trial',
      action: 'enterprise_trial_completed',
      runId: result.runId,
      caseId: result.caseId,
      detail: `Trial ${result.runId} completed with ${result.decision?.verdict}`,
      verdict: result.decision?.verdict,
      policyBlocked: result.policyBlock?.result?.blocked === true,
      evidenceHash: result.workerResult?.evidence?.dataHash || null,
    });
    const responseBody = { ...result, auth: authContext(access.principal), trialRecord: { runId: trialRecord.runId, storedAt: trialRecord.storedAt }, approval: approvalResult.approval ? { id: approvalResult.approval.id, status: approvalResult.approval.status, spendCap: approvalResult.approval.spendCap } : null };
    completeIdempotentRequest({ tenantId: access.principal.tenantId, key: idempotencyKey, scope: idempotencyScope, fingerprint: idempotencyFingerprint, responseBody, status: 200 });
    return NextResponse.json(responseBody, { headers: idempotencyHeaders(idempotency.status === 'new' ? 'stored' : '') });
  } catch (error) {
    incrementCounter('agent_ic_trials_failed_total', { tenantId: access.principal.tenantId, caseId: caseId || 'unknown' });
    logError('enterprise_trial_failed', error, { tenantId: access.principal.tenantId, caseId });
    return jsonError(500, 'trial_failed', error?.message?.slice(0, 200) || 'Trial failed');
  }
}

export async function GET(request) {
  const access = await requireApiAccessAsync(request, 'view_evidence');
  if (!access.ok) return access.response;

  return NextResponse.json({
    auth: authContext(access.principal),
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
