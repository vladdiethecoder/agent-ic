import { seededProposals, governancePolicy } from './demoData.js';
import { buildNemotronStatus } from './nemotronStatus.js';
import { buildSandboxStatus } from './sandboxPolicy.js';
import { buildStripeSkillReceipt } from './stripeSkills.js';
import { isHermesLive, isNemotronLive, isStripeLive, resolveHermesUrl } from './providerStatus.js';
import { OFFICIAL_PAYMENT_SKILLS } from './hermesClient.js';

// Hermes playbook: reusable pilot-evaluation skill generated from completed IC runs
export function buildHermesPlaybook(proposal, evaluation) {
  const playbookId = `playbook-${proposal.id}-${Date.now()}`;
  const taskId = `task-${Math.random().toString(36).slice(2, 10)}`;
  const version = '1.0.0';
  const reusedOn = seededProposals
    .filter((p) => p.id !== proposal.id)
    .map((p) => p.company)
    .slice(0, 2);

  return {
    id: playbookId,
    taskId,
    version,
    name: 'Bounded Capital Experiment Playbook',
    description: 'Reusable Hermes skill for approving a spend envelope, running a governed micro-pilot, blocking out-of-policy actions, and deciding on evidence.',
    inputs: {
      proposal: 'normalized IC schema (company, title, pain, ask, duration, evidence plan)',
      budget: 'recommendedBudget + autonomousSpendCap',
      policy: 'governancePolicy id + killCriteria',
      evidenceGates: 'week 0/2/4/6/8 milestones',
    },
    outputs: {
      spendCap: 'dollar amount with Stripe metadata',
      killCriteria: 'array of breach conditions',
      boardMemo: 'one-page investment recommendation',
    },
    reusedOn,
    artifact: `SKILL.md / ${taskId} / webhook:${proposal.id}`,
    hermesNative: true,
    ts: new Date().toISOString(),
  };
}

// Capital-release ladder: earned capital as evidence improves
export function buildCapitalLadder(evaluation) {
  const cap = evaluation.autonomousSpendCap;
  const budget = evaluation.recommendedBudget;
  const timeline = evaluation.evidenceTimeline;

  return [
    { week: 0, label: 'Proposal intake', released: 0, unlocked: 0, reason: 'Baseline locked. No capital released without evidence.' },
    { week: 2, label: 'Shadow mode', released: Math.round(cap * 0.12), unlocked: Math.round(cap * 0.24), reason: 'Canary passed. Limited compute pool released.' },
    { week: 4, label: 'Canary', released: Math.round(cap * 0.35), unlocked: cap, reason: 'B+ evidence. Autonomous spend cap unlocked.' },
    { week: 6, label: 'Controlled autonomy', released: Math.round(budget * 0.55), unlocked: budget, reason: 'Strong ROI. Full recommended budget unlocked.' },
    { week: 8, label: 'Decision gate', released: budget, unlocked: budget, reason: '2.36x ROI / 38-day payback. Full budget earned.' },
  ].map((step, i) => ({
    ...step,
    grade: timeline[i]?.grade || 'C',
    metric: timeline[i]?.metric || 'baseline locked',
  }));
}

function generateShortId(prefix = 'req') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36).slice(-4)}`;
}

// Provider receipts: live/fallback/demo/blocked states with metadata
export function buildProviderReceipts(
  evaluation,
  stripeResult = null,
  audit = [],
  opts = {}
) {
  const { hermesTask = null, nemotronLatencyMs = null, nemotronRequestId = null, sandboxResult = null } = opts;
  const nemotronLive = isNemotronLive();
  const stripeLive = isStripeLive();
  const hermesLive = isHermesLive();

  const blockedCount = audit.filter((a) => a.kind === 'blocked' || a.action.includes('blocked') || a.action.includes('DENIED')).length;
  const approvedCount = audit.filter((a) => a.kind === 'stripe' || a.action.includes('created')).length;
  const policyHash = `gov-${governancePolicy.version}`;

  return {
    nemotron: {
      state: nemotronLive ? 'live' : 'fallback',
      mode: nemotronLive ? 'live' : 'demo',
      model: process.env.NEMOTRON_MODEL || 'deterministic',
      requestId: nemotronRequestId || (nemotronLive ? generateShortId('nim') : null),
      latencyMs: nemotronLatencyMs != null ? `${nemotronLatencyMs}` : nemotronLive ? '~800-1400' : '0 (deterministic)',
      evaluator: evaluation.evaluator,
    },
    stripe: {
      state: stripeLive ? 'live' : 'demo',
      mode: stripeLive ? 'live' : 'demo',
      sessionId: stripeResult?.checkout?.id || null,
      clientReferenceId: stripeResult?.checkout?.client_reference_id || evaluation.proposalId,
      amountCents: stripeResult?.checkout?.amount_total || evaluation.autonomousSpendCap * 100,
      metadata: stripeResult?.checkout?.metadata || {
        proposal_id: evaluation.proposalId,
        governance_policy: governancePolicy.name,
        autonomous_spend_cap_dollars: String(evaluation.autonomousSpendCap),
      },
    },
    hermes: {
      state: hermesLive ? (hermesTask ? 'task-dispatched' : 'gateway-ready') : 'playbook-saved',
      mode: hermesLive ? 'live' : 'demo',
      playbookId: `playbook-${evaluation.proposalId}`,
      taskId: hermesTask?.taskId || `task-${Math.random().toString(36).slice(2, 10)}`,
      skillPlan: hermesTask?.skillPlan || OFFICIAL_PAYMENT_SKILLS,
      skillSource: hermesTask?.skillSource || (hermesLive ? 'hermes-gateway' : 'deterministic-catalog'),
      playbook: hermesTask?.playbook || null,
      gatewayUrl: hermesLive ? resolveHermesUrl() : null,
      reusedOn: seededProposals.filter((p) => p.id !== evaluation.proposalId).map((p) => p.company).slice(0, 2),
    },
    governance: {
      state: evaluation.decision === 'KILL' ? 'blocked' : 'approved',
      policyId: policyHash,
      policyHash,
      sandboxId: sandboxResult?.sandboxId || null,
      networkPolicy: sandboxResult?.networkPolicy || 'deny-all except allow-listed tool endpoints',
      blockedCount,
      approvedCount,
      killCriteria: governancePolicy.killCriteria,
    },
    audit: {
      rowCount: audit.length,
      newestId: audit[0]?.id || null,
      retentionLimit: 100,
    },
  };
}

// Operational mini-run: seeded dataset with concrete metrics
export function buildOperationalRun(proposal, evaluation, weekIndex = 4) {
  const timeline = evaluation.evidenceTimeline[weekIndex] || evaluation.evidenceTimeline[0];
  const baseCases = proposal.baseline.monthlyCases;
  const deflection = proposal.target.deflectionRate;
  const savedMinutes = proposal.target.minutesSavedPerCase;
  const hourlyCost = proposal.baseline.loadedHourlyCost;

  const processed = Math.round(baseCases * (weekIndex / 8));
  const autoTriaged = Math.round(processed * deflection * 0.85);
  const escalated = Math.round(processed * 0.12);
  const failedPolicy = Math.round(processed * 0.03);
  const hoursSaved = Math.round((autoTriaged * savedMinutes) / 60);
  const grossValue = Math.round(hoursSaved * hourlyCost);
  const spend = Math.round(evaluation.recommendedBudget * (weekIndex / 8) * 0.15);
  const netValue = grossValue - spend;

  return {
    week: timeline.week,
    label: timeline.label,
    processed,
    autoTriaged,
    escalated,
    failedPolicy,
    hoursSaved,
    grossValue,
    spend,
    netValue,
    grade: timeline.grade,
    metric: timeline.metric,
  };
}

// Blocked governance event: out-of-policy tool request or over-cap spend attempt
export function buildBlockedEvent(proposal, evaluation) {
  const blockedTool = proposal.microPilot?.blockedTool;
  const cap = evaluation.spendEnvelope?.cap || evaluation.autonomousSpendCap;
  if (blockedTool) {
    return {
      actor: 'SaaS provisioning agent',
      action: 'DENIED',
      proposalId: proposal.id,
      detail: `Attempted to use ${blockedTool.name} (${blockedTool.category}) — ${blockedTool.reason}`,
      kind: 'blocked',
      policyBreach: 'tool_scope_violation',
      attemptedTool: blockedTool.name,
      attemptedAmount: cap * 1.5,
      cap,
      stripeResult: 'No session created — blocked before network call',
    };
  }
  const attemptAmount = Math.round(evaluation.autonomousSpendCap * 1.5);
  return {
    actor: 'SaaS provisioning agent',
    action: 'DENIED',
    proposalId: proposal.id,
    detail: `Attempted to provision SaaS above autonomous cap: $${attemptAmount.toLocaleString()} exceeds $${evaluation.autonomousSpendCap.toLocaleString()}`,
    kind: 'blocked',
    policyBreach: 'autonomous_spend_cap_exceeded',
    attemptedAmount: attemptAmount,
    cap: evaluation.autonomousSpendCap,
    stripeResult: 'No session created — blocked before network call',
  };
}

// Multi-skill business beat: concrete Hermès skills that run inside the envelope
export function buildHermesSkills(evaluation) {
  const cap = evaluation.spendEnvelope?.cap || evaluation.autonomousSpendCap || 100;
  const spend = evaluation.evidenceReceipts?.find((r) => r.metric === 'spend_consumed')?.value || 35;
  const remaining = Math.max(0, cap - spend);
  const partsSpend = Math.min(28, remaining);

  return [
    {
      name: 'parts-order-cli',
      displayName: 'Parts Order CLI',
      action: 'Auto-order replacement parts for triaged cases',
      amount: partsSpend,
      merchant: 'Atlas Freight parts supplier',
      approvalGate: 'Pre-approved inside envelope; human batch review nightly',
      status: 'completed',
      result: `Ordered ${partsSpend} USD of replacement parts within the remaining envelope`,
    },
    {
      name: 'slack-status-cli',
      displayName: 'Slack Status CLI',
      action: 'Post pilot outcome to team channel',
      amount: 0,
      merchant: 'Slack workspace',
      approvalGate: 'Read-only notification; no autonomous write to customers',
      status: 'completed',
      result: 'Notified #logistics-ops: 48 auto-triaged, 100 cases processed, net 631 USD',
    },
  ];
}

// Ordered stage timeline for the recording cockpit animation
export function buildRunStages(proposal, evaluation, stripeResult, blockedEvent) {
  const now = Date.now();
  const cap = evaluation.spendEnvelope?.cap || evaluation.autonomousSpendCap || 100;
  const spend =
    evaluation.evidenceReceipts?.find((r) => r.metric === 'spend_consumed')?.value || 35;
  const qa =
    evaluation.evidenceReceipts?.find((r) => r.metric === 'qa_agreement')?.value || 91;
  const skills = buildHermesSkills(evaluation);

  return [
    {
      id: 'mission',
      label: 'Mission loaded',
      status: 'complete',
      detail: `${proposal.company} — ${proposal.microPilot?.mission || proposal.title}`,
      ts: new Date(now).toISOString(),
    },
    {
      id: 'sandbox',
      label: 'OpenShell sandbox ready',
      status: 'complete',
      detail: 'deny-all network policy · short-lived credentials · policy invariants recorded',
      ts: new Date(now + 200).toISOString(),
    },
    {
      id: 'envelope',
      label: 'Spend envelope created',
      status: 'complete',
      detail: `Cap ${cap} USD · ${(proposal.microPilot?.allowedTools || []).length} allowed tools · ${governancePolicy.killCriteria.length} kill criteria`,
      ts: new Date(now + 400).toISOString(),
    },
    {
      id: 'stripe',
      label: 'Stripe authorization recorded',
      status: 'complete',
      detail: `${stripeResult?.mode || 'demo'} session ${stripeResult?.checkout?.id || 'cs_test_agent_ic_...'} · recurring spend blocked`,
      ts: new Date(now + 900).toISOString(),
    },
    {
      id: 'stripeSkill',
      label: 'Stripe Link skill approved',
      status: 'approved',
      detail: 'Buy SaaS subscription with one-time virtual card · human approval required',
      ts: new Date(now + 1200).toISOString(),
    },
    {
      id: 'blocked',
      label: 'Out-of-policy spend blocked',
      status: 'blocked',
      detail: `${blockedEvent?.attemptedTool || 'Premium market-rate lookup API'} denied · 403 Forbidden · ${blockedEvent?.policyBreach || 'tool_scope_violation'}`,
      ts: new Date(now + 1500).toISOString(),
    },
    {
      id: 'evidence',
      label: 'Evidence imported',
      status: 'complete',
      detail: `100 cases · ${qa}% QA · ${spend} USD spent · net computed`,
      ts: new Date(now + 2000).toISOString(),
    },
    {
      id: 'skills',
      label: 'Hermes skills executed',
      status: 'complete',
      detail: `${skills[0]?.displayName || 'Parts Order CLI'} · ${skills[1]?.displayName || 'Slack Status CLI'}`,
      ts: new Date(now + 2500).toISOString(),
    },
    {
      id: 'decision',
      label: 'Capital decision issued',
      status: evaluation.microPilot?.decision === 'CONTINUE' ? 'approved' : 'blocked',
      detail: `${evaluation.microPilot?.decision || 'CONTINUE'} · next cap ${evaluation.microPilot?.nextCap || Math.round(cap * 2.5)} USD · ${evaluation.microPilot?.autonomy || 'draft-only'}`,
      ts: new Date(now + 3000).toISOString(),
    },
  ];
}

// Run orchestration payload: everything the recording cockpit needs in one shape
export function buildRunOrchestrationPayload(proposal, evaluation, stripeResult, blockedEvent, hermesPlaybook, boardPacket, audit) {
  const receipts = evaluation.evidenceReceipts || [];
  const byMetric = Object.fromEntries(receipts.map((r) => [r.metric, r.value]));
  const micro = evaluation.microPilot || {};
  const cap = evaluation.spendEnvelope?.cap || 100;
  const spendConsumed = byMetric.spend_consumed ?? 0;

  const nemotron = buildNemotronStatus(evaluation);
  const sandbox = buildSandboxStatus(evaluation, blockedEvent);
  const stripeSkill = buildStripeSkillReceipt(evaluation, 'stripe-link-cli');
  const skills = buildHermesSkills(evaluation);
  const stages = buildRunStages(proposal, evaluation, stripeResult, blockedEvent);

  return {
    runId: `run_${proposal.id}_${Date.now()}`,
    inputHash: `input-${proposal.id}`,
    policyHash: `gov-${governancePolicy.version}`,
    nemotron,
    sandbox,
    stripeSkill,
    skills,
    stages,
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
      casesProcessed: byMetric.cases_processed ?? 0,
      autoTriaged: byMetric.auto_triaged ?? 0,
      hoursSaved: byMetric.hours_saved ?? 0,
      grossValue: byMetric.gross_value ?? 0,
      spendConsumed,
      netValue: byMetric.net_value ?? 0,
      qaAgreement: byMetric.qa_agreement ?? 0,
      criticalIncidents: byMetric.critical_incidents ?? 0,
    },
    decision: {
      verdict: micro.decision || 'CONTINUE',
      nextCap: micro.nextCap || Math.round(cap * 2.5),
      autonomy: micro.autonomy || 'draft-only',
      qaThreshold: micro.qaThreshold ?? 85,
      envelopeCap: micro.envelopeCap ?? cap,
    },
    hermesPlaybook,
    boardPacket,
    auditRows: audit.slice(0, 8),
  };
}

// Board packet: exportable memo, audit, and next gate
export function buildBoardPacket(evaluation, evidenceGate, audit) {
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return {
    memo: {
      title: `Agent IC Investment Memo — ${evaluation.company}`,
      decision: evaluation.decision,
      thesis: evaluation.thesis,
      budget: currency.format(evaluation.recommendedBudget),
      cap: currency.format(evaluation.autonomousSpendCap),
      payback: `${evaluation.paybackDays} days`,
      roi: `${evaluation.roiMultiple}x 90-day`,
      confidence: evaluation.confidence,
      evidenceGrade: evidenceGate?.latest?.grade || 'C',
      netObserved: currency.format(evidenceGate?.net || 0),
    },
    auditSummary: {
      totalEvents: audit.length,
      evaluationEvents: audit.filter((a) => a.kind === 'evaluation').length,
      stripeEvents: audit.filter((a) => a.kind === 'stripe').length,
      evidenceEvents: audit.filter((a) => a.kind === 'evidence').length,
      blockedEvents: audit.filter((a) => a.kind === 'blocked').length,
    },
    nextGate: {
      label: '30-day review',
      date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      criteria: ['Evidence grade maintained at B+', 'Net observed value positive', 'No governance invariant breach'],
    },
  };
}
