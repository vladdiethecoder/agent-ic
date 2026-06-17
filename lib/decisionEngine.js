import { governancePolicy, seededTimeline } from './demoData.js';
import { assertValidProposal } from './validation.js';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function scoreProposal(proposal, overrides = {}) {
  assertValidProposal(proposal);
  const envelopeCap = overrides.envelopeCap ?? proposal.microPilot?.envelopeDollars ?? 100;
  const readiness = proposal.dataReadiness;
  const leverage = proposal.automationLeverage;
  const urgency = proposal.businessUrgency;
  const riskPenalty = proposal.integrationRisk * 0.18 + proposal.complianceRisk * 0.24;
  const score = clamp(readiness * 0.24 + leverage * 0.29 + urgency * 0.21 + (100 - riskPenalty) * 0.26);
  const governanceScore = clamp(100 - proposal.complianceRisk * 0.42 - proposal.integrationRisk * 0.28 + readiness * 0.18);
  const evidenceScore = clamp(
    readiness * 0.33 +
      (proposal.evidencePlan.length >= 4 ? 28 : 16) +
      (proposal.baseline.monthlyCases > 1000 ? 14 : 6) +
      (proposal.target.paybackDays < 90 ? 18 : 8)
  );

  const monthlyLaborSavings =
    proposal.baseline.monthlyCases *
    proposal.target.deflectionRate *
    (proposal.target.minutesSavedPerCase / 60) *
    proposal.baseline.loadedHourlyCost;
  const monthlyLeakageSavings = proposal.baseline.refundLeakageMonthly * proposal.target.leakageReduction;
  const monthlyChurnProtection = proposal.baseline.churnRiskMonthly * Math.min(0.24, proposal.target.deflectionRate * 0.32);
  const monthlyGrossBenefit = monthlyLaborSavings + monthlyLeakageSavings + monthlyChurnProtection;

  const recommendedBudget = Math.round(
    Math.min(
      proposal.ask,
      Math.max(65000, monthlyGrossBenefit * 1.1 + proposal.durationWeeks * 5200)
    ) / 1000
  ) * 1000;
  const paybackDays = Math.max(21, Math.round((recommendedBudget / Math.max(monthlyGrossBenefit, 1)) * 30));
  const roiMultiple = round((monthlyGrossBenefit * 3) / recommendedBudget, 2);
  const autonomousSpendCap = Math.round(recommendedBudget * (governanceScore > 80 ? 0.19 : 0.08) / 1000) * 1000;

  const decision =
    governanceScore < 62 || evidenceScore < 58
      ? 'KILL'
      : paybackDays > 120
        ? 'RE-SCOPE'
        : score >= 72
          ? 'CONTINUE'
          : 'RE-SCOPE';

  const confidence =
    evidenceScore >= 82 && governanceScore >= 80
      ? 'high'
      : evidenceScore >= 70 && governanceScore >= 68
        ? 'medium'
        : 'low';

  const budget = buildBudget(proposal, recommendedBudget, autonomousSpendCap, governanceScore);
  const riskRegister = buildRiskRegister(proposal, governanceScore);
  const audit = buildAuditTrail(proposal, decision, recommendedBudget, paybackDays, roiMultiple);
  const spendEnvelope = buildSpendEnvelope(proposal, envelopeCap);
  const blockedAction = buildBlockedAction(proposal, spendEnvelope);
  const evidenceReceipts = buildEvidenceReceipts(proposal, spendEnvelope);

  return {
    proposalId: proposal.id,
    company: proposal.company,
    title: proposal.title,
    model: process.env.NEMOTRON_MODEL || 'deterministic-nemotron-style-evaluator',
    evaluator: process.env.NEMOTRON_API_KEY ? 'NVIDIA NIM / Nemotron path configured' : 'Local deterministic fallback',
    score: Math.round(score),
    governanceScore: Math.round(governanceScore),
    evidenceScore: Math.round(evidenceScore),
    decision,
    confidence,
    recommendedBudget,
    autonomousSpendCap,
    paybackDays,
    roiMultiple,
    monthlyGrossBenefit: Math.round(monthlyGrossBenefit),
    thesis: buildThesis(proposal, decision, paybackDays, roiMultiple, governanceScore),
    budget,
    riskRegister,
    governance: governancePolicy,
    evidenceTimeline: seededTimeline.map((event) => ({
      ...event,
      cumulativeImpact: event.week === 0 ? 0 : Math.round(event.impact * (recommendedBudget / 185000)),
    })),
    audit,
    nextActions: buildNextActions(decision, proposal, autonomousSpendCap),
    spendEnvelope,
    blockedAction,
    evidenceReceipts,
  };
}

function buildBudget(proposal, recommendedBudget, autonomousSpendCap, governanceScore) {
  const weights = governanceScore > 75
    ? { compute: 0.27, data: 0.18, saas: 0.2, human: 0.21, evidence: 0.09 }
    : { compute: 0.23, data: 0.16, saas: 0.14, human: 0.28, evidence: 0.09 };
  const compute = Math.round(recommendedBudget * weights.compute / 1000) * 1000;
  const data = Math.round(recommendedBudget * weights.data / 1000) * 1000;
  const saas = Math.round(recommendedBudget * weights.saas / 1000) * 1000;
  const human = Math.round(recommendedBudget * weights.human / 1000) * 1000;
  const evidence = Math.max(0, Math.round(recommendedBudget * weights.evidence / 1000) * 1000);
  const contingency = Math.max(0, recommendedBudget - compute - data - saas - human - evidence);

  return [
    {
      name: 'Nemotron/NIM inference + Hermes runtime',
      amount: compute,
      owner: 'AI platform',
      stripeAction: 'pre-authorize monthly compute pool',
      cap: autonomousSpendCap,
    },
    {
      name: 'Sandbox data connectors + read replicas',
      amount: data,
      owner: 'Data engineering',
      stripeAction: 'provision vendor seats after DPA check',
      cap: Math.round(data * 0.35),
    },
    {
      name: 'SaaS tools the agent may buy/use',
      amount: saas,
      owner: 'Pilot operator',
      stripeAction: 'Stripe Checkout session for controlled spend card',
      cap: Math.round(saas * 0.5),
    },
    {
      name: 'Human review + approval room',
      amount: human,
      owner: 'Business sponsor',
      stripeAction: 'no autonomous purchase; labor budget only',
      cap: 0,
    },
    {
      name: 'ROI evidence warehouse + audit packet',
      amount: evidence,
      owner: 'Finance analytics',
      stripeAction: 'warehouse and observability meters',
      cap: Math.round(evidence * 0.2),
    },
    {
      name: 'Contingency locked behind IC vote',
      amount: contingency,
      owner: 'Agent IC chair',
      stripeAction: 'manual release only',
      cap: 0,
    },
  ];
}

function buildRiskRegister(proposal, governanceScore) {
  const risks = [
    {
      name: 'Tool overreach',
      severity: proposal.integrationRisk > 60 ? 'high' : 'medium',
      mitigation: 'Hermes tool scopes expire per workstream; writes require signed budget line and replayable audit entry.',
    },
    {
      name: 'Spend leakage',
      severity: proposal.ask > 200000 ? 'high' : 'medium',
      mitigation: 'Stripe Checkout creates one pilot authorization; autonomous spend cap is lower than approved pilot budget.',
    },
    {
      name: 'Weak ROI proof',
      severity: proposal.dataReadiness < 80 ? 'high' : 'medium',
      mitigation: 'Holdout/control cohort plus finance-owned evidence warehouse before continue decision.',
    },
  ];

  if (proposal.complianceRisk > 65) {
    risks.push({
      name: 'Regulated action boundary',
      severity: 'critical',
      mitigation: 'Shadow mode first; external messages remain drafts; analyst approval required for tier-2+ cases.',
    });
  }

  if (governanceScore < 70) {
    risks.push({
      name: 'Governance score below automatic approval',
      severity: 'high',
      mitigation: 'Re-scope to read-only / draft-only pilot before any Stripe spend is released.',
    });
  }

  return risks;
}

function buildThesis(proposal, decision, paybackDays, roiMultiple, governanceScore) {
  const spend = currency.format(proposal.ask);
  if (decision === 'KILL') {
    return `${proposal.company} has real pain, but the current ${spend} request fails the governed-autonomy threshold. Kill or restart as read-only discovery.`;
  }
  if (decision === 'RE-SCOPE') {
    return `${proposal.company} should not receive the full ${spend} request yet. Re-scope to a smaller governed pilot until payback is under 120 days and evidence quality improves.`;
  }
  return `${proposal.company} clears the Agent IC bar: ${paybackDays}-day payback, ${roiMultiple}x 90-day ROI, and ${Math.round(governanceScore)}/100 governance score under a bounded Hermes/Nemotron operating envelope.`;
}

function buildAuditTrail(proposal, decision, budget, paybackDays, roiMultiple) {
  return [
    {
      actor: 'Hermes intake skill',
      action: 'normalized proposal into IC schema',
      detail: `${proposal.company} / ${proposal.title}`,
      ts: '2026-06-16T09:00:00.000Z',
    },
    {
      actor: 'Nemotron evaluator',
      action: 'scored viability, evidence, and governance',
      detail: `${decision} recommendation; payback ${paybackDays} days; 90-day ROI ${roiMultiple}x`,
      ts: '2026-06-16T09:00:07.000Z',
    },
    {
      actor: 'Agent IC budgeter',
      action: 'scoped budget lines and autonomous spend cap',
      detail: `recommended pilot budget ${currency.format(budget)}`,
      ts: '2026-06-16T09:00:11.000Z',
    },
    {
      actor: 'NemoClaw/OpenShell governor',
      action: 'attached policy envelope and kill criteria',
      detail: `${governancePolicy.invariants.length} invariants, ${governancePolicy.killCriteria.length} kill criteria`,
      ts: '2026-06-16T09:00:15.000Z',
    },
  ];
}

function buildNextActions(decision, proposal, cap) {
  if (decision === 'KILL') {
    return [
      'Freeze budget; preserve audit packet',
      'Run read-only discovery skill for 5 business days',
      'Return to IC only with lower compliance risk and sponsor-owned evidence plan',
    ];
  }

  if (decision === 'RE-SCOPE') {
    return [
      `Cut initial Stripe authorization to ${currency.format(Math.max(25000, cap))}`,
      'Run shadow mode and prove evidence grade B+ before tool writes',
      'Keep customer-facing actions draft-only',
    ];
  }

  return [
    `Create Stripe Checkout Session for governed pilot authorization capped at ${currency.format(cap)}`,
    'Spawn Hermes workstream skills: data connector, shadow evaluator, evidence collector',
    'Review week-4 ROI and kill automatically if evidence grade < B',
  ];
}

function buildSpendEnvelope(proposal, envelopeCap) {
  const mp = proposal.microPilot || {};
  return {
    mission: mp.mission || proposal.title,
    cap: envelopeCap,
    currency: 'USD',
    durationHours: mp.durationHours || 72,
    successMetric: mp.successMetric || 'Prove ROI before unlocking more capital',
    allowedTools: mp.allowedTools || [],
    blockedTool: mp.blockedTool || null,
  };
}

function buildBlockedAction(proposal, spendEnvelope) {
  if (!spendEnvelope.blockedTool) return null;
  return {
    actor: 'SaaS provisioning agent',
    action: 'DENIED',
    proposalId: proposal.id,
    detail: `Attempted to use ${spendEnvelope.blockedTool.name} (${spendEnvelope.blockedTool.category}) — ${spendEnvelope.blockedTool.reason}`,
    kind: 'blocked',
    policyBreach: 'tool_scope_violation',
    attemptedTool: spendEnvelope.blockedTool.name,
    attemptedAmount: spendEnvelope.cap * 1.5,
    cap: spendEnvelope.cap,
    stripeResult: 'No session created — blocked before network call',
  };
}

function buildEvidenceReceipts(proposal, spendEnvelope) {
  const baseCases = proposal.baseline?.monthlyCases || 100;
  const deflection = proposal.target?.deflectionRate || 0.5;
  const savedMinutes = proposal.target?.minutesSavedPerCase || 10;
  const hourlyCost = proposal.baseline?.loadedHourlyCost || 75;
  const pilotCases = 100;
  const autoTriaged = Math.round(pilotCases * deflection * 0.85);
  const hoursSaved = Math.round((autoTriaged * savedMinutes) / 60);
  const grossValue = Math.round(hoursSaved * hourlyCost);
  // Run-level spend is deterministic from the fixture, not a direct fraction of the cap.
  const costPerCase = 0.35;
  const spend = Math.round(pilotCases * costPerCase);
  const qaAgreement = Math.round(60 + proposal.dataReadiness * 0.2 + proposal.automationLeverage * 0.15);
  const criticalIncidents = proposal.complianceRisk > 70 || proposal.integrationRisk > 70 ? 1 : 0;

  return [
    { metric: 'cases_processed', value: pilotCases, unit: 'cases', source: 'operational mini-run' },
    { metric: 'auto_triaged', value: autoTriaged, unit: 'cases', source: 'operational mini-run' },
    { metric: 'hours_saved', value: hoursSaved, unit: 'hours', source: 'time-study estimate' },
    { metric: 'gross_value', value: grossValue, unit: 'USD', source: 'loaded labor cost' },
    { metric: 'spend_consumed', value: spend, unit: 'USD', source: 'Stripe envelope ledger' },
    { metric: 'net_value', value: grossValue - spend, unit: 'USD', source: 'Agent IC ledger' },
    { metric: 'qa_agreement', value: qaAgreement, unit: '%', source: 'deterministic quality audit' },
    { metric: 'critical_incidents', value: criticalIncidents, unit: 'incidents', source: 'policy invariant monitor' },
  ];
}

export function scoreMicroPilot(proposal, overrides = {}) {
  const evaluation = scoreProposal(proposal, overrides);
  const receipts = evaluation.evidenceReceipts.map((r) => {
    if (r.metric === 'qa_agreement' && Number.isFinite(overrides.qaAgreement)) {
      return { ...r, value: Math.round(overrides.qaAgreement) };
    }
    return r;
  });
  const byMetric = Object.fromEntries(receipts.map((r) => [r.metric, r.value]));
  const qaThreshold = 85;
  const envelopeCap = overrides.envelopeCap ?? evaluation.spendEnvelope.cap;
  const spendConsumed = byMetric.spend_consumed ?? 0;
  const qaAgreement = byMetric.qa_agreement ?? 0;
  const criticalIncidents = byMetric.critical_incidents ?? 0;
  const netValue = byMetric.net_value ?? 0;

  const overCap = spendConsumed > envelopeCap;
  const qaPass = qaAgreement >= qaThreshold;

  let decision = 'CONTINUE';
  if (overCap) decision = 'REVISE';
  else if (!qaPass || criticalIncidents > 0) decision = 'KILL';

  return {
    ...evaluation,
    evidenceReceipts: receipts,
    microPilot: {
      decision,
      qaThreshold,
      envelopeCap,
      qaAgreement,
      spendConsumed,
      netValue,
      criticalIncidents,
      overCap,
      qaPass,
      nextCap: decision === 'CONTINUE' ? Math.round(envelopeCap * 2.5) : envelopeCap,
      autonomy: decision === 'CONTINUE' ? 'draft-only' : 'shadow-mode',
      receipts,
    },
  };
}

export function updateDecisionWithEvidence(evaluation, evidenceIndex) {
  const timeline = evaluation.evidenceTimeline.slice(0, evidenceIndex + 1);
  const latest = timeline[timeline.length - 1] || evaluation.evidenceTimeline[0];
  const cumulativeImpact = timeline.reduce((sum, item) => sum + (item.cumulativeImpact || 0), 0);
  const spendConsumed = Math.round(evaluation.recommendedBudget * Math.min(1, latest.week / 8) * 0.82);
  const net = cumulativeImpact - spendConsumed;
  const gradeRank = ['C', 'B-', 'B', 'B+', 'A-', 'A'];
  const gradePass = gradeRank.indexOf(latest.grade) >= gradeRank.indexOf('B+');
  const decision =
    latest.week >= 4 && !gradePass
      ? 'KILL'
      : net < -evaluation.recommendedBudget * 0.45 && latest.week >= 6
        ? 'KILL'
        : latest.week >= 4
          ? 'CONTINUE'
          : 'OBSERVE';

  return {
    latest,
    cumulativeImpact,
    spendConsumed,
    net,
    decision,
    summary:
      decision === 'CONTINUE'
        ? `Continue: evidence grade ${latest.grade}, net observed value ${currency.format(net)}, no kill criteria tripped.`
        : decision === 'KILL'
          ? `Kill: evidence grade ${latest.grade} or net value ${currency.format(net)} breached the IC gate.`
          : `Observe: ${latest.label} is not enough evidence for a spend-up decision yet.`,
  };
}
