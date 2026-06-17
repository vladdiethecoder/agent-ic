import { governancePolicy } from './demoData.js';
import { buildNemotronStatus } from './nemotronStatus.js';
import { buildSandboxStatus } from './sandboxPolicy.js';
import { buildStripeSkillReceipt } from './stripeSkills.js';
import { buildHermesPlaybook, buildProviderReceipts } from './proofEngine.js';
import { isDemoModeGlobal } from './providerStatus.js';

// v8 run payload builder. Started as a thin wrapper around the v7 proof engine so
// the new /api/run-capital-experiment-v8 route has a stable contract while live
// integrations (Hermes, NIM, NemoClaw) are wired in by the implementation swarm.
export function buildRunOrchestrationPayloadV8(
  proposal,
  evaluation,
  stripeResult,
  blockedEvent,
  hermesPlaybook,
  boardPacket,
  audit,
  { hermesTask = null, nemotronLatencyMs = null, nemotronRequestId = null, realBlockedCall = null, sandboxResult = null } = {}
) {
  const cap = evaluation.spendEnvelope?.cap || evaluation.autonomousSpendCap || 100;
  const spendConsumed =
    evaluation.evidenceReceipts?.find((r) => r.metric === 'spend_consumed')?.value ?? 0;
  const qaAgreement =
    evaluation.evidenceReceipts?.find((r) => r.metric === 'qa_agreement')?.value ?? 91;

  const nemotron = buildNemotronStatus(evaluation, nemotronLatencyMs);
  const sandbox = buildSandboxStatus(evaluation, blockedEvent, realBlockedCall, sandboxResult);
  const stripeSkill = buildStripeSkillReceipt(evaluation, 'stripe-link-cli');
  const providerReceipts = buildProviderReceipts(
    evaluation,
    stripeResult,
    audit,
    { hermesTask, nemotronLatencyMs, nemotronRequestId, sandboxResult }
  );

  return {
    runId: `run_${proposal.id}_${Date.now()}`,
    inputHash: `input-${proposal.id}`,
    policyHash: `gov-${governancePolicy.version}`,
    nemotron,
    sandbox,
    stripeSkill,
    skills: [], // populated by the caller after Hermes skill execution
    stages: [], // populated by the caller with live stage timings
    mission: {
      company: proposal.company,
      title: proposal.title,
      description: proposal.microPilot?.mission || proposal.title,
      durationHours: proposal.microPilot?.durationHours || 72,
      allowedTools: proposal.microPilot?.allowedTools || [],
      killCriteria: governancePolicy.killCriteria,
    },
    envelope: {
      cap,
      spent: spendConsumed,
      remaining: Math.max(0, cap - spendConsumed),
      renewal: 'blocked',
      allowedToolCount: (proposal.microPilot?.allowedTools || []).length,
      blockedTool: proposal.microPilot?.blockedTool || null,
    },
    stripe: {
      mode: stripeResult?.mode || 'demo',
      sessionId: stripeResult?.checkout?.id || null,
      clientReferenceId: stripeResult?.checkout?.client_reference_id || proposal.id,
      amountCents: stripeResult?.checkout?.amount_total || cap * 100,
      metadata: stripeResult?.checkout?.metadata || {
        proposal_id: proposal.id,
        governance_policy: governancePolicy.name,
        autonomous_spend_cap_dollars: String(cap),
      },
      url: stripeResult?.checkout?.url || null,
    },
    blocked: blockedEvent,
    evidence: {
      casesProcessed:
        evaluation.evidenceReceipts?.find((r) => r.metric === 'cases_processed')?.value ?? 0,
      autoTriaged:
        evaluation.evidenceReceipts?.find((r) => r.metric === 'auto_triaged')?.value ?? 0,
      hoursSaved:
        evaluation.evidenceReceipts?.find((r) => r.metric === 'hours_saved')?.value ?? 0,
      grossValue:
        evaluation.evidenceReceipts?.find((r) => r.metric === 'gross_value')?.value ?? 0,
      spendConsumed,
      netValue:
        evaluation.evidenceReceipts?.find((r) => r.metric === 'net_value')?.value ?? 0,
      qaAgreement,
      criticalIncidents:
        evaluation.evidenceReceipts?.find((r) => r.metric === 'critical_incidents')?.value ?? 0,
    },
    decision: {
      verdict: evaluation.microPilot?.decision || evaluation.decision || 'CONTINUE',
      nextCap: evaluation.microPilot?.nextCap || Math.round(cap * 2.5),
      autonomy: evaluation.microPilot?.autonomy || 'draft-only',
      qaThreshold: evaluation.microPilot?.qaThreshold ?? 85,
      envelopeCap: evaluation.microPilot?.envelopeCap ?? cap,
    },
    hermesPlaybook,
    boardPacket,
    providerReceipts,
    auditRows: audit.slice(0, 8),
    demoMode: isDemoModeGlobal(),
  };
}

export { buildHermesPlaybook, buildProviderReceipts };
