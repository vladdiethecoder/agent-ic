'use client';

import { useEffect, useMemo, useState } from 'react';
import { LiveTimeline } from './LiveTimeline.jsx';
import { useAuditStream } from '../hooks/useAuditStream.js';
import './run-console.css';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat('en-US');

const STAGE_ORDER = ['mission', 'governance', 'envelope', 'timeline', 'blocked', 'evidence', 'decision', 'receipts', 'audit'];
const STAGE_DELAYS = [0, 1200, 2400, 3600, 5400, 7200, 9000, 10800, 12600];

function idSequence(id) {
  const match = String(id || '').match(/AUD-(\d+)/);
  return match ? Number(match[1]) : 0;
}

function mergeAudit(live, initial) {
  const map = new Map();
  for (const row of initial) map.set(row.id, row);
  for (const row of live) map.set(row.id, row);
  return [...map.values()].sort((a, b) => idSequence(b.id) - idSequence(a.id));
}

export default function AgentICRunConsole({ initialPayload = null, recording = false }) {
  const [payload, setPayload] = useState(initialPayload);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [qaAgreement, setQaAgreement] = useState(91);
  const [envelopeCap, setEnvelopeCap] = useState(100);
  const [hasAutoRun, setHasAutoRun] = useState(false);
  const [activeStages, setActiveStages] = useState(new Set());

  const { audit: liveAudit, connected } = useAuditStream({
    sinceId: payload?.auditRows?.[0]?.id,
    runId: payload?.runId,
  });

  const displayAudit = useMemo(
    () => mergeAudit(liveAudit, payload?.auditRows || []),
    [liveAudit, payload]
  );

  useEffect(() => {
    if (payload?.decision) {
      setQaAgreement(payload.decision.qaThreshold ?? 91);
      setEnvelopeCap(payload.decision.envelopeCap ?? payload.envelope?.cap ?? 100);
    }
  }, [payload?.runId]);

  useEffect(() => {
    if (!payload) return;
    setActiveStages(new Set());
    const timers = STAGE_ORDER.map((id, i) =>
      setTimeout(() => {
        setActiveStages((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }, STAGE_DELAYS[i])
    );
    return () => timers.forEach(clearTimeout);
  }, [payload?.runId]);

  useEffect(() => {
    if (recording && !payload && !loading && !hasAutoRun) {
      setHasAutoRun(true);
      runExperiment(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, hasAutoRun]);

  async function runExperiment(useCounterfactual) {
    setLoading(true);
    setError(null);
    try {
      const proposalId = payload?.stripe?.clientReferenceId || 'atlas-freight-rma-copilot';
      const body = { proposalId };
      if (useCounterfactual) {
        body.qaAgreement = qaAgreement;
        body.envelopeCap = envelopeCap;
      }
      const response = await fetch('/api/run-capital-experiment-v8', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function startRun() {
    runExperiment(false);
  }

  function runCounterfactual() {
    runExperiment(true);
  }

  return (
    <main className="run-console-shell">
      <Header
        payload={payload}
        loading={loading}
        qaAgreement={qaAgreement}
        setQaAgreement={setQaAgreement}
        envelopeCap={envelopeCap}
        setEnvelopeCap={setEnvelopeCap}
        onRun={startRun}
        onCounterfactual={runCounterfactual}
        connected={connected}
      />

      {!payload && !loading && (
        <section className="pre-run-state">
          <h1>Operator console</h1>
          <p>Run a governed capital experiment and watch the live audit stream.</p>
          <div style={{ marginTop: 24 }}>
            <button className="run-button" onClick={startRun} disabled={loading} data-testid="run-capital-experiment">
              {loading ? 'Running…' : 'Run capital experiment'}
            </button>
          </div>
        </section>
      )}

      {(payload || loading) && (
        <>
          {error && <div className="cockpit-error">{error}</div>}
          {payload && (
            <RunConsoleBody
              payload={payload}
              displayAudit={displayAudit}
              activeStages={activeStages}
            />
          )}
        </>
      )}
    </main>
  );
}

function Header({ payload, loading, qaAgreement, setQaAgreement, envelopeCap, setEnvelopeCap, onRun, onCounterfactual, connected }) {
  return (
    <header className="run-console-header">
      <div className="brand-mark">
        <span className="brand-orb">IC</span>
        <div>
          <strong>Agent IC</strong>
          <small>Run console v10</small>
        </div>
      </div>

      <ProviderStatusStrip payload={payload} />

      {payload ? (
        <div className="counterfactual-bar">
          <label>
            <span>QA threshold</span>
            <input
              data-testid="qa-threshold"
              type="range"
              min={70}
              max={100}
              value={qaAgreement}
              onChange={(e) => setQaAgreement(Number(e.target.value))}
            />
            <b>{qaAgreement}%</b>
          </label>
          <label>
            <span>Envelope cap</span>
            <input
              data-testid="envelope-cap"
              type="range"
              min={50}
              max={500}
              step={10}
              value={envelopeCap}
              onChange={(e) => setEnvelopeCap(Number(e.target.value))}
            />
            <b>{money.format(envelopeCap)}</b>
          </label>
          <button className="run-button" onClick={onRun} disabled={loading} data-testid="run-capital-experiment">
            {loading ? 'Running…' : 'Run capital experiment'}
          </button>
          <button className="secondary" onClick={onCounterfactual} disabled={loading || !payload} data-testid="run-counterfactual">
            Rerun counterfactual
          </button>
          <div
            className={`connection-dot ${connected ? 'connected' : ''}`}
            title={connected ? 'Live audit stream connected' : 'Audit stream disconnected'}
          />
        </div>
      ) : (
        <div className="header-actions-placeholder" />
      )}
    </header>
  );
}

function RunConsoleBody({ payload, displayAudit, activeStages }) {
  const mission = payload?.mission || {};
  const envelope = payload?.envelope || {};
  const stripe = payload?.stripe || {};
  const blocked = payload?.blocked || null;
  const evidence = payload?.evidence || {};
  const decision = payload?.decision || {};
  const providerReceipts = payload?.providerReceipts || {};

  const lastActiveIndex = STAGE_ORDER.reduce(
    (idx, id, i) => (activeStages.has(id) ? i : idx),
    -1
  );

  return (
    <div className="run-console-grid">
      <section className={`run-stage run-col-left ${activeStages.has('mission') ? 'active' : ''}`} data-stage="mission">
        <div className="cockpit-card">
          <span className="card-label">Mission</span>
          <h2>{mission.company}: {mission.title}</h2>
          <p style={{ color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>{mission.description}</p>
          <div className="card-meta">
            <span>{mission.durationHours}h</span>
            <span>{(mission.allowedTools || []).length} tools</span>
          </div>
          <div>
            <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>Allowed tools</strong>
            <div className="tool-pills" style={{ marginTop: 10 }}>
              {(mission.allowedTools || []).map((tool) => (
                <span key={tool}>{tool}</span>
              ))}
            </div>
          </div>
          <div>
            <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>Kill criteria</strong>
            <ul style={{ marginTop: 8 }}>
              {(mission.killCriteria || []).slice(0, 4).map((criterion) => (
                <li key={criterion}>{criterion}</li>
              ))}
            </ul>
          </div>
        </div>

        <section className={`run-stage ${activeStages.has('governance') ? 'active' : ''}`} data-stage="governance">
          <div className="cockpit-card">
            <span className="card-label">Governance invariants</span>
            <ul>
              {(payload?.sandbox?.invariants || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="sandbox-meta" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <SidebarRow label="Sandbox ID" value={payload?.sandbox?.sandboxId || '—'} />
              <SidebarRow label="Network policy" value={payload?.sandbox?.networkPolicy || '—'} />
            </div>
          </div>
        </section>

        <section className={`run-stage ${activeStages.has('envelope') ? 'active' : ''}`} data-stage="envelope">
          <div className="cockpit-card">
            <span className="card-label">Stripe spend envelope</span>
            <div className="envelope-values compact">
              <div className="big-value"><span>Cap</span><strong>{money.format(envelope.cap || 0)}</strong></div>
              <div className="big-value"><span>Spent</span><strong>{money.format(envelope.spent || 0)}</strong></div>
              <div className="big-value"><span>Remaining</span><strong>{money.format(envelope.remaining || 0)}</strong></div>
              <div className="big-value"><span>Renewal</span><strong style={{ color: 'var(--danger)' }}>{envelope.renewal}</strong></div>
            </div>
            <div className="envelope-status-row">
              <span className={`status-chip ${stripe.mode === 'live' ? 'live' : 'demo'}`}>{stripe.mode || 'demo'}</span>
              <span className="status-chip blocked">renewal blocked</span>
            </div>
            {stripe.sessionId && (
              <div className="metadata-row">
                Session <code>{stripe.sessionId}</code>
              </div>
            )}
          </div>
        </section>
      </section>

      <section className={`run-stage run-col-center ${activeStages.has('timeline') ? 'active' : ''}`} data-stage="timeline">
        <div className="cockpit-card">
          <span className="card-label">Live run timeline</span>
          <LiveTimeline audit={displayAudit} runId={payload?.runId} />
        </div>

        {blocked && (
          <section className={`run-stage blocked-banner ${activeStages.has('blocked') ? 'active' : ''}`} data-stage="blocked">
            <strong>Blocked action — {blocked.policyBreach}</strong>
            <p>{blocked.detail}</p>
            <div className="blocked-chips">
              <span>tool={blocked.attemptedTool}</span>
              <span>amount={money.format(blocked.attemptedAmount || 0)}</span>
              <span>cap={money.format(blocked.cap || 0)}</span>
            </div>
          </section>
        )}

        <div className="stepper" data-stage="stepper">
          {STAGE_ORDER.map((id, i) => {
            let stateClass = '';
            if (activeStages.has(id)) stateClass = 'done';
            if (i === lastActiveIndex + 1) stateClass = 'active';
            return (
              <div key={id} className={`step ${stateClass}`} data-stage={id}>
                <span>{i + 1}</span>
                <small>{id}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className={`run-stage run-col-right ${activeStages.has('evidence') ? 'active' : ''}`} data-stage="evidence">
        <div className="cockpit-card">
          <span className="card-label">Evidence counters</span>
          <div className="metric-grid compact">
            <Metric label="Cases processed" value={number.format(evidence.casesProcessed || 0)} />
            <Metric label="Auto-triaged" value={number.format(evidence.autoTriaged || 0)} />
            <Metric label="QA agreement" value={`${evidence.qaAgreement ?? 0}%`} />
            <Metric label="Net value" value={money.format(evidence.netValue || 0)} />
          </div>
        </div>

        <section className={`run-stage ${activeStages.has('decision') ? 'active' : ''}`} data-stage="decision">
          <div className="cockpit-card">
            <span className="card-label">Decision memo</span>
            <div className={`verdict ${(decision.verdict || 'PENDING').toLowerCase()}`}>{decision.verdict || 'PENDING'}</div>
            <div className="decision-facts">
              <div className="big-value"><span>Next cap</span><strong>{money.format(decision.nextCap || 0)}</strong></div>
              <div className="big-value"><span>Autonomy</span><strong>{decision.autonomy || '—'}</strong></div>
            </div>
            <div className="decision-threshold">QA threshold {decision.qaThreshold ?? 85}% · envelope cap {money.format(decision.envelopeCap ?? envelope.cap ?? 0)}</div>
          </div>
        </section>

        <section className={`run-stage ${activeStages.has('receipts') ? 'active' : ''}`} data-stage="receipts">
          <div className="cockpit-card">
            <span className="card-label">Provider receipts</span>
            <div className="receipt-strip product">
              <ReceiptBadge label="Hermes" state={providerReceipts.hermes?.state} detail={providerReceipts.hermes?.taskId?.slice(0, 18) + '…'} />
              <ReceiptBadge label="NIM" state={providerReceipts.nemotron?.state} detail={providerReceipts.nemotron?.latencyMs} />
              <ReceiptBadge label="Stripe" state={providerReceipts.stripe?.state} detail={providerReceipts.stripe?.sessionId ? providerReceipts.stripe.sessionId.slice(0, 22) + '…' : 'demo'} />
              <ReceiptBadge label="NemoClaw" state={providerReceipts.governance?.state} detail={`${providerReceipts.governance?.blockedCount || 0} blocked · ${providerReceipts.governance?.approvedCount || 0} approved`} />
            </div>
            {(providerReceipts.hermes?.skillPlan || []).length > 0 && (
              <div className="skill-plan-list" style={{ marginTop: 12 }}>
                <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
                  Hermes skill plan ({providerReceipts.hermes?.skillSource})
                </strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                  {providerReceipts.hermes.skillPlan.map((skill) => (
                    <li key={skill}><code>{skill}</code></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <section className={`run-stage ${activeStages.has('audit') ? 'active' : ''}`} data-stage="audit">
          <div className="cockpit-card">
            <span className="card-label">Audit log</span>
            <div className="run-console-audit-log">
              {displayAudit.slice(0, 20).map((row) => (
                <div key={row.id} className="run-console-audit-row" data-kind={row.kind || 'manual'}>
                  <span>{row.id}</span>
                  <div>
                    <strong>{row.actor}: {row.action}</strong>
                    <small>{row.detail}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>

      <JudgeProofSidebar payload={payload} />
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReceiptBadge({ label, state, detail }) {
  const tone = state === 'live' ? 'live' : state === 'blocked' ? 'blocked' : state === 'fallback' ? 'fallback' : 'demo';
  return (
    <div className={`receipt-badge ${tone}`}>
      <strong>{label}</strong>
      <span className="state">{state}</span>
      <small>{detail}</small>
    </div>
  );
}

function ProviderStatusStrip({ payload }) {
  const liveError = payload?.liveError || '';
  const hermes = payload?.providerReceipts?.hermes || {};
  const nemotron = payload?.providerReceipts?.nemotron || {};
  const stripe = payload?.providerReceipts?.stripe || {};
  const sandbox = payload?.sandbox || {};

  const badges = [
    {
      id: 'provider-hermes',
      label: 'Hermes',
      ...deriveProviderState({
        live: ['task-dispatched', 'gateway-ready'].includes(hermes.state),
        mock: hermes.state === 'playbook-saved' || !hermes.state,
        error: liveError.toLowerCase().includes('hermes') || hermes.state === 'error',
        liveLabel: hermes.state === 'task-dispatched' ? 'Task dispatched' : 'Gateway ready',
        mockLabel: 'Playbook saved locally',
      }),
    },
    {
      id: 'provider-nim',
      label: 'NIM / Nemotron',
      ...deriveProviderState({
        live: nemotron.state === 'live',
        mock: nemotron.state === 'fallback' || !nemotron.state,
        error: liveError.toLowerCase().includes('nim') || liveError.toLowerCase().includes('nemotron') || nemotron.state === 'error',
        liveLabel: nemotron.model || 'NVIDIA NIM live',
        mockLabel: 'Deterministic fallback',
      }),
    },
    {
      id: 'provider-stripe',
      label: 'Stripe',
      ...deriveProviderState({
        live: stripe.state === 'live',
        mock: stripe.state === 'demo' || !stripe.state,
        error: liveError.toLowerCase().includes('stripe') || stripe.state === 'error',
        liveLabel: 'Live Checkout Session',
        mockLabel: 'Demo session',
      }),
    },
    {
      id: 'provider-nemoclaw',
      label: 'NemoClaw / OpenShell',
      ...deriveProviderState({
        live: (sandbox.runtime || '').toLowerCase().includes('live broker'),
        mock: !(sandbox.runtime || '').toLowerCase().includes('live broker'),
        error: liveError.toLowerCase().includes('nemoclaw') || liveError.toLowerCase().includes('openshell') || sandbox.status === 'error',
        liveLabel: 'OpenShell live broker',
        mockLabel: 'Sandbox replay',
      }),
    },
  ];

  return (
    <div className="provider-status-strip" role="list" aria-label="Provider status">
      {badges.map((b) => (
        <ProviderBadge key={b.id} {...b} />
      ))}
    </div>
  );
}

function deriveProviderState({ live, mock, error, liveLabel, mockLabel }) {
  if (error) return { mode: 'ERROR', subtitle: 'Integration error — fallback active' };
  if (live) return { mode: 'LIVE', subtitle: liveLabel };
  return { mode: 'MOCK', subtitle: mockLabel };
}

function ProviderBadge({ id, label, mode, subtitle }) {
  const tone = mode === 'LIVE' ? 'live' : mode === 'ERROR' ? 'error' : 'mock';
  return (
    <div
      className={`provider-badge ${tone}`}
      data-testid={id}
      role="listitem"
      title={`${label}: ${mode}${subtitle ? ` — ${subtitle}` : ''}`}
    >
      <span className="provider-dot" aria-hidden="true" />
      <div className="provider-badge-body">
        <strong>{label}</strong>
        <span>{mode}</span>
      </div>
      <small>{subtitle}</small>
    </div>
  );
}

function JudgeProofSidebar({ payload }) {
  const proposalId = payload?.stripe?.clientReferenceId || payload?.inputHash?.replace('input-', '') || '—';
  const nemotron = payload?.providerReceipts?.nemotron || {};
  const stripe = payload?.stripe || {};
  const hermes = payload?.providerReceipts?.hermes || {};
  const auditRows = payload?.auditRows || [];
  const firstId = auditRows[0]?.id;
  const lastId = auditRows[auditRows.length - 1]?.id;

  return (
    <aside className={`run-stage run-col-judge judge-proof-sidebar ${payload ? 'active' : ''}`} data-testid="judge-proof-sidebar">
      <div className="cockpit-card">
        <span className="card-label">Judge-proof packet</span>
        <SidebarRow label="Mission / proposal ID" value={proposalId} />
        <SidebarRow label="NIM model + latency" value={`${nemotron.model || '—'} · ${nemotron.latencyMs || '—'}`} />
        <SidebarRow label="Stripe session ID" value={stripe.sessionId || '—'} />
        <SidebarRow label="Hermes task ID" value={hermes.taskId || '—'} />
        <SidebarRow label="Hermes skill plan" value={Array.isArray(hermes.skillPlan) ? hermes.skillPlan.join(', ') : (hermes.skillPlan || '—')} />
        <SidebarRow label="Policy decision / run ID" value={payload?.runId || '—'} />
        <SidebarRow label="Audit packet ID" value={firstId && lastId ? `${firstId} → ${lastId} (${auditRows.length})` : '—'} />
        <SidebarRow label="Provider mode" value={payload?.demoMode === false ? 'LIVE' : 'DEMO'} />
      </div>
    </aside>
  );
}

function SidebarRow({ label, value }) {
  return (
    <div className="judge-row">
      <span className="judge-label">{label}</span>
      <code className="judge-value" title={value}>{value}</code>
    </div>
  );
}
