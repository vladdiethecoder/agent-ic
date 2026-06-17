'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { seededProposals, judgeRubric } from '../lib/demoData.js';
import { useAuditStream } from '../hooks/useAuditStream.js';
import './run-console-v12.css';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat('en-US');

const STAGES = [
  { id: 'problem', label: 'Problem', terminal: false },
  { id: 'proposal', label: 'Proposal', terminal: true },
  { id: 'evaluate', label: 'Evaluate', terminal: false },
  { id: 'fund', label: 'Fund', terminal: true },
  { id: 'govern', label: 'Govern', terminal: true },
  { id: 'decide', label: 'Decide', terminal: false },
];

// Event-driven stage mapping for recording mode. When the first audit event of a
// given kind arrives, the run console advances to the matching stage so the
// footage is synchronized to real backend execution instead of fixed timeouts.
const STAGE_BY_AUDIT_KIND = {
  evaluation: 'evaluate',
  stripe: 'fund',
  blocked: 'govern',
  hermes: 'proposal',
  governance: 'proposal',
};

const STAGE_BY_AUDIT_ACTION = {
  'decision_issued': 'decide',
  'evidence_imported': 'govern',
};

// Fallback timing only used if no audit events arrive (e.g., offline demo).
// Problem (0s) -> Proposal/Onboard (8s) -> Evaluate (14s) -> Fund (20s) -> Govern (28s) -> Decide (38s)
const RECORDING_STAGE_DELAYS = [0, 8000, 14000, 20000, 28000, 38000];

function idSeq(id) {
  const match = String(id || '').match(/AUD-(\d+)/);
  return match ? Number(match[1]) : 0;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function computeDisplayMetrics(proposal) {
  const baseline = proposal.baseline || {};
  const target = proposal.target || {};

  const monthlyLaborSavings =
    (baseline.monthlyCases || 0) *
    (target.deflectionRate || 0) *
    ((target.minutesSavedPerCase || 0) / 60) *
    (baseline.loadedHourlyCost || 0);
  const monthlyLeakageSavings = (baseline.refundLeakageMonthly || 0) * (target.leakageReduction || 0);
  const monthlyChurnProtection =
    (baseline.churnRiskMonthly || 0) * Math.min(0.24, (target.deflectionRate || 0) * 0.32);
  const monthlyGrossBenefit = monthlyLaborSavings + monthlyLeakageSavings + monthlyChurnProtection;

  const recommendedBudget = Math.round(
    Math.min(
      proposal.ask || 0,
      Math.max(65000, monthlyGrossBenefit * 1.1 + (proposal.durationWeeks || 0) * 5200)
    ) / 1000
  ) * 1000;

  const paybackDays = Math.max(21, Math.round((recommendedBudget / Math.max(monthlyGrossBenefit, 1)) * 30));
  const roiMultiple = round((monthlyGrossBenefit * 3) / recommendedBudget, 2);
  const governanceScore = clamp(
    100 - (proposal.complianceRisk || 0) * 0.42 - (proposal.integrationRisk || 0) * 0.28 + (proposal.dataReadiness || 0) * 0.18
  );
  const autonomousSpendCap = Math.round(recommendedBudget * (governanceScore > 80 ? 0.19 : 0.08) / 1000) * 1000;

  // v12 fix: next cap is computed from the autonomous spend cap ladder, not the micro-pilot envelope.
  const nextCap = Math.round(autonomousSpendCap * 2.5);

  return {
    recommendedBudget,
    paybackDays,
    roiMultiple,
    governanceScore,
    autonomousSpendCap,
    nextCap,
    monthlyGrossBenefit: Math.round(monthlyGrossBenefit),
  };
}

export default function AgentICRunConsoleV12({ recording = false }) {
  const [proposal] = useState(() =>
    seededProposals.find((p) => p.id === 'atlas-freight-rma-copilot') || seededProposals[0]
  );
  const [computedMetrics] = useState(() => computeDisplayMetrics(proposal));
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentStage, setCurrentStage] = useState('problem');
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [hasAutoRun, setHasAutoRun] = useState(false);
  const [savedPlaybook, setSavedPlaybook] = useState(false);
  const stageTimersRef = useRef([]);
  const latestAuditIdRef = useRef(null);

  const { audit: liveAudit, connected } = useAuditStream({
    sinceId: payload?.auditRows?.[0]?.id,
    runId: payload?.runId,
  });

  const displayAudit = useMemo(() => {
    const map = new Map();
    for (const row of payload?.auditRows || []) map.set(row.id, row);
    for (const row of liveAudit) map.set(row.id, row);
    return [...map.values()].sort((a, b) => idSeq(b.id) - idSeq(a.id));
  }, [liveAudit, payload]);

  const metrics = useMemo(() => computedMetrics, [computedMetrics]);

  const clearStageTimers = useCallback(() => {
    stageTimersRef.current.forEach(clearTimeout);
    stageTimersRef.current = [];
  }, []);

  const runExperiment = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSavedPlaybook(false);
    try {
      const response = await fetch('/api/run-capital-experiment-v8', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
      setPayload(data);
      if (!recording) {
        setCurrentStage('decide');
        setTerminalOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [proposal.id, recording]);

  const runExperimentRef = useRef(runExperiment);
  runExperimentRef.current = runExperiment;

  // Persist the Hermes playbook to disk once a successful payload arrives.
  useEffect(() => {
    if (!payload?.hermesPlaybook || savedPlaybook) return;
    fetch('/api/save-playbook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        playbook: payload.hermesPlaybook,
        proposalId: proposal.id,
        version: 'v1',
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok) setSavedPlaybook(true);
      })
      .catch(() => {
        // Non-fatal: the run is still valid if playbook persistence fails.
      });
  }, [payload, proposal.id, savedPlaybook]);

  // Recording-mode stage advancement: event-driven from live audit stream.
  useEffect(() => {
    if (!recording) return;
    clearStageTimers();
    setCurrentStage('problem');
    setTerminalOpen(false);

    // Fallback timers ensure the demo still progresses if events are slow/absent.
    RECORDING_STAGE_DELAYS.forEach((delay, index) => {
      const timer = setTimeout(() => {
        const stage = STAGES[index];
        if (stage) {
          setCurrentStage(stage.id);
          setTerminalOpen(stage.terminal);
        }
      }, delay);
      stageTimersRef.current.push(timer);
    });
    return () => clearStageTimers();
  }, [recording, clearStageTimers]);

  // Advance stages as real audit events arrive during recording.
  useEffect(() => {
    if (!recording || !displayAudit.length) return;
    const latest = displayAudit[0];
    if (!latest || latest.id === latestAuditIdRef.current) return;
    latestAuditIdRef.current = latest.id;

    const nextStage = STAGE_BY_AUDIT_ACTION[latest.action] || STAGE_BY_AUDIT_KIND[latest.kind];
    if (nextStage) {
      setCurrentStage(nextStage);
      const stage = STAGES.find((s) => s.id === nextStage);
      setTerminalOpen(Boolean(stage?.terminal));
    }
  }, [displayAudit, recording]);

  // Auto-start experiment in recording mode.
  useEffect(() => {
    if (recording && !hasAutoRun) {
      setHasAutoRun(true);
      runExperimentRef.current();
    }
  }, [recording, hasAutoRun]);

  function selectStage(id) {
    const stage = STAGES.find((s) => s.id === id);
    setCurrentStage(id);
    setTerminalOpen(Boolean(stage?.terminal));
  }

  function toggleTerminal() {
    setTerminalOpen((open) => !open);
  }

  const verdict = payload?.decision?.verdict || 'CONTINUE';
  const providerReceipts = payload?.providerReceipts || {};
  const liveError = payload?.liveError || '';

  return (
    <main className="run-console-v12" data-recording={recording ? '1' : '0'}>
      <header className="v12-header">
        <div className="v12-brand" data-cursor-target="brand">
          <span className="v12-orb">IC</span>
          <div>
            <strong>Agent IC</strong>
            <small>v12 — governed capital account</small>
          </div>
        </div>
        <ProviderStatusStrip receipts={providerReceipts} liveError={liveError} connected={connected} />
        <div className="v12-header-actions">
          <button
            className="v12-cta"
            onClick={runExperiment}
            disabled={loading}
            data-testid="run-capital-experiment"
            data-cursor-target="run-experiment"
          >
            {loading ? 'Running…' : 'Run capital experiment'}
          </button>
          <button
            className="v12-terminal-toggle"
            onClick={toggleTerminal}
            aria-pressed={terminalOpen}
            title="Toggle CLI proof drawer"
            data-testid="toggle-terminal"
            data-cursor-target="toggle-terminal"
          >
            {terminalOpen ? 'Hide terminal' : 'Show terminal'}
          </button>
        </div>
      </header>

      <StageNav active={currentStage} onSelect={selectStage} />

      {error && <div className="v12-error">{error}</div>}

      <section className="v12-panels">
        <StagePanel
          stage={currentStage}
          proposal={proposal}
          payload={payload}
          metrics={metrics}
          verdict={verdict}
          displayAudit={displayAudit}
          loading={loading}
          runExperiment={runExperiment}
        />
      </section>

      <TerminalDrawer open={terminalOpen} stage={currentStage} audit={displayAudit} />
      <LiveActivityTicker audit={displayAudit} connected={connected} />
    </main>
  );
}

function StageNav({ active, onSelect }) {
  const activeIndex = STAGES.findIndex((s) => s.id === active);
  return (
    <nav className="v12-stage-nav" aria-label="Experiment stages" data-testid="stage-nav" data-cursor-target="stage-nav">
      {STAGES.map((stage, index) => {
        const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
        return (
          <button
            key={stage.id}
            className={`v12-stage-pill ${state}`}
            onClick={() => onSelect(stage.id)}
            aria-current={state === 'active' ? 'step' : undefined}
            data-testid={`stage-${stage.id}`}
            data-cursor-target={`stage-${stage.id}`}
          >
            <span>{index + 1}</span>
            {stage.label}
          </button>
        );
      })}
    </nav>
  );
}

function StagePanel({ stage, proposal, payload, metrics, verdict, displayAudit, loading, runExperiment }) {
  switch (stage) {
    case 'problem':
      return <ProblemStage proposal={proposal} />;
    case 'proposal':
      return <ProposalStage proposal={proposal} payload={payload} />;
    case 'evaluate':
      return <EvaluateStage proposal={proposal} payload={payload} metrics={metrics} verdict={verdict} />;
    case 'fund':
      return <FundStage payload={payload} metrics={metrics} />;
    case 'govern':
      return <GovernStage proposal={proposal} payload={payload} metrics={metrics} displayAudit={displayAudit} />;
    case 'decide':
      return <DecideStage payload={payload} metrics={metrics} verdict={verdict} loading={loading} runExperiment={runExperiment} />;
    default:
      return null;
  }
}

function ProblemStage({ proposal }) {
  return (
    <div className="v12-panel v12-panel-problem">
      <div className="v12-panel-hero">
        <span className="v12-eyebrow">Enterprise problem</span>
        <h1>Agents can now spend money. Most pilots can&apos;t prove they earned it.</h1>
        <p>
          {proposal.company} handles {number.format(proposal.baseline?.monthlyCases || 0)} late-freight
          exception claims a month with a {proposal.baseline?.manualMinutesPerCase}-minute manual process.
          Refund leakage and churn risk pile up before finance can weigh in.
        </p>
      </div>
      <div className="v12-rubric">
        {judgeRubric.map((item) => (
          <article key={item.label} className="v12-rubric-card">
            <span>{item.label}</span>
            <p>{item.copy}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProposalStage({ proposal, payload }) {
  return (
    <div className="v12-panel v12-panel-proposal">
      <div className="v12-panel-header">
        <span className="v12-eyebrow">Proposal intake</span>
        <h2>{proposal.title}</h2>
        <p>{proposal.proposal}</p>
      </div>
      <div className="v12-metric-row">
        <MetricBadge label="Ask" value={money.format(proposal.ask)} tone="neutral" />
        <MetricBadge label="Duration" value={`${proposal.durationWeeks} weeks`} tone="neutral" />
        <MetricBadge label="Sponsor" value={proposal.sponsor} tone="neutral" />
        <MetricBadge label="Category" value={proposal.category} tone="neutral" />
      </div>
      <div className="v12-proposal-detail">
        <div className="v12-detail-card">
          <strong>Micro-pilot mission</strong>
          <p>{proposal.microPilot?.mission}</p>
          <div className="v12-detail-meta">
            <span>{proposal.microPilot?.durationHours} hours</span>
            <span>{proposal.microPilot?.successMetric}</span>
          </div>
        </div>
        <div className="v12-detail-card">
          <strong>Allowed tools</strong>
          <div className="v12-tool-pills">
            {(proposal.microPilot?.allowedTools || []).map((tool) => (
              <span key={tool}>{tool}</span>
            ))}
          </div>
        </div>
        <div className="v12-detail-card">
          <strong>Hermes gateway status</strong>
          <p>
            {payload?.providerReceipts?.hermes?.state === 'live'
              ? 'Task dispatched to live Hermes gateway.'
              : 'Normalized into IC schema and saved as a reusable playbook.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function EvaluateStage({ proposal, payload, metrics, verdict }) {
  const scores = payload?.nemotron || {};
  return (
    <div className="v12-panel v12-panel-evaluate">
      <div className="v12-panel-header">
        <span className="v12-eyebrow">Nemotron evaluation</span>
        <h2>Does the pilot clear the IC bar?</h2>
        <p>
          {proposal.company} scores {metrics.governanceScore}/100 on governance and shows a{' '}
          {metrics.paybackDays}-day payback with {metrics.roiMultiple}x 90-day ROI.
        </p>
      </div>
      <div className="v12-metric-row">
        <MetricBadge label="Pilot budget" value={money.format(metrics.recommendedBudget)} tone="budget" dataTarget="metric-budget" />
        <MetricBadge label="Autonomous cap" value={money.format(metrics.autonomousSpendCap)} tone="cap" dataTarget="metric-cap" />
        <MetricBadge label="Payback" value={`${metrics.paybackDays} days`} tone="payback" />
        <MetricBadge label="90-day ROI" value={`${metrics.roiMultiple}x`} tone="roi" />
        <MetricBadge label="Risk score" value={`${metrics.governanceScore}/100`} tone="risk" />
      </div>
      <div className="v12-eval-detail">
        <div className="v12-detail-card">
          <strong>Evaluator</strong>
          <span className={`v12-status-pill ${scores.state || 'fallback'}`}>
            {scores.badge || 'Deterministic fallback'}
          </span>
          <p className="v12-small">{scores.model || 'nvidia/nemotron-3-super-120b-a12b'}</p>
        </div>
        <div className="v12-detail-card">
          <strong>Decision</strong>
          <div className={`v12-verdict ${verdictClass(verdict)}`} data-cursor-target="verdict">
            {verdict}
          </div>
        </div>
        <div className="v12-detail-card">
          <strong>Monthly gross benefit</strong>
          <p className="v12-big">{money.format(metrics.monthlyGrossBenefit)}</p>
          <p className="v12-small">Labor savings + leakage reduction + churn protection</p>
        </div>
      </div>
    </div>
  );
}

function FundStage({ payload, metrics }) {
  const stripe = payload?.stripe || {};
  const mode = stripe.mode || 'demo';
  return (
    <div className="v12-panel v12-panel-fund">
      <div className="v12-panel-header">
        <span className="v12-eyebrow">Stripe authorization</span>
        <h2>Bounded spend envelope created</h2>
        <p>
          A Checkout Session caps autonomous spend below the pilot budget. The agent can buy SaaS and 402
          APIs, but only inside the pre-authorized envelope.
        </p>
      </div>
      <div className="v12-metric-row">
        <MetricBadge label="Authorized cap" value={money.format(metrics.autonomousSpendCap)} tone="cap" dataTarget="metric-authorized-cap" />
        <MetricBadge label="Session mode" value={mode} tone={mode === 'live' ? 'live' : 'demo'} />
        <MetricBadge label="Renewal" value="blocked" tone="blocked" />
        <MetricBadge label="Recursion" value="denied" tone="blocked" />
      </div>
      <div className="v12-stripe-card" data-testid="stripe-card" data-cursor-target="stripe-card">
        <div className="v12-stripe-row">
          <span>Session ID</span>
          <code>{stripe.sessionId || 'cs_test_agent_ic_atlas-freight-rma-copilot_demo'}</code>
        </div>
        <div className="v12-stripe-row">
          <span>Client reference</span>
          <code>{stripe.clientReferenceId || 'atlas-freight-rma-copilot'}</code>
        </div>
        <div className="v12-stripe-row">
          <span>Amount</span>
          <strong>{money.format(Number.isFinite(stripe.amountCents) ? stripe.amountCents / 100 : metrics.autonomousSpendCap)}</strong>
        </div>
        <div className="v12-stripe-row">
          <span>Metadata</span>
          <code>autonomous_spend_cap_dollars={metrics.autonomousSpendCap}</code>
        </div>
        {stripe.url && (
          <a className="v12-stripe-link" href={stripe.url} target="_blank" rel="noreferrer">
            Open mock Checkout Session →
          </a>
        )}
      </div>
    </div>
  );
}

function GovernStage({ proposal, payload, metrics, displayAudit }) {
  const blocked = payload?.blocked || {};
  const blockedTool = proposal.microPilot?.blockedTool || {};
  return (
    <div className="v12-panel v12-panel-govern">
      <div className="v12-panel-header">
        <span className="v12-eyebrow">Govern + measure</span>
        <h2>Kill criteria, evidence gates, and policy blocks</h2>
        <p>
          The agent runs inside a NemoClaw/OpenShell envelope. Out-of-policy tool calls fail closed before
          any Stripe spend is authorized.
        </p>
      </div>
      <div className="v12-govern-grid">
        <div className="v12-govern-card v12-govern-blocked" data-testid="blocked-card" data-cursor-target="blocked-card">
          <strong>Blocked action — {blocked.policyBreach || 'tool_scope_violation'}</strong>
          <p>{blocked.detail || blockedTool.reason || 'Out-of-policy tool request denied.'}</p>
          <div className="v12-blocked-chips">
            <span>tool={blocked.attemptedTool || blockedTool.name || 'Premium market-rate lookup API'}</span>
            <span>amount={money.format(blocked.attemptedAmount || metrics.autonomousSpendCap * 1.5 || 0)}</span>
            <span>cap={money.format(blocked.cap || metrics.autonomousSpendCap || 0)}</span>
          </div>
        </div>
        <div className="v12-govern-card">
          <strong>Kill criteria</strong>
          <ul>
            {proposal.microPilot?.killCriteria?.slice(0, 4).map((criterion, i) => (
              <li key={i}>{criterion}</li>
            ))}
          </ul>
        </div>
        <div className="v12-govern-card">
          <strong>Evidence counters</strong>
          <div className="v12-evidence-grid">
            <MetricBadge label="Cases" value={number.format(payload?.evidence?.casesProcessed || 0)} tone="neutral" />
            <MetricBadge label="Auto-triaged" value={number.format(payload?.evidence?.autoTriaged || 0)} tone="neutral" />
            <MetricBadge label="QA agreement" value={`${payload?.evidence?.qaAgreement ?? 0}%`} tone="neutral" />
            <MetricBadge label="Net value" value={money.format(payload?.evidence?.netValue || 0)} tone="neutral" />
          </div>
        </div>
      </div>
      <div className="v12-audit">
        <strong>Live audit stream {displayAudit.length > 0 ? `· ${displayAudit.length} events` : ''}</strong>
        <AuditList audit={displayAudit} />
      </div>
    </div>
  );
}

function DecideStage({ payload, metrics, verdict, loading, runExperiment }) {
  const decision = payload?.decision || {};
  // v12 fix: next cap always reflects the capital-release ladder from the autonomous spend cap.
  const nextCap = decision.nextCap && decision.nextCap > 1000 ? decision.nextCap : metrics.nextCap;
  return (
    <div className="v12-panel v12-panel-decide">
      <div className="v12-panel-header">
        <span className="v12-eyebrow">Capital decision</span>
        <h2>The pilot earns more capital</h2>
        <p>
          Agent IC issues a {verdict} verdict and saves a reusable Hermes playbook so the same governed
          process can run on the next proposal.
        </p>
      </div>
      <div className="v12-decide-hero">
        <div className={`v12-verdict ${verdictClass(verdict)}`} data-testid="decision-verdict" data-cursor-target="decision-verdict">{verdict}</div>
        <div className="v12-metric-row">
          <MetricBadge label="Next cap" value={money.format(nextCap)} tone="cap" dataTarget="metric-next-cap" />
          <MetricBadge label="Autonomy" value={decision.autonomy || 'draft-only'} tone="neutral" />
          <MetricBadge label="QA threshold" value={`${decision.qaThreshold ?? 85}%`} tone="neutral" />
        </div>
      </div>
      <div className="v12-playbook-card">
        <strong>Saved playbook</strong>
        <code>{payload?.hermesPlaybook?.name || 'bounded-capital-experiment-v1'}</code>
        <p>{payload?.hermesPlaybook?.description || 'Reusable Hermes skill plan for governed capital experiments.'}</p>
      </div>
      <div className="v12-final-ctas">
        <a
          className="v12-cta"
          href="/"
          target="_blank"
          rel="noreferrer"
          data-testid="open-live-demo"
          data-cursor-target="open-live-demo"
        >
          Open live demo
        </a>
        <a
          className="v12-cta-secondary"
          href="https://github.com/agent-ic/agent-ic-hermes-hackathon"
          target="_blank"
          rel="noreferrer"
          data-testid="view-source"
          data-cursor-target="view-source"
        >
          View source
        </a>
        <button
          className="v12-cta-secondary"
          onClick={runExperiment}
          disabled={loading}
          data-testid="run-again"
          data-cursor-target="run-again"
        >
          {loading ? 'Running…' : 'Run again'}
        </button>
      </div>
    </div>
  );
}

function MetricBadge({ label, value, tone = 'neutral', dataTarget }) {
  const target = dataTarget || `metric-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div
      className={`v12-metric-badge ${tone}`}
      data-testid={target}
      data-cursor-target={target}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProviderStatusStrip({ receipts, liveError, connected }) {
  const badges = [
    {
      id: 'provider-hermes',
      label: 'Hermes',
      ...deriveProviderState({
        live: receipts.hermes?.state === 'live' || receipts.hermes?.state === 'task-dispatched',
        fallback: ['playbook-saved', 'fallback', 'demo'].includes(receipts.hermes?.state) || !receipts.hermes?.state,
        error: liveError.toLowerCase().includes('hermes') || receipts.hermes?.state === 'error',
        liveLabel: 'Task dispatched',
        fallbackLabel: 'Playbook saved locally',
      }),
    },
    {
      id: 'provider-nim',
      label: 'NIM / Nemotron',
      ...deriveProviderState({
        live: receipts.nemotron?.state === 'live',
        fallback: receipts.nemotron?.state === 'fallback' || !receipts.nemotron?.state,
        error: liveError.toLowerCase().includes('nim') || liveError.toLowerCase().includes('nemotron') || receipts.nemotron?.state === 'error',
        liveLabel: receipts.nemotron?.model || 'NVIDIA NIM live',
        fallbackLabel: 'Deterministic fallback',
      }),
    },
    {
      id: 'provider-stripe',
      label: 'Stripe',
      ...deriveProviderState({
        live: receipts.stripe?.state === 'live',
        fallback: receipts.stripe?.state === 'demo' || !receipts.stripe?.state,
        error: liveError.toLowerCase().includes('stripe') || receipts.stripe?.state === 'error',
        liveLabel: 'Live Checkout Session',
        fallbackLabel: 'Demo session',
      }),
    },
    {
      id: 'provider-nemoclaw',
      label: 'NemoClaw',
      ...deriveProviderState({
        live: receipts.governance?.state === 'live',
        fallback: ['demo', 'fallback'].includes(receipts.governance?.state) || !receipts.governance?.state,
        error: liveError.toLowerCase().includes('nemoclaw') || liveError.toLowerCase().includes('openshell') || receipts.governance?.state === 'error',
        liveLabel: 'OpenShell live broker',
        fallbackLabel: 'Sandbox replay',
      }),
    },
  ];

  return (
    <div className="v12-provider-strip" role="list" aria-label="Provider status" data-cursor-target="provider-strip">
      {badges.map((b) => (
        <div
          key={b.id}
          className={`v12-provider-badge ${b.mode.toLowerCase()}`}
          data-testid={b.id}
          role="listitem"
          title={`${b.label}: ${b.mode}${b.subtitle ? ` — ${b.subtitle}` : ''}`}
          data-cursor-target={b.id}
        >
          <span className="v12-provider-dot" aria-hidden="true" />
          <div className="v12-provider-body">
            <strong>{b.label}</strong>
            <span>{b.mode}</span>
          </div>
          <small>{b.subtitle}</small>
          {b.id === 'provider-hermes' && (
            <span className={`v12-stream-dot ${connected ? 'connected' : ''}`} title={connected ? 'SSE connected' : 'SSE disconnected'} />
          )}
        </div>
      ))}
    </div>
  );
}

function deriveProviderState({ live, fallback, error, liveLabel, fallbackLabel }) {
  if (error) return { mode: 'ERROR', subtitle: 'Integration error — fallback active' };
  if (live) return { mode: 'LIVE', subtitle: liveLabel };
  return { mode: 'DEMO', subtitle: fallbackLabel };
}

function TerminalDrawer({ open, stage, audit }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (open && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [open, audit]);

  return (
    <aside
      className={`v12-terminal-drawer ${open ? 'open' : ''}`}
      aria-hidden={!open}
      data-testid="terminal-drawer"
      data-cursor-target="terminal-drawer"
    >
      <div className="v12-terminal-header">
        <span />
        <span />
        <span />
        <code>~/.agent-ic/live-agent.log</code>
        <span className="v12-terminal-status">LIVE</span>
      </div>
      <pre className="v12-terminal-body" ref={containerRef}>
        {audit.length === 0
          ? `# Agent IC live execution stream\n# Waiting for backend events...`
          : audit
              .slice()
              .sort((a, b) => idSeq(a.id) - idSeq(b.id))
              .map((row) => formatAuditLogLine(row))
              .join('\n')}
      </pre>
    </aside>
  );
}

function formatAuditLogLine(row) {
  const ts = row.ts ? new Date(row.ts).toISOString().split('T')[1].slice(0, 12) : '00:00:00.000';
  const mode = row.provider_mode ? `[${row.provider_mode}] ` : '';
  return `[${ts}] ${mode}${row.actor}: ${row.action}${row.detail ? ` — ${row.detail}` : ''}`;
}

function LiveActivityTicker({ audit, connected }) {
  const latest = audit[0];
  return (
    <div className="v12-activity-ticker" data-testid="live-activity-ticker">
      <span className={`v12-activity-pulse ${connected ? 'connected' : ''}`} />
      <strong>{connected ? 'LIVE' : 'REPLAY'}</strong>
      <span className="v12-activity-separator" />
      <span className="v12-activity-event">
        {latest ? `${latest.actor}: ${latest.action}` : 'Waiting for agent activity…'}
      </span>
    </div>
  );
}

function AuditList({ audit }) {
  if (!audit || audit.length === 0) {
    return <div className="v12-audit-empty">Waiting for live audit events…</div>;
  }
  return (
    <div className="v12-audit-list">
      {audit.slice(0, 12).map((row) => (
        <div key={row.id} className={`v12-audit-row kind-${row.kind || 'manual'}`}>
          <span>{row.id}</span>
          <div>
            <strong>{row.actor}: {row.action}</strong>
            <small>{row.detail}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function verdictClass(verdict) {
  const v = String(verdict || 'PENDING').toLowerCase();
  if (v === 'continue') return 'continue';
  if (v === 'kill') return 'kill';
  if (v === 're-scope' || v === 'revise') return 'revise';
  return 'pending';
}
