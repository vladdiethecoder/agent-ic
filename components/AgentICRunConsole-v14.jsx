'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { seededProposals, judgeRubric } from '../lib/demoData.js';
import { useAuditStream } from '../hooks/useAuditStream.js';
import './run-console-v14.css';

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

const STAGE_BY_AUDIT_KIND = {
  evaluation: 'evaluate',
  stripe: 'fund',
  'stripe-error': 'fund',
  blocked: 'govern',
  hermes: 'proposal',
  governance: 'proposal',
  evidence: 'govern',
};

const STAGE_BY_AUDIT_ACTION = {
  decision_issued: 'decide',
  evidence_imported: 'govern',
  hermes_handoff: 'proposal',
  envelope_created: 'evaluate',
};

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

  return {
    recommendedBudget,
    paybackDays,
    roiMultiple,
    governanceScore,
    monthlyGrossBenefit: Math.round(monthlyGrossBenefit),
  };
}

function useLiveTrace(enabled) {
  const [traces, setTraces] = useState([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);
  const reconnectRef = useRef(null);
  const sinceRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let cancelled = false;
    setConnected(false);

    function connect() {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      const url = new URL('/api/live-trace', window.location.origin);
      if (sinceRef.current > 0) {
        url.searchParams.set('since', String(sinceRef.current));
      }

      const es = new EventSource(url.toString());
      esRef.current = es;

      es.onopen = () => {
        if (cancelled) return;
        setConnected(true);
      };

      es.onmessage = (event) => {
        if (cancelled) return;
        try {
          const entry = JSON.parse(event.data);
          setTraces((prev) => {
            if (prev.some((p) => p.ts === entry.ts && p.type === entry.type)) return prev;
            return [...prev, entry];
          });
          if (entry.ts > sinceRef.current) sinceRef.current = entry.ts;
        } catch {
          // ignore malformed trace event
        }
      };

      es.onerror = () => {
        if (cancelled) return;
        setConnected(false);
        es.close();
        esRef.current = null;
        reconnectRef.current = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };
  }, [enabled]);

  return { traces, connected };
}

export default function AgentICRunConsoleV14({ recording = false, noAutoRun = false }) {
  const [proposal] = useState(() =>
    seededProposals.find((p) => p.id === 'atlas-freight-rma-copilot') || seededProposals[0]
  );
  const [computedMetrics] = useState(() => computeDisplayMetrics(proposal));
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentStage, setCurrentStage] = useState('problem');
  const [hasAutoRun, setHasAutoRun] = useState(false);
  const [savedPlaybook, setSavedPlaybook] = useState(false);
  const [playbookContent, setPlaybookContent] = useState('');
  const [playbookError, setPlaybookError] = useState(null);
  const stageTimersRef = useRef([]);
  const latestAuditIdRef = useRef(null);
  const terminalRef = useRef(null);

  const { audit: liveAudit, connected: auditConnected } = useAuditStream({
    sinceId: payload?.auditRows?.[0]?.id,
    runId: payload?.runId,
  });

  const { traces: liveTraces, connected: traceConnected } = useLiveTrace(true);

  const displayAudit = useMemo(() => {
    const map = new Map();
    for (const row of payload?.auditRows || []) map.set(row.id, row);
    for (const row of liveAudit) map.set(row.id, row);
    return [...map.values()].sort((a, b) => idSeq(b.id) - idSeq(a.id));
  }, [liveAudit, payload]);

  const metrics = useMemo(() => {
    return {
      ...computedMetrics,
      recommendedBudget: payload?.metrics?.recommendedBudget ?? computedMetrics.recommendedBudget,
    };
  }, [computedMetrics, payload]);

  const envelopeCap = payload?.envelope?.cap ?? 0;
  const nextCap = payload?.decision?.nextCap ?? 0;
  const blockedAttempt = payload?.blocked?.attemptedAmount ?? 0;
  const blockedCap = payload?.blocked?.cap ?? 0;

  const clearStageTimers = useCallback(() => {
    stageTimersRef.current.forEach(clearTimeout);
    stageTimersRef.current = [];
  }, []);

  const runExperiment = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSavedPlaybook(false);
    setPlaybookContent('');
    setPlaybookError(null);
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [proposal.id, recording]);

  const runExperimentRef = useRef(runExperiment);
  runExperimentRef.current = runExperiment;

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
        if (data?.ok) {
          setSavedPlaybook(true);
          fetch('/api/playbook?version=v1')
            .then((r) => r.json())
            .then((pb) => {
              if (pb?.ok) setPlaybookContent(pb.content);
              else setPlaybookError(pb?.error || 'playbook_unavailable');
            })
            .catch((err) => setPlaybookError(err instanceof Error ? err.message : String(err)));
        }
      })
      .catch(() => {});
  }, [payload, proposal.id, savedPlaybook]);

  useEffect(() => {
    if (!recording) return;
    clearStageTimers();
    setCurrentStage('problem');

    RECORDING_STAGE_DELAYS.forEach((delay, index) => {
      const timer = setTimeout(() => {
        const stage = STAGES[index];
        if (stage) setCurrentStage(stage.id);
      }, delay);
      stageTimersRef.current.push(timer);
    });
    return () => clearStageTimers();
  }, [recording, clearStageTimers]);

  useEffect(() => {
    if (!recording || !displayAudit.length) return;
    // During recording, the fixed stage timers drive the narrative progression.
    // Audit events still populate the sidecar and audit list in real time.
    if (recording) return;
    const latest = displayAudit[0];
    if (!latest || latest.id === latestAuditIdRef.current) return;
    latestAuditIdRef.current = latest.id;

    const nextStage = STAGE_BY_AUDIT_ACTION[latest.action] || STAGE_BY_AUDIT_KIND[latest.kind];
    if (nextStage) {
      setCurrentStage(nextStage);
    }
  }, [displayAudit, recording]);

  useEffect(() => {
    if (recording && !hasAutoRun && !noAutoRun && process.env.NEXT_PUBLIC_AGENT_IC_NO_AUTORUN !== 'true') {
      setHasAutoRun(true);
      runExperimentRef.current();
    }
  }, [recording, hasAutoRun, noAutoRun]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [liveTraces, displayAudit, currentStage]);

  function selectStage(id) {
    setCurrentStage(id);
  }

  const verdict = payload?.decision?.verdict || 'CONTINUE';
  const providerReceipts = payload?.providerReceipts || {};
  const liveError = payload?.liveError || '';
  const showBlockedVignette = currentStage === 'govern' && Boolean(payload?.blocked);

  return (
    <main className="run-console-v14" data-recording={recording ? '1' : '0'}>
      <BlockedVignette active={showBlockedVignette} />
      <header className="v14-header">
        <div className="v14-brand" data-cursor-target="brand">
          <span className="v14-orb">IC</span>
          <div>
            <strong>Agent IC</strong>
            <small>v14 — governed capital account</small>
          </div>
        </div>
        <ProviderStatusStrip receipts={providerReceipts} liveError={liveError} connected={auditConnected} />
        <div className="v14-header-actions">
          <button
            className="v14-cta"
            onClick={runExperiment}
            disabled={loading}
            data-testid="run-capital-experiment"
            data-cursor-target="run-experiment"
          >
            {loading ? 'Running…' : 'Run capital experiment'}
          </button>
        </div>
      </header>

      <StageNav active={currentStage} onSelect={selectStage} />

      {error && <div className="v14-error">{error}</div>}

      <div className="v14-main-split">
        <section className="v14-stage-area">
          <StagePanel
            stage={currentStage}
            proposal={proposal}
            payload={payload}
            metrics={metrics}
            verdict={verdict}
            displayAudit={displayAudit}
            loading={loading}
            runExperiment={runExperiment}
            envelopeCap={envelopeCap}
            nextCap={nextCap}
            blockedAttempt={blockedAttempt}
            blockedCap={blockedCap}
            playbookContent={playbookContent}
            playbookError={playbookError}
          />
        </section>

        <LiveSidecar
          traces={liveTraces}
          audit={displayAudit}
          traceConnected={traceConnected}
          auditConnected={auditConnected}
          terminalRef={terminalRef}
        />
      </div>

      <ToastRail currentStage={currentStage} payload={payload} />
      <LiveActivityTicker audit={displayAudit} connected={auditConnected} traceConnected={traceConnected} />
    </main>
  );
}

function StageNav({ active, onSelect }) {
  const activeIndex = STAGES.findIndex((s) => s.id === active);
  return (
    <nav className="v14-stage-nav" aria-label="Experiment stages" data-testid="stage-nav" data-cursor-target="stage-nav">
      {STAGES.map((stage, index) => {
        const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
        return (
          <button
            key={stage.id}
            className={`v14-stage-pill ${state}`}
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

function StagePanel({
  stage,
  proposal,
  payload,
  metrics,
  verdict,
  displayAudit,
  loading,
  runExperiment,
  envelopeCap,
  nextCap,
  blockedAttempt,
  blockedCap,
  playbookContent,
  playbookError,
}) {
  switch (stage) {
    case 'problem':
      return <ProblemStage proposal={proposal} />;
    case 'proposal':
      return <ProposalStage proposal={proposal} payload={payload} />;
    case 'evaluate':
      return (
        <EvaluateStage
          proposal={proposal}
          payload={payload}
          metrics={metrics}
          verdict={verdict}
          envelopeCap={envelopeCap}
        />
      );
    case 'fund':
      return <FundStage payload={payload} envelopeCap={envelopeCap} />;
    case 'govern':
      return (
        <GovernStage
          proposal={proposal}
          payload={payload}
          metrics={metrics}
          displayAudit={displayAudit}
          blockedAttempt={blockedAttempt}
          blockedCap={blockedCap}
        />
      );
    case 'decide':
      return (
        <DecideStage
          payload={payload}
          proposal={proposal}
          metrics={metrics}
          verdict={verdict}
          nextCap={nextCap}
          loading={loading}
          runExperiment={runExperiment}
          playbookContent={playbookContent}
          playbookError={playbookError}
        />
      );
    default:
      return null;
  }
}

function ProblemStage({ proposal }) {
  return (
    <div className="v14-panel v14-panel-problem">
      <div className="v14-panel-hero">
        <span className="v14-eyebrow">Enterprise problem</span>
        <h1>Agents can now spend money. Most pilots can&apos;t prove they earned it.</h1>
        <p>
          {proposal.company} handles {number.format(proposal.baseline?.monthlyCases || 0)} late-freight
          exception claims a month with a {proposal.baseline?.manualMinutesPerCase}-minute manual process.
          Refund leakage and churn risk pile up before finance can weigh in.
        </p>
      </div>
      <div className="v14-rubric">
        {judgeRubric.map((item) => (
          <article key={item.label} className="v14-rubric-card">
            <span>{item.label}</span>
            <p>{item.copy}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProposalStage({ proposal, payload }) {
  const displayAsk = proposal.microPilotAsk ?? proposal.ask;
  return (
    <div className="v14-panel v14-panel-proposal">
      <div className="v14-panel-header">
        <span className="v14-eyebrow">Proposal intake</span>
        <h2>{proposal.title}</h2>
        <p>{proposal.proposal}</p>
      </div>
      <div className="v14-metric-row">
        <MetricBadge label="Ask" value={money.format(displayAsk)} tone="neutral" dataTarget="metric-ask" />
        <MetricBadge label="Duration" value={`${proposal.durationWeeks} weeks`} tone="neutral" />
        <MetricBadge label="Sponsor" value={proposal.sponsor} tone="neutral" />
        <MetricBadge label="Category" value={proposal.category} tone="neutral" />
      </div>
      <p className="v14-ask-footnote">
        Total pilot budget is {money.format(proposal.ask)}; the first autonomous envelope is capped at{' '}
        {money.format(proposal.microPilot?.envelopeDollars || 0)} and gated by evidence.
      </p>
      <div className="v14-proposal-detail">
        <div className="v14-detail-card">
          <strong>Micro-pilot mission</strong>
          <p>{proposal.microPilot?.mission}</p>
          <div className="v14-detail-meta">
            <span>{proposal.microPilot?.durationHours} hours</span>
            <span>{proposal.microPilot?.successMetric}</span>
          </div>
        </div>
        <div className="v14-detail-card">
          <strong>Allowed tools</strong>
          <div className="v14-tool-pills">
            {(proposal.microPilot?.allowedTools || []).map((tool) => (
              <span key={tool}>{tool}</span>
            ))}
          </div>
        </div>
        <div className="v14-detail-card">
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

function AnimatedNumber({ value, formatter = (v) => v, durationMs = 1400 }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef(0);
  const fromRef = useRef(0);
  const toRef = useRef(value);

  useEffect(() => {
    fromRef.current = display;
    toRef.current = value;
    startRef.current = performance.now();
    let raf;
    const tick = (now) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const current = fromRef.current + (toRef.current - fromRef.current) * eased;
      setDisplay(current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <>{formatter(display)}</>;
}

function EvaluateStage({ proposal, payload, metrics, verdict, envelopeCap }) {
  const scores = payload?.nemotron || {};
  return (
    <div className="v14-panel v14-panel-evaluate">
      <div className="v14-panel-header">
        <span className="v14-eyebrow">Nemotron evaluation</span>
        <h2>Does the pilot clear the IC bar?</h2>
        <p>
          {proposal.company} scores {metrics.governanceScore}/100 on governance and shows a{' '}
          {metrics.paybackDays}-day payback with {metrics.roiMultiple}x 90-day ROI.
        </p>
      </div>
      <div className="v14-metric-row">
        <MetricBadge label="Pilot budget" value={money.format(metrics.recommendedBudget)} tone="budget" dataTarget="metric-budget" />
        <MetricBadge label="Autonomous cap" value={money.format(envelopeCap)} tone="cap" dataTarget="metric-cap" />
        <MetricBadge label="Payback" value={`${metrics.paybackDays} days`} tone="payback" />
        <MetricBadge label="90-day ROI" value={`${metrics.roiMultiple}x`} tone="roi" />
        <MetricBadge label="Risk score" value={`${metrics.governanceScore}/100`} tone="risk" />
      </div>
      <div className="v14-savings-counter" data-testid="savings-counter">
        <span>Projected monthly gross benefit</span>
        <strong>
          <AnimatedNumber value={metrics.monthlyGrossBenefit} formatter={(v) => money.format(Math.round(v))} />
        </strong>
      </div>
      <div className="v14-eval-detail">
        <div className="v14-detail-card">
          <strong>Evaluator</strong>
          <span className={`v14-status-pill ${scores.state || 'local'}`}>
            {scores.state === 'live' ? 'NVIDIA NIM live' : 'Deterministic'}
          </span>
          <p className="v14-small">{scores.model || 'nvidia/nemotron-3-super-120b-a12b'}</p>
          {scores.state === 'live' && (
            <div className="v14-live-proof">
              <span>request</span>
              <code>{payload?.providerReceipts?.nemotron?.requestId || payload?.nemotron?.requestId || '—'}</code>
              <span>latency</span>
              <code>{scores.latencyMs || payload?.providerReceipts?.nemotron?.latencyMs || '—'}</code>
            </div>
          )}
        </div>
        <div className="v14-detail-card">
          <strong>Decision</strong>
          <div className={`v14-verdict ${verdictClass(verdict)}`} data-cursor-target="verdict">
            {verdict}
          </div>
        </div>
        <div className="v14-detail-card">
          <strong>Monthly gross benefit</strong>
          <p className="v14-big">{money.format(metrics.monthlyGrossBenefit)}</p>
          <p className="v14-small">Labor savings + leakage reduction + churn protection</p>
        </div>
      </div>
    </div>
  );
}

function FundStage({ payload, envelopeCap }) {
  const stripe = payload?.stripe || {};
  const mode = stripe.mode || 'demo';
  return (
    <div className="v14-panel v14-panel-fund">
      <div className="v14-panel-header">
        <span className="v14-eyebrow">Stripe authorization</span>
        <h2>Bounded spend envelope created</h2>
        <p>
          A Checkout Session caps autonomous spend below the pilot budget. The agent can buy SaaS and 402
          APIs, but only inside the pre-authorized envelope.
        </p>
      </div>
      <div className="v14-metric-row">
        <MetricBadge label="Authorized cap" value={money.format(envelopeCap)} tone="cap" dataTarget="metric-authorized-cap" />
        <MetricBadge label="Session mode" value={mode} tone={mode === 'live' ? 'live' : 'demo'} />
        <MetricBadge label="Renewal" value="blocked" tone="guardrail" />
        <MetricBadge label="Recursion" value="denied" tone="guardrail" />
      </div>
      <div className="v14-stripe-card" data-testid="stripe-card" data-cursor-target="stripe-card">
        <div className="v14-stripe-row">
          <span>Session ID</span>
          <code>{stripe.sessionId || 'cs_test_agent_ic_atlas-freight-rma-copilot_demo'}</code>
        </div>
        <div className="v14-stripe-row">
          <span>Client reference</span>
          <code>{stripe.clientReferenceId || 'atlas-freight-rma-copilot'}</code>
        </div>
        <div className="v14-stripe-row">
          <span>Amount</span>
          <strong>{money.format(Number.isFinite(stripe.amountCents) ? stripe.amountCents / 100 : envelopeCap)}</strong>
        </div>
        <div className="v14-stripe-row">
          <span>Metadata</span>
          <code>autonomous_spend_cap_dollars={envelopeCap}</code>
        </div>
        {mode === 'live' && stripe.url && (
          <div className="v14-stripe-live-receipt">
            <span>Live Checkout URL</span>
            <a href={stripe.url} target="_blank" rel="noreferrer">
              {stripe.url}
            </a>
          </div>
        )}
        {stripe.url && (
          <a className="v14-stripe-link" href={stripe.url} target="_blank" rel="noreferrer">
            Open {mode === 'live' ? 'live' : 'mock'} Checkout Session →
          </a>
        )}
      </div>
    </div>
  );
}

function GovernStage({ proposal, payload, displayAudit, blockedAttempt, blockedCap }) {
  const blocked = payload?.blocked || {};
  const blockedTool = proposal.microPilot?.blockedTool || {};
  const [showResponse, setShowResponse] = useState(true);
  const [overlayActive, setOverlayActive] = useState(false);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    setOverlayActive(true);
    const formulaTimer = setTimeout(() => setShowFormula(true), 600);
    return () => {
      clearTimeout(formulaTimer);
      setShowFormula(false);
      setOverlayActive(false);
    };
  }, []);

  const evidence = payload?.evidence || {};
  const failedTickets = Math.max(0, (evidence.casesProcessed || 0) - (evidence.autoTriaged || 0));

  return (
    <div className="v14-panel v14-panel-govern">
      <div className="v14-panel-header">
        <span className="v14-eyebrow">Govern + measure</span>
        <h2>Kill criteria, evidence gates, and policy blocks</h2>
        <p>
          The agent runs inside a NemoClaw/OpenShell envelope. Out-of-policy tool calls fail closed before
          any Stripe spend is authorized.
        </p>
      </div>

      <div className="v14-govern-grid">
        <div className="v14-govern-card v14-govern-blocked" data-testid="blocked-card" data-cursor-target="blocked-card">
          <div className="v14-blocked-header">
            <strong>Blocked action — {blocked.policyBreach || 'tool_scope_violation'}</strong>
            <span className="v14-forbidden-badge">403 FORBIDDEN</span>
          </div>
          <p>{blocked.detail || blockedTool.reason || 'Out-of-policy tool request denied.'}</p>
          <div className="v14-blocked-chips">
            <span>tool={blocked.attemptedTool || blockedTool.name || 'Premium market-rate lookup API'}</span>
            <span>amount={money.format(blockedAttempt || 0)}</span>
            <span>cap={money.format(blockedCap || 0)}</span>
          </div>
        </div>

        <div className="v14-govern-card">
          <strong>Policy invariants</strong>
          <GovernanceChecklist blocked={blocked} blockedTool={blockedTool} />
          {payload?.sandbox?.sandboxId && (
            <div className="v14-sandbox-id">
              <span>sandbox</span>
              <code>{payload.sandbox.sandboxId}</code>
            </div>
          )}
        </div>

        <div className="v14-govern-card">
          <strong>Evidence counters</strong>
          <div className="v14-evidence-grid">
            <MetricBadge label="Cases" value={number.format(evidence.casesProcessed || 0)} tone="neutral" />
            <MetricBadge label="Auto-triaged" value={number.format(evidence.autoTriaged || 0)} tone="neutral" />
            <MetricBadge label="Failed tickets" value={number.format(failedTickets)} tone="guardrail" />
            <MetricBadge label="QA agreement" value={`${evidence.qaAgreement ?? 0}%`} tone="neutral" />
            <MetricBadge label="Net value" value={money.format(evidence.netValue || 0)} tone="neutral" />
          </div>
          <div className={`v14-qa-formula ${showFormula ? 'expanded' : ''}`} data-testid="qa-formula">
            <span>QA formula</span>
            <code>
              qa = round(60 + dataReadiness × 0.20 + automationLeverage × 0.15)
              <br />
              qa = round(60 + {proposal.dataReadiness} × 0.20 + {proposal.automationLeverage} × 0.15) ={' '}
              {evidence.qaAgreement ?? 0}%
            </code>
          </div>
        </div>
      </div>

      <RawInterceptOverlay blocked={blocked} active={overlayActive} />

      <div className="v14-intercept-card v14-intercept-card-collapsed" data-testid="intercept-card" data-cursor-target="intercept-card">
        <div className="v14-intercept-header">
          <strong>Live proxy intercept</strong>
          <span className="v14-forbidden-badge">403 FORBIDDEN</span>
        </div>
        <div className="v14-intercept-body">
          <div className="v14-intercept-section">
            <span>rawRequest</span>
            <pre className="v14-code-block">{JSON.stringify(blocked.rawRequest || {}, null, 2)}</pre>
          </div>
          <div className="v14-intercept-section">
            <button
              className="v14-intercept-toggle"
              onClick={() => setShowResponse((s) => !s)}
              aria-expanded={showResponse}
            >
              rawResponse {showResponse ? '▾' : '▸'}
            </button>
            {showResponse && (
              <pre className="v14-code-block">{JSON.stringify(blocked.rawResponse || {}, null, 2)}</pre>
            )}
          </div>
        </div>
      </div>

      <div className="v14-audit">
        <strong>Live audit stream {displayAudit.length > 0 ? `· ${displayAudit.length} events` : ''}</strong>
        <AuditList audit={displayAudit} />
      </div>
    </div>
  );
}

function RawInterceptOverlay({ blocked, active }) {
  return (
    <div
      className={`v14-raw-overlay ${active ? 'active' : ''}`}
      data-testid="raw-intercept-overlay"
      data-cursor-target="raw-intercept-overlay"
    >
      <div className="v14-raw-overlay-header">
        <strong>Live proxy intercept</strong>
        <span className="v14-forbidden-badge">403 FORBIDDEN</span>
      </div>
      <div className="v14-raw-overlay-body">
        <div className="v14-raw-overlay-col">
          <span>rawRequest</span>
          <pre className="v14-code-block">{JSON.stringify(blocked.rawRequest || {}, null, 2)}</pre>
        </div>
        <div className="v14-raw-overlay-col">
          <span>rawResponse</span>
          <pre className="v14-code-block">{JSON.stringify(blocked.rawResponse || {}, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

function DecideStage({ payload, proposal, metrics, verdict, nextCap, loading, runExperiment, playbookContent, playbookError }) {
  const decision = payload?.decision || {};
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const githubRepoUrl = process.env.NEXT_PUBLIC_GITHUB_REPO_URL || 'https://github.com/agent-ic/agent-ic-hermes-hackathon';
  return (
    <div className="v14-panel v14-panel-decide">
      <div className="v14-panel-header">
        <span className="v14-eyebrow">Capital decision</span>
        <h2>The pilot earns more capital</h2>
        <p>
          Agent IC issues a {verdict} verdict and saves a reusable Hermes playbook so the same governed
          process can run on the next proposal.
        </p>
      </div>
      <div className="v14-decide-hero">
        <div className={`v14-verdict ${verdictClass(verdict)}`} data-testid="decision-verdict" data-cursor-target="decision-verdict">
          {verdict}
        </div>
        <div className="v14-metric-row">
          <MetricBadge label="Next cap" value={money.format(nextCap)} tone="cap" dataTarget="metric-next-cap" />
          <MetricBadge
            label="Autonomy"
            value={autonomyLabel(decision.autonomy)}
            tone="neutral"
            dataTarget="metric-autonomy"
          />
          <MetricBadge label="QA threshold" value={`${formatPercent(decision.qaThreshold, 85)}%`} tone="neutral" />
        </div>
        <p className="v14-autonomy-footnote" data-testid="autonomy-footnote">
          Graduated autonomy: HUMAN-IN-LOOP → AUTO-DRAFT → AUTO-EXECUTE. The agent cannot advance until
          evidence grade, QA agreement, and sponsor sign-off are current.
        </p>
      </div>
      <ROIBarChart metrics={metrics} proposal={proposal} />
      <div className="v14-playbook-card">
        <strong>Saved playbook</strong>
        <code>{payload?.hermesPlaybook?.name || 'bounded-capital-experiment-v1'}</code>
        <p>{payload?.hermesPlaybook?.description || 'Reusable Hermes skill plan for governed capital experiments.'}</p>
      </div>
      <ArtifactShotPanel content={playbookContent} error={playbookError} />

      <div className="v14-final-ctas">
        <a
          className="v14-cta"
          href={appUrl || '/'}
          target="_blank"
          rel="noreferrer"
          data-testid="open-live-demo"
          data-cursor-target="open-live-demo"
        >
          Open live demo
        </a>
        <a
          className="v14-cta-secondary"
          href={githubRepoUrl}
          target="_blank"
          rel="noreferrer"
          data-testid="view-source"
          data-cursor-target="view-source"
        >
          View source
        </a>
        <a
          className="v14-cta-secondary"
          href="/api/playbook?version=v1"
          target="_blank"
          rel="noreferrer"
          data-testid="view-playbook"
          data-cursor-target="view-playbook"
        >
          View playbook
        </a>
        <button
          className="v14-cta-secondary"
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
    <div className={`v14-metric-badge ${tone}`} data-testid={target} data-cursor-target={target}>
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
        demo: receipts.hermes?.state === 'demo',
        error: liveError.toLowerCase().includes('hermes') || receipts.hermes?.state === 'error',
        liveLabel: 'Task dispatched',
        demoLabel: 'Demo gateway',
        localLabel: 'Playbook saved locally',
      }),
    },
    {
      id: 'provider-nim',
      label: 'NIM / Nemotron',
      ...deriveProviderState({
        live: receipts.nemotron?.state === 'live',
        demo: receipts.nemotron?.state === 'demo',
        error: liveError.toLowerCase().includes('nim') || liveError.toLowerCase().includes('nemotron') || receipts.nemotron?.state === 'error',
        liveLabel: receipts.nemotron?.model || 'NVIDIA NIM live',
        demoLabel: 'Demo model',
        localLabel: 'Deterministic evaluator',
      }),
    },
    {
      id: 'provider-stripe',
      label: 'Stripe',
      ...deriveProviderState({
        live: receipts.stripe?.state === 'live',
        demo: receipts.stripe?.state === 'demo',
        error: liveError.toLowerCase().includes('stripe') || receipts.stripe?.state === 'error',
        liveLabel: 'Live Checkout Session',
        demoLabel: 'Demo session',
        localLabel: 'Local session',
      }),
    },
    {
      id: 'provider-nemoclaw',
      label: 'NemoClaw',
      ...deriveProviderState({
        live: receipts.governance?.state === 'live',
        demo: receipts.governance?.state === 'demo',
        error: liveError.toLowerCase().includes('nemoclaw') || liveError.toLowerCase().includes('openshell') || receipts.governance?.state === 'error',
        liveLabel: 'OpenShell live broker',
        demoLabel: 'Demo sandbox',
        localLabel: 'Local sandbox',
      }),
    },
  ];

  return (
    <div className="v14-provider-strip" role="list" aria-label="Provider status" data-cursor-target="provider-strip">
      {badges.map((b) => (
        <div
          key={b.id}
          className={`v14-provider-badge ${b.mode.toLowerCase()}`}
          data-testid={b.id}
          role="listitem"
          title={`${b.label}: ${b.mode}${b.subtitle ? ` — ${b.subtitle}` : ''}`}
          data-cursor-target={b.id}
        >
          <span className="v14-provider-dot" aria-hidden="true" />
          <div className="v14-provider-body">
            <strong>{b.label}</strong>
            <span>{b.mode}</span>
          </div>
          <small>{b.subtitle}</small>
          {b.id === 'provider-hermes' && (
            <span className={`v14-stream-dot ${connected ? 'connected' : ''}`} title={connected ? 'SSE connected' : 'SSE disconnected'} />
          )}
        </div>
      ))}
    </div>
  );
}

function deriveProviderState({ live, demo, error, liveLabel, demoLabel, localLabel }) {
  if (error) return { mode: 'ERROR', subtitle: 'Integration issue' };
  if (live) return { mode: 'LIVE', subtitle: liveLabel };
  if (demo) return { mode: 'DEMO', subtitle: demoLabel };
  return { mode: 'LOCAL', subtitle: localLabel };
}

function LiveSidecar({ traces, audit, traceConnected, auditConnected, terminalRef }) {
  const [tab, setTab] = useState('trace');

  return (
    <aside className="v14-sidecar" aria-label="Live terminal sidecar" data-testid="terminal-sidecar" data-cursor-target="terminal-sidecar">
      <div className="v14-sidecar-header">
        <div className="v14-sidecar-tabs">
          <button className={`v14-terminal-toggle ${tab === 'trace' ? 'active' : ''}`} onClick={() => setTab('trace')}>
            Live trace
            <span className={`v14-sidecar-pulse ${traceConnected ? 'connected' : ''}`} />
          </button>
          <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>
            Audit
            <span className={`v14-sidecar-pulse ${auditConnected ? 'connected' : ''}`} />
          </button>
        </div>
        <code>~/.agent-ic/live-agent.log</code>
      </div>
      <pre className="v14-sidecar-body" ref={terminalRef}>
        {tab === 'trace' ? (
          traces.length === 0 ? (
            `# Agent IC live trace stream\n# Waiting for proxy intercept events...`
          ) : (
            traces.map((t, i) => formatTraceLine(t, i)).join('\n')
          )
        ) : audit.length === 0 ? (
          `# Agent IC audit stream\n# Waiting for backend events...`
        ) : (
          audit
            .slice()
            .sort((a, b) => idSeq(a.id) - idSeq(b.id))
            .map((row) => formatAuditLogLine(row))
            .join('\n')
        )}
      </pre>
    </aside>
  );
}

function formatTraceLine(trace, index) {
  const ts = trace.ts ? new Date(trace.ts).toISOString().split('T')[1].slice(0, 12) : '00:00:00.000';
  const type = trace.type || 'event';
  const body = JSON.stringify(trace.body ?? trace, null, 2);
  return `[${ts}] #${index + 1} ${type.toUpperCase()}\n${body}`;
}

function formatAuditLogLine(row) {
  const ts = row.ts ? new Date(row.ts).toISOString().split('T')[1].slice(0, 12) : '00:00:00.000';
  return `[${ts}] ${row.actor}: ${row.action}${row.detail ? ` — ${row.detail}` : ''}`;
}

function LiveActivityTicker({ audit, connected, traceConnected }) {
  const latest = audit[0];
  const live = connected || traceConnected;
  return (
    <div className="v14-activity-ticker" data-testid="live-activity-ticker">
      <span className={`v14-activity-pulse ${live ? 'connected' : ''}`} />
      <strong>{live ? 'LIVE' : 'REPLAY'}</strong>
      <span className="v14-activity-separator" />
      <span className="v14-activity-event">
        {latest ? `${latest.actor}: ${latest.action}` : 'Waiting for agent activity…'}
      </span>
    </div>
  );
}

function AuditList({ audit }) {
  if (!audit || audit.length === 0) {
    return <div className="v14-audit-empty">Waiting for live audit events…</div>;
  }
  return (
    <div className="v14-audit-list">
      {audit.slice(0, 12).map((row) => (
        <div key={row.id} className={`v14-audit-row kind-${row.kind || 'manual'}`}>
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

function ToastRail({ currentStage, payload }) {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    if (!payload) {
      setToasts([]);
      return;
    }
    const next = [];
    if (currentStage === 'evaluate' && payload.nemotron?.state === 'live') {
      next.push({
        id: 'nim',
        text: `Nemotron live · ${payload.nemotron.latencyMs || '~'} ms · ${payload.nemotron.requestId?.slice(0, 18) || ''}`,
        tone: 'live',
      });
    }
    if (currentStage === 'fund' && payload.stripe) {
      next.push({
        id: 'stripe',
        text: `Stripe ${payload.stripe.mode} · ${money.format((payload.stripe.amountCents || 0) / 100)} cap`,
        tone: payload.stripe.mode === 'live' ? 'live' : 'demo',
      });
    }
    if (currentStage === 'govern' && payload.blocked) {
      next.push({
        id: 'block',
        text: `NemoClaw blocked ${money.format(payload.blocked.attemptedAmount || 0)} · 403 Forbidden`,
        tone: 'block',
      });
    }
    if (currentStage === 'decide') {
      if (payload.decision?.verdict) {
        next.push({
          id: 'verdict',
          text: `${payload.decision.verdict} · next cap ${money.format(payload.decision.nextCap || 0)}`,
          tone: 'live',
        });
      }
      if (payload.hermesPlaybook?.name) {
        next.push({
          id: 'playbook',
          text: `Saved ${payload.hermesPlaybook.name}`,
          tone: 'live',
        });
      }
    }
    setToasts(next);
  }, [currentStage, payload]);

  if (!toasts.length) return null;
  return (
    <div className="v14-toast-rail" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`v14-toast v14-toast-${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function GovernanceChecklist({ blocked, blockedTool }) {
  const items = [
    { label: 'Tool scope enforced per proposal', ok: true },
    { label: 'No autonomous spend above pre-authorized cap', ok: true },
    { label: 'External messages remain draft-only until B+ evidence', ok: true },
    { label: 'Kill switch revokes tokens and freezes skills', ok: true },
    {
      label: blocked?.attemptedTool
        ? `Blocked ${blocked.attemptedTool} — out-of-policy vendor`
        : `Blocked ${blockedTool?.name || 'out-of-policy tool'}`,
      ok: false,
      warn: false,
    },
  ];
  return (
    <ul className="v14-govern-checklist">
      {items.map((item, i) => (
        <li key={i} className={item.ok ? 'ok' : 'blocked'}>
          <span className="v14-check-icon">{item.ok ? '✓' : '✗'}</span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function BlockedVignette({ active }) {
  return (
    <div
      className={`v14-blocked-vignette ${active ? 'active' : ''}`}
      aria-hidden="true"
      data-testid="blocked-vignette"
      data-cursor-target="blocked-vignette"
    >
      <div className="v14-blocked-vignette-frame" />
      <div className="v14-blocked-vignette-pulse" />
      <div className="v14-blocked-vignette-badge">POLICY BLOCK</div>
    </div>
  );
}

function ArtifactShotPanel({ content, error }) {
  if (!content && !error) {
    return (
      <div className="v14-artifact-shot" data-testid="artifact-shot-panel">
        <div className="v14-artifact-header">
          <strong>Generated SKILL.md artifact</strong>
        </div>
        <div className="v14-artifact-body v14-artifact-empty">Saving playbook artifact…</div>
      </div>
    );
  }

  return (
    <div className="v14-artifact-shot" data-testid="artifact-shot-panel" data-cursor-target="artifact-shot-panel">
      <div className="v14-artifact-header">
        <strong>Generated SKILL.md artifact</strong>
        <span className="v14-artifact-filename">bounded-capital-experiment-v1.SKILL.md</span>
      </div>
      <pre className="v14-artifact-body">
        {error ? `# Unable to load playbook artifact\n# ${error}` : content}
      </pre>
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

function autonomyLabel(value) {
  if (!value || value === 'draft-only') return 'HUMAN-IN-LOOP';
  if (value === 'shadow-mode') return 'SHADOW';
  return String(value).toUpperCase().replace(/-/g, ' ');
}

function formatPercent(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return value > 1 ? Math.round(value) : Math.round(value * 100);
}

function ROIBarChart({ metrics, proposal }) {
  const baseline = proposal?.baseline || {};
  const humanCost = Math.max(
    1,
    (baseline.monthlyCases || 0) * (baseline.manualMinutesPerCase || 0) * (baseline.loadedHourlyCost || 0) / 60
  );
  const agentCost = Math.max(1, metrics.recommendedBudget / 12);
  const max = Math.max(humanCost, agentCost);
  const humanPct = Math.round((humanCost / max) * 100);
  const agentPct = Math.round((agentCost / max) * 100);

  return (
    <div className="v14-roi-chart" data-testid="roi-bar-chart" data-cursor-target="roi-bar-chart">
      <strong>Monthly cost comparison</strong>
      <div className="v14-roi-bars">
        <div className="v14-roi-bar-group">
          <span>Human support cost</span>
          <div className="v14-roi-track">
            <div className="v14-roi-bar human" style={{ width: `${humanPct}%` }} />
          </div>
          <em>{money.format(humanCost)}</em>
        </div>
        <div className="v14-roi-bar-group">
          <span>Agent IC cost</span>
          <div className="v14-roi-track">
            <div className="v14-roi-bar agent" style={{ width: `${agentPct}%` }} />
          </div>
          <em>{money.format(agentCost)}</em>
        </div>
      </div>
      <p className="v14-roi-caption">
        Estimated monthly equivalent: human queue cost vs. amortized pilot budget.
      </p>
    </div>
  );
}
