import { NextResponse } from 'next/server.js';
import { seededProposals, governancePolicy } from '../../../lib/demoData.js';
import { scoreMicroPilot } from '../../../lib/decisionEngine.js';
import { appendAudit, readAudit } from '../../../lib/auditStore.js';
import { jsonError, readJsonBody, sanitizeProviderError } from '../../../lib/validation.js';
import { createCheckoutSession, pollCheckoutSession } from '../../../lib/stripeAdapter.js';
import { buildHermesPlaybook, buildBoardPacket, buildBlockedEvent } from '../../../lib/proofEngine.js';
import { buildRunOrchestrationPayloadV8 } from '../../../lib/proofEngine-v8.js';
import { appendLiveTrace, clearLiveTrace } from '../../../lib/liveTrace.js';
import { dispatchToHermes } from '../../../lib/hermesClient.js';
import { callNim } from '../../../lib/nimClient.js';
import { isHermesLive, isNemoclawLive, isNemotronLive } from '../../../lib/providerStatus.js';
import { createOpenShellSandbox, gateToolCall } from '../../../lib/nemoclawClient.js';
import { RunCapitalExperimentRequestSchema, parseSchema } from '../../../lib/schemas.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;
  const schemaResult = parseSchema(RunCapitalExperimentRequestSchema, body);
  if (!schemaResult.ok) {
    return jsonError(400, 'invalid_request', schemaResult.error.message);
  }
  const validatedBody = schemaResult.data;

  const proposalId = validatedBody.proposalId || seededProposals[0].id;
  const proposal = seededProposals.find((p) => p.id === proposalId);
  if (!proposal) {
    return NextResponse.json({ error: 'proposal_not_found' }, { status: 404 });
  }

  const overrides = {
    qaAgreement: Number.isFinite(Number(validatedBody.qaAgreement)) ? Number(validatedBody.qaAgreement) : undefined,
    envelopeCap: Number.isFinite(Number(validatedBody.envelopeCap)) ? Number(validatedBody.envelopeCap) : undefined,
  };

  try {
    let evaluation = scoreMicroPilot(proposal, overrides);
    let nemotronLatencyMs = null;
    let nemotronRequestId = null;
    let nimError = null;

    if (isNemotronLive()) {
      const nimResult = await callNim({
        proposal,
        deterministic: evaluation,
        baseUrl: process.env.NEMOTRON_BASE_URL,
        apiKey: process.env.NEMOTRON_API_KEY,
        model: process.env.NEMOTRON_MODEL,
      });
      nemotronLatencyMs = nimResult.latencyMs;
      nemotronRequestId = nimResult.requestId || null;
      if (nimResult.ok) {
        evaluation = nimResult.evaluation;
      } else {
        nimError = nimResult.error;
      }
    }

    const cap = evaluation.spendEnvelope.cap;

    appendAudit({
      actor: 'Agent IC policy engine',
      action: 'envelope_created',
      proposalId: proposal.id,
      detail: `Spend cap ${cap} USD, ${evaluation.spendEnvelope.allowedTools.length} allowed tools, ${governancePolicy.killCriteria.length} kill criteria`,
      kind: 'evaluation',
    });

    // Dispatch to Hermes Agent gateway and append task receipt.
    const hermesTask = await dispatchToHermes(proposal, evaluation);

    appendAudit({
      actor: hermesTask?.ok ? 'Hermes Agent gateway' : 'Hermes Agent gateway (fallback)',
      action: 'hermes_handoff',
      proposalId: proposal.id,
      detail: hermesTask?.ok
        ? `Dispatched task ${hermesTask.taskId || 'unknown'} in ${hermesTask.latencyMs || 0}ms`
        : hermesTask?.error || 'Hermes dispatch unavailable',
      kind: 'hermes',
      provider_mode: isHermesLive() ? (hermesTask?.ok ? 'live' : 'fallback') : 'mock',
    });

    // Phase 2: Stripe Checkout Session (live path already implemented in stripeAdapter).
    let stripeResult;
    let stripeError = null;
    let paymentStatus = 'unpaid';
    try {
      stripeResult = await createCheckoutSession(request, proposal, evaluation);

      // Optional non-blocking payment-status polling for live sessions.
      if (
        process.env.AGENT_IC_STRIPE_POLL_PAYMENT === 'true' &&
        stripeResult?.mode === 'live' &&
        stripeResult?.checkout?.id
      ) {
        try {
          const paidSession = await pollCheckoutSession(stripeResult.checkout.id, { timeoutMs: 15_000 });
          paymentStatus = paidSession.payment_status || 'paid';
        } catch (pollError) {
          if (pollError?.name === 'StripePollTimeout') {
            paymentStatus = 'unpaid';
          } else {
            stripeError = stripeError || sanitizeProviderError(pollError);
          }
        }
      }
    } catch (error) {
      stripeError = sanitizeProviderError(error);
    }

    appendAudit({
      actor: stripeResult?.mode === 'live' ? 'Stripe live adapter' : 'Stripe demo adapter',
      action: stripeError ? 'Checkout Session creation failed' : 'created Checkout Session',
      proposalId: proposal.id,
      detail: stripeError
        ? stripeError
        : `${stripeResult.mode} session ${stripeResult.checkout.id} for cap ${cap} USD (paymentStatus=${paymentStatus})`,
      kind: stripeError ? 'stripe-error' : 'stripe',
      provider_mode: stripeResult?.mode === 'live' ? 'live' : 'mock',
    });

    // Phase 3: NemoClaw / OpenShell sandbox creation and blocked-action gate.
    let sandboxResult = {
      ok: false,
      sandboxId: `sandbox-${proposal.id}-fallback`,
      networkPolicy: 'deny-all except allow-listed tool endpoints',
      invariants: governancePolicy.invariants,
      status: 'ready',
      error: 'NEMOCLAW_PROXY_URL not configured',
    };
    let nemoclawSandboxError = null;

    if (isNemoclawLive()) {
      try {
        sandboxResult = await createOpenShellSandbox(proposal, evaluation);
      } catch (error) {
        nemoclawSandboxError = sanitizeProviderError(error);
      }
    }

    appendAudit({
      actor: sandboxResult?.ok ? 'NemoClaw OpenShell broker' : 'NemoClaw OpenShell broker (fallback)',
      action: 'sandbox_created',
      proposalId: proposal.id,
      detail: sandboxResult?.ok
        ? `Sandbox ${sandboxResult.sandboxId} ready · ${sandboxResult.networkPolicy}`
        : (sandboxResult?.error || 'OpenShell sandbox unavailable'),
      kind: 'governance',
      provider_mode: isNemoclawLive() ? (sandboxResult?.ok ? 'live' : 'fallback') : 'mock',
    });

    const ATTEMPTED_AMOUNT = 150;
    const ENVELOPE_CAP = 100;

    const blockedTool = proposal.microPilot?.blockedTool;
    const toolRequest = blockedTool
      ? {
          method: 'POST',
          targetUri: isNemoclawLive()
            ? 'https://premium-market-api.example.com/v1/lookup'
            : `${new URL(request.url).origin}/api/gate-stub`,
          amount: ATTEMPTED_AMOUNT,
          cap: ENVELOPE_CAP,
          merchantCategory: blockedTool.category || 'Unapproved external data vendor',
          proposalId: proposal.id,
          sandboxId: sandboxResult?.sandboxId || null,
        }
      : null;

    let realBlockedCall = null;
    let blockedEvent = buildBlockedEvent(proposal, evaluation);
    let nemoclawError = null;

    clearLiveTrace();

    if (toolRequest) {
      try {
        const gateBody = isNemoclawLive()
          ? {
              method: toolRequest.method,
              targetUri: toolRequest.targetUri,
              amount: toolRequest.amount,
              cap: toolRequest.cap,
              merchantCategory: toolRequest.merchantCategory,
              proposalId: toolRequest.proposalId,
              sandboxId: toolRequest.sandboxId,
            }
          : {
              proposalId: toolRequest.proposalId,
              amount: toolRequest.amount,
              cap: toolRequest.cap,
              tool: 'premium-market-api.example.com',
              category: toolRequest.merchantCategory,
            };
        appendLiveTrace('request', gateBody);

        const gateResult = isNemoclawLive()
          ? await gateToolCall(toolRequest)
          : await gateToolCallDemoStub(toolRequest, request, gateBody);

        const rawResponse = gateResult.ok
          ? { ok: true, allowed: true }
          : {
              ok: false,
              allowed: false,
              blockedCall: gateResult.blockedCall,
              error: gateResult.error,
            };
        appendLiveTrace('response', rawResponse);

        if (!gateResult.ok) {
          const call = gateResult.blockedCall;
          // Only treat the call as "real" if the network request actually reached
          // the gate (non-zero status). Otherwise fall back to the deterministic
          // blocked-event shape so tests and offline demos still show a 403.
          realBlockedCall = call?.status ? call : null;
          nemoclawError = gateResult.error;
          blockedEvent = {
            ...blockedEvent,
            attemptedAmount: ATTEMPTED_AMOUNT,
            cap: ENVELOPE_CAP,
            status: 403,
            detail: realBlockedCall?.detail || blockedEvent.detail,
            rawRequest: gateBody,
            rawResponse,
          };
        }
      } catch (error) {
        nemoclawError = sanitizeProviderError(error);
      }
    }

    appendAudit({
      actor: realBlockedCall ? 'NemoClaw live broker' : 'SaaS provisioning agent',
      action: 'DENIED',
      proposalId: proposal.id,
      detail: blockedEvent.detail,
      kind: 'blocked',
      policyBreach: blockedEvent.policyBreach,
      attemptedTool: blockedEvent.attemptedTool,
      attemptedAmount: blockedEvent.attemptedAmount,
      cap,
      realBlockedCall: realBlockedCall || undefined,
      nemoclawError: nemoclawError || undefined,
      provider_mode: isNemoclawLive() ? (realBlockedCall ? 'live' : 'fallback') : 'mock',
    });

    appendAudit({
      actor: 'ROI evidence collector',
      action: 'evidence_imported',
      proposalId: proposal.id,
      detail: `${evaluation.evidenceReceipts.find((r) => r.metric === 'cases_processed')?.value ?? 0} cases, QA ${evaluation.evidenceReceipts.find((r) => r.metric === 'qa_agreement')?.value ?? 0}%, net ${evaluation.evidenceReceipts.find((r) => r.metric === 'net_value')?.value ?? 0} USD`,
      kind: 'evidence',
    });

    const hermesPlaybook = buildHermesPlaybook(proposal, evaluation);
    const boardPacket = buildBoardPacket(evaluation, null, readAudit());

    appendAudit({
      actor: 'Agent IC decision engine',
      action: 'decision_issued',
      proposalId: proposal.id,
      detail: `${evaluation.microPilot.decision} — next cap ${evaluation.microPilot.nextCap} USD, autonomy ${evaluation.microPilot.autonomy}`,
      kind: 'evaluation',
    });

    const audit = readAudit();
    const payload = buildRunOrchestrationPayloadV8(
      proposal,
      evaluation,
      stripeResult || null,
      blockedEvent,
      hermesPlaybook,
      boardPacket,
      audit,
      { hermesTask, nemotronLatencyMs, nemotronRequestId, realBlockedCall, sandboxResult }
    );

    return NextResponse.json({
      ...payload,
      paymentStatus,
      liveError: stripeError || nimError || nemoclawSandboxError || nemoclawError || null,
      audit,
    });
  } catch (error) {
    const message = sanitizeProviderError(error);
    return NextResponse.json({ error: 'run_failed', message }, { status: 500 });
  }
}

async function gateToolCallDemoStub(toolRequest, request, gateBody) {
  const origin = new URL(request.url).origin;
  const body = gateBody || {
    proposalId: toolRequest.proposalId,
    amount: toolRequest.amount,
    cap: toolRequest.cap,
    tool: 'premium-market-api.example.com',
    category: toolRequest.merchantCategory,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(`${origin}/api/gate-stub`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        allowed: false,
        blockedCall: {
          host: new URL(origin).hostname,
          method: toolRequest.method,
          path: '/api/gate-stub',
          attemptedAmount: toolRequest.amount,
          cap: toolRequest.cap,
          status: response.status,
          policy: payload.error || 'tool_scope_violation',
          detail: payload.reason || 'Out-of-policy tool request denied by local demo gate.',
        },
        error: `${response.status}: ${payload.reason || 'blocked'}`,
      };
    }

    return { ok: true, allowed: true, blockedCall: null, error: null };
  } catch (error) {
    clearTimeout(timeout);
    return {
      ok: false,
      allowed: false,
      blockedCall: {
        host: new URL(origin).hostname,
        method: toolRequest.method,
        path: '/api/gate-stub',
        attemptedAmount: toolRequest.amount,
        cap: toolRequest.cap,
        status: 0,
        policy: 'demo_gate_unreachable',
        detail: error?.name === 'AbortError' ? 'Demo gate request timed out' : String(error),
      },
      error: error?.name === 'AbortError' ? 'Demo gate request timed out' : String(error),
    };
  }
}
