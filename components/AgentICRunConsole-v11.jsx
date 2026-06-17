'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { seededProposals, judgeRubric } from '../lib/demoData.js';
import { useAuditStream } from '../hooks/useAuditStream.js';
import './run-console-v11.css';

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

// Recording stage timing aligned to the v11 2:42 storyboard.
// Problem (0s) -> Proposal/Onboard (20s) -> Evaluate (50s) -> Fund (65s) -> Govern (80s) -> Decide (115s)
const RECORDING_STAGE_DELAYS = [0, 20000, 50000, 65000, 80000, 115000];

const TERMINAL_CONTENT = {
  proposal: `$ NEMOCLAW_AGENT=hermes nemohermes onboard
? Select inference provider: NVIDIA NIM
? Name this sandbox: atlas-freight-rma-copilot
? Network policy: deny-all except allow-listed tool endpoints
✓ Sandbox sandbox-atlas-freight-rma-copilot-live created
✓ Hermes gateway accepted normalized proposal
> Task dispatched: atlas-freight-rma-copilot
> Skill plan: intake-normalize, evidence-collect, slack-approval-room`,
  fund: `$ link-cli auth login
✓ Stripe Link CLI authenticated (test mode)
$ link-cli spend-request create \\
    --amount 35000 \\
    --currency usd \\
    --proposal atlas-freight-rma-copilot \\
    --justification "bounded pilot authorization"
✓ Approved: SR_sim_atlas_freight_rma_copilot
$ mppx probe https://api.agent-ic.example/402-service
< 402 Payment Required
$ mppx pay --request-id req_sim_xxx --max-amount 100
✓ Paid 100 USD from micro-pilot envelope`,
  govern: `$ curl -X POST https://premium-market-api.example.com/v1/lookup \\
    -H "x-proposal-id: atlas-freight-rma-copilot" \\
    -d '{"amount":150,"merchant":"Premium market-rate lookup API"}'
< 403 Forbidden
{
  "error": "tool_scope_violation",
  "reason": "Merchant category outside the approved SaaS list and per-authorization cap exceeded",
  "attempted_amount": 150,
  "envelope_cap": 100,
  "policy": "NemoClaw / OpenShell-style operating envelope"
}`,
};

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

  return {
    recommendedBudget,
    paybackDays,
    roiMultiple,
    governanceScore,
    autonomousSpendCap,
    monthlyGrossBenefit: Math.round(monthlyGrossBenefit),
  };
}

export default function AgentICRunConsoleV11({ recording = false }) {
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
  const stageTimersRef = useRef([]);

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

  // Recording-mode stage advancement.
  useEffect(() => {
    if (!recording) return;
    clearStageTimers();
    setCurrentStage('problem');
    setTerminalOpen(false);
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
    <main className="run-console-v11" data-recording={recording ? '1' : '0'}>
      <header className="v11-header">
        <div className="v11-brand">
          <span className="v11-orb">IC</span>
          <div>
            <strong>Agent IC</strong>
            <small>v11 — governed capital account</small>
          </div>
        </div>
        <ProviderStatusStrip receipts={providerReceipts} liveError={liveError} connected={connected} />
        <div className="v11-header-actions">
          <button
            className="v11-cta"
            onClick={runExperiment}
            disabled={loading}
            data-testid="run-capital-experiment"
          >
            {loading ? 'Running…' : 'Run capital experiment'}
          </button>
          <button
            className="v11-terminal-toggle"
            onClick={toggleTerminal}
            aria-pressed={terminalOpen}
            title="Toggle CLI proof drawer"
          >
            {terminalOpen ? 'Hide terminal' : 'Show terminal'}
          </button>
        </div>
      </header>

      <StageNav active={currentStage} onSelect={selectStage} />

      {error && <div className="v11-error">{error}</div>}

      <section className="v11-panels">
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

      <TerminalDrawer open={terminalOpen} stage={currentStage} />
    </main>
  );
}

function StageNav({ active, onSelect }) {
  const activeIndex = STAGES.findIndex((s) => s.id === active);
  return (
    <nav className="v11-stage-nav" aria-label="Experiment stages">
      {STAGES.map((stage, index) => {
        const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
        return (
          <button
            key={stage.id}
            className={`v11-stage-pill ${state}`}
            onClick={() => onSelect(stage.id)}
            aria-current={state === 'active' ? 'step' : undefined}
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
    <div className="v11-panel v11-panel-problem">
      <div className="v11-panel-hero">
        <span className="v11-eyebrow">Enterprise problem</span>
        <h1>Agents can now spend money. Most pilots can&apos;t prove they earned it.</h1>
        <p>
          {proposal.company} handles {number.format(proposal.baseline?.monthlyCases || 0)} late-freight
          exception claims a month with a {proposal.baseline?.manualMinutesPerCase}-minute manual process.
          Refund leakage and churn risk pile up before finance can weigh in.
        </p>
      </div>
      <div className="v11-rubric">
        {judgeRubric.map((item) => (
          <article key={item.label} className="v11-rubric-card">
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
    <div className="v11-panel v11-panel-proposal">
      <div className="v11-panel-header">
        <span className="v11-eyebrow">Proposal intake</span>
        <h2>{proposal.title}</h2>
        <p>{proposal.proposal}</p>
      </div>
      <div className="v11-metric-row">
        <MetricBadge label="Ask" value={money.format(proposal.ask)} tone="neutral" />
        <MetricBadge label="Duration" value={`${proposal.durationWeeks} weeks`} tone="neutral" />
        <MetricBadge label="Sponsor" value={proposal.sponsor} tone="neutral" />
        <MetricBadge label="Category" value={proposal.category} tone="neutral" />
      </div>
      <div className="v11-proposal-detail">
        <div className="v11-detail-card">
          <strong>Micro-pilot mission</strong>
          <p>{proposal.microPilot?.mission}</p>
          <div className="v11-detail-meta">
            <span>{proposal.microPilot?.durationHours} hours</span>
            <span>{proposal.microPilot?.successMetric}</span>
          </div>
        </div>
        <div className="v11-detail-card">
          <strong>Allowed tools</strong>
          <div className="v11-tool-pills">
            {(proposal.microPilot?.allowedTools || []).map((tool) => (
              <span key={tool}>{tool}</span>
            ))}
          </div>
        </div>
        <div className="v11-detail-card">
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
    <div className="v11-panel v11-panel-evaluate">
      <div className="v11-panel-header">
        <span className="v11-eyebrow">Nemotron evaluation</span>
        <h2>Does the pilot clear the IC bar?</h2>
        <p>
          {proposal.company} scores {metrics.governanceScore}/100 on governance and shows a{' '}
          {metrics.paybackDays}-day payback with {metrics.roiMultiple}x 90-day ROI.
        </p>
      </div>
      <div className="v11-metric-row">
        <MetricBadge label="Pilot budget" value={money.format(metrics.recommendedBudget)} tone="budget" />
        <MetricBadge label="Autonomous cap" value={money.format(metrics.autonomousSpendCap)} tone="cap" />
        <MetricBadge label="Payback" value={`${metrics.paybackDays} days`} tone="payback" />
        <MetricBadge label="90-day ROI" value={`${metrics.roiMultiple}x`} tone="roi" />
        <MetricBadge label="Risk score" value={`${metrics.governanceScore}/100`} tone="risk" />
      </div>
      <div className="v11-eval-detail">
        <div className="v11-detail-card">
          <strong>Evaluator</strong>
          <span className={`v11-status-pill ${scores.state || 'fallback'}`}>
            {scores.badge || 'Deterministic fallback'}
          </span>
          <p className="v11-small">{scores.model || 'nvidia/nemotron-3-super-120b-a12b'}</p>
        </div>
        <div className="v11-detail-card">
          <strong>Decision</strong>
          <div className={`v11-verdict ${verdictClass(verdict)}`}>
            {verdict}
          </div>
        </div>
        <div className="v11-detail-card">
          <strong>Monthly gross benefit</strong>
          <p className="v11-big">{money.format(metrics.monthlyGrossBenefit)}</p>
          <p className="v11-small">Labor savings + leakage reduction + churn protection</p>
        </div>
      </div>
    </div>
  );
}

function FundStage({ payload, metrics }) {
  const stripe = payload?.stripe || {};
  const mode = stripe.mode || 'demo';
  return (
    <div className="v11-panel v11-panel-fund">
      <div className="v11-panel-header">
        <span className="v11-eyebrow">Stripe authorization</span>
        <h2>Bounded spend envelope created</h2>
        <p>
          A Checkout Session caps autonomous spend below the pilot budget. The agent can buy SaaS and 402
          APIs, but only inside the pre-authorized envelope.
        </p>
      </div>
      <div className="v11-metric-row">
        <MetricBadge label="Authorized cap" value={money.format(metrics.autonomousSpendCap)} tone="cap" />
        <MetricBadge label="Session mode" value={mode} tone={mode === 'live' ? 'live' : 'demo'} />
        <MetricBadge label="Renewal" value="blocked" tone="blocked" />
        <MetricBadge label="Recursion" value="denied" tone="blocked" />
      </div>
      <div className="v11-stripe-card">
        <div className="v11-stripe-row">
          <span>Session ID</span>
          <code>{stripe.sessionId || 'cs_test_agent_ic_atlas-freight-rma-copilot_demo'}</code>
        </div>
        <div className="v11-stripe-row">
          <span>Client reference</span>
          <code>{stripe.clientReferenceId || 'atlas-freight-rma-copilot'}</code>
        </div>
        <div className="v11-stripe-row">
          <span>Amount</span>
          <strong>{money.format(Number.isFinite(stripe.amountCents) ? stripe.amountCents / 100 : metrics.autonomousSpendCap)}</strong>
        </div>
        <div className="v11-stripe-row">
          <span>Metadata</span>
          <code>autonomous_spend_cap_dollars={metrics.autonomousSpendCap}</code>
        </div>
        {stripe.url && (
          <a className="v11-stripe-link" href={stripe.url} target="_blank" rel="noreferrer">
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
    <div className="v11-panel v11-panel-govern">
      <div className="v11-panel-header">
        <span className="v11-eyebrow">Govern + measure</span>
        <h2>Kill criteria, evidence gates, and policy blocks</h2>
        <p>
          The agent runs inside a NemoClaw/OpenShell envelope. Out-of-policy tool calls fail closed before
          any Stripe spend is authorized.
        </p>
      </div>
      <div className="v11-govern-grid">
        <div className="v11-govern-card v11-govern-blocked">
          <strong>Blocked action — {blocked.policyBreach || 'tool_scope_violation'}</strong>
          <p>{blocked.detail || blockedTool.reason || 'Out-of-policy tool request denied.'}</p>
          <div className="v11-blocked-chips">
            <span>tool={blocked.attemptedTool || blockedTool.name || 'Premium market-rate lookup API'}</span>
            <span>amount={money.format(blocked.attemptedAmount || metrics.autonomousSpendCap * 1.5 || 0)}</span>
            <span>cap={money.format(blocked.cap || metrics.autonomousSpendCap || 0)}</span>
          </div>
        </div>
        <div className="v11-govern-card">
          <strong>Kill criteria</strong>
          <ul>
            {proposal.microPilot?.killCriteria?.slice(0, 4).map((criterion, i) => (
              <li key={i}>{criterion}</li>
            ))}
          </ul>
        </div>
        <div className="v11-govern-card">
          <strong>Evidence counters</strong>
          <div className="v11-evidence-grid">
            <MetricBadge label="Cases" value={number.format(payload?.evidence?.casesProcessed || 0)} tone="neutral" />
            <MetricBadge label="Auto-triaged" value={number.format(payload?.evidence?.autoTriaged || 0)} tone="neutral" />
            <MetricBadge label="QA agreement" value={`${payload?.evidence?.qaAgreement ?? 0}%`} tone="neutral" />
            <MetricBadge label="Net value" value={money.format(payload?.evidence?.netValue || 0)} tone="neutral" />
          </div>
        </div>
      </div>
      <div className="v11-audit">
        <strong>Live audit stream {displayAudit.length > 0 ? `· ${displayAudit.length} events` : ''}</strong>
        <AuditList audit={displayAudit} />
      </div>
    </div>
  );
}

function DecideStage({ payload, metrics, verdict, loading, runExperiment }) {
  const decision = payload?.decision || {};
  return (
    <div className="v11-panel v11-panel-decide">
      <div className="v11-panel-header">
        <span className="v11-eyebrow">Capital decision</span>
        <h2>The pilot earns more capital</h2>
        <p>
          Agent IC issues a {verdict} verdict and saves a reusable Hermes playbook so the same governed
          process can run on the next proposal.
        </p>
      </div>
      <div className="v11-decide-hero">
        <div className={`v11-verdict ${verdictClass(verdict)}`}>{verdict}</div>
        <div className="v11-metric-row">
          <MetricBadge label="Next cap" value={money.format(decision.nextCap || metrics.autonomousSpendCap * 2.5)} tone="cap" />
          <MetricBadge label="Autonomy" value={decision.autonomy || 'draft-only'} tone="neutral" />
          <MetricBadge label="QA threshold" value={`${decision.qaThreshold ?? 85}%`} tone="neutral" />
        </div>
      </div>
      <div className="v11-playbook-card">
        <strong>Saved playbook</strong>
        <code>{payload?.hermesPlaybook?.name || 'bounded-capital-experiment-v1'}</code>
        <p>{payload?.hermesPlaybook?.description || 'Reusable Hermes skill plan for governed capital experiments.'}</p>
      </div>
      <div className="v11-final-ctas">
        <a className="v11-cta" href="/" target="_blank" rel="noreferrer">
          Open live demo
        </a>
        <a
          className="v11-cta-secondary"
          href="https://github.com/agent-ic/agent-ic-hermes-hackathon"
          target="_blank"
          rel="noreferrer"
        >
          View source
        </a>
        <button className="v11-cta-secondary" onClick={runExperiment} disabled={loading}>
          {loading ? 'Running…' : 'Run again'}
        </button>
      </div>
    </div>
  );
}

function MetricBadge({ label, value, tone = 'neutral' }) {
  return (
    <div className={`v11-metric-badge ${tone}`}>
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
    <div className="v11-provider-strip" role="list" aria-label="Provider status">
      {badges.map((b) => (
        <div
          key={b.id}
          className={`v11-provider-badge ${b.mode.toLowerCase()}`}
          data-testid={b.id}
          role="listitem"
          title={`${b.label}: ${b.mode}${b.subtitle ? ` — ${b.subtitle}` : ''}`}
        >
          <span className="v11-provider-dot" aria-hidden="true" />
          <div className="v11-provider-body">
            <strong>{b.label}</strong>
            <span>{b.mode}</span>
          </div>
          <small>{b.subtitle}</small>
          {b.id === 'provider-hermes' && (
            <span className={`v11-stream-dot ${connected ? 'connected' : ''}`} title={connected ? 'SSE connected' : 'SSE disconnected'} />
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

function TerminalDrawer({ open, stage }) {
  const content = TERMINAL_CONTENT[stage];
  if (!content) return null;
  return (
    <aside className={`v11-terminal-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="v11-terminal-header">
        <span />
        <span />
        <span />
        <code>~/.agent-ic/terminal-v11.log</code>
        <span className="v11-simulated-badge">SIMULATED</span>
      </div>
      <pre className="v11-terminal-body">{content}</pre>
    </aside>
  );
}

function AuditList({ audit }) {
  if (!audit || audit.length === 0) {
    return <div className="v11-audit-empty">Waiting for live audit events…</div>;
  }
  return (
    <div className="v11-audit-list">
      {audit.slice(0, 12).map((row) => (
        <div key={row.id} className={`v11-audit-row kind-${row.kind || 'manual'}`}>
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
