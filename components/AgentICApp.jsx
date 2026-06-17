'use client';

import { useEffect, useMemo, useState } from 'react';
import { governancePolicy, judgeRubric, productModeConfig, seededProposals } from '../lib/demoData.js';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat('en-US');

export default function AgentICApp({
  initialProposal = seededProposals[0],
  initialEvaluation = null,
  showRunLink = false,
}) {
  const [selectedId, setSelectedId] = useState(initialProposal.id);
  const [evaluation, setEvaluation] = useState(initialEvaluation);
  const [proposal, setProposal] = useState(initialProposal);
  const [audit, setAudit] = useState([]);
  const [evidenceIndex, setEvidenceIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stripe, setStripe] = useState(null);
  const [error, setError] = useState(null);
  const [receipts, setReceipts] = useState(null);
  const [playbook, setPlaybook] = useState(null);
  const [operationalRun, setOperationalRun] = useState(null);
  const [blockedEvent, setBlockedEvent] = useState(null);
  const [boardPacket, setBoardPacket] = useState(null);
  const [showBlocked, setShowBlocked] = useState(false);
  const [productMode, setProductMode] = useState(productModeConfig.enabled);
  const [auditFilter, setAuditFilter] = useState('all');
  const [recordingMode, setRecordingMode] = useState(false);

  const evidenceGate = useMemo(() => {
    if (!evaluation) return null;
    return computeEvidenceGate(evaluation, evidenceIndex);
  }, [evaluation, evidenceIndex]);

  useEffect(() => {
    runEvaluation(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function runEvaluation(proposalId = selectedId) {
    setLoading(true);
    setError(null);
    setStripe(null);
    setEvidenceIndex(0);
    setReceipts(null);
    setPlaybook(null);
    setOperationalRun(null);
    setBlockedEvent(null);
    setBoardPacket(null);
    setShowBlocked(false);
    try {
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proposalId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      setProposal(payload.proposal);
      setEvaluation(payload.evaluation);
      setReceipts(payload.providerReceipts || null);
      setPlaybook(payload.hermesPlaybook || null);
      setOperationalRun(payload.operationalRun || null);
      setBlockedEvent(payload.blockedEvent || null);
      setBoardPacket(payload.boardPacket || null);
      await refreshAudit();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function authorizeStripe() {
    if (!evaluation) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/stripe-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.id, evaluation }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
      setStripe(payload);
      if (payload.providerReceipts) setReceipts(payload.providerReceipts);
      await refreshAudit();
      if (payload.mode === 'live' && payload.checkout?.url) {
        window.open(payload.checkout.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function advanceEvidence() {
    if (!evaluation) return;
    const nextIndex = Math.min(evidenceIndex + 1, evaluation.evidenceTimeline.length - 1);
    setEvidenceIndex(nextIndex);
    const gate = computeEvidenceGate(evaluation, nextIndex);
    await fetch('/api/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actor: 'ROI evidence collector',
        action: 'advanced measurement gate',
        proposalId: proposal.id,
        detail: `${gate.latest.label}: ${gate.summary}`,
        kind: 'evidence',
      }),
    });
    await refreshAudit();
  }

  async function refreshAudit() {
    const response = await fetch('/api/audit', { cache: 'no-store' });
    const payload = await response.json();
    setAudit(payload.audit || []);
  }

  async function seedAudit() {
    await fetch('/api/audit', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposalId: proposal.id }),
    });
    await refreshAudit();
  }

  return (
    <main>
      <section data-testid="hero-section" className="hero-shell">
        <div className="noise" />
        <nav className="topbar" aria-label={productMode ? 'Product navigation' : 'Demo navigation'}>
          <div className="brand-mark">
            <span className="brand-orb">IC</span>
            <div>
              <strong>Agent IC</strong>
              <small>Hermes × Nemotron × Stripe</small>
            </div>
          </div>
          <div className="topbar-links">
            <a href="#workbench">Workbench</a>
            <a href="#governance">Governance</a>
            {!productMode && <a href="#storyboard">Storyboard</a>}
            {showRunLink && <a href="/run">Run console</a>}
            <button className="ghost" onClick={() => runEvaluation(selectedId)} disabled={loading}>
              {loading ? 'Running…' : productMode ? 'Run mission' : 'Run IC'}
            </button>
            <button className="ghost" onClick={() => setProductMode(!productMode)} title="Toggle product/demo mode">
              {productMode ? 'Demo' : 'Product'}
            </button>
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">{productMode ? productModeConfig.heroEyebrow : 'Hermes Agent Hackathon submission'}</div>
            <h1>Agent IC — The Investment Committee for Autonomous Agents</h1>
            <p className="hero-subhead">
              Enterprise AI pilots should earn capital like investments, not vibes.
            </p>
            <p>
              {productMode
                ? productModeConfig.heroSubcopy
                : 'Agent IC is a live investment committee for agentic AI: Hermes/Nemotron reads pilot proposals, scores viability, scopes a governed budget, creates a Stripe spend path, measures ROI evidence, and kills or continues with an audit packet.'}
            </p>
            <div className="cta-row">
              <a className="primary" href="#workbench">{productMode ? productModeConfig.primaryCTA : 'Open live demo'}</a>
              <button className="secondary" onClick={seedAudit}>{productMode ? productModeConfig.secondaryCTA : 'Seed audit log'}</button>
            </div>
            {!productMode && (
              <div className="source-line">
                Built against the announced hackathon bar: useful, viable, presentation-ready. Demo mode is safe by
                default; live NIM and Stripe paths activate only with env vars.
              </div>
            )}
          </div>

          <div className="hero-card" aria-label="Current IC verdict">
            <div className="terminal-header">
              <span />
              <span />
              <span />
              <code>agent-ic.run</code>
            </div>
            <div className="decision-strip">
              <span className={`decision ${evaluation?.decision?.toLowerCase() || 'pending'}`}>
                {evaluation?.decision || 'PENDING'}
              </span>
              <strong>
                {evaluation ? (
                  <span data-testid="budget-line">{money.format(evaluation.recommendedBudget)}</span>
                ) : (
                  '—'
                )}
              </strong>
            </div>
            <div className="metric-grid compact">
              <Metric label="IC score" value={evaluation?.score ?? '—'} suffix="/100" />
              <Metric label="Governance" value={evaluation?.governanceScore ?? '—'} suffix="/100" />
              <Metric label="Autonomous cap" value={evaluation ? money.format(evaluation.autonomousSpendCap) : '—'} testId="cap-line" />
              <Metric label="Payback" value={evaluation?.paybackDays ?? '—'} suffix=" days" testId="payback-line" />
            </div>
            <p className="thesis">{evaluation?.thesis || 'Run the seeded scenario to generate an investment memo.'}</p>
            <div className="model-chip-row">
              <span>Hermes intake</span>
              <span>{evaluation?.model || 'Nemotron path'}</span>
              <span>Stripe spend cap</span>
            </div>
            {/* Provider receipts strip */}
            {receipts && (
              <div className={`receipt-strip ${productMode ? 'product' : ''}`}>
                <ReceiptBadge label="Nemotron" state={receipts.nemotron.state} detail={receipts.nemotron.model} />
                <ReceiptBadge label="Stripe" state={receipts.stripe.state} detail={receipts.stripe.sessionId ? receipts.stripe.sessionId.slice(0, 22) + '…' : 'demo'} />
                <ReceiptBadge label="Hermes" state={receipts.hermes.state} detail={receipts.hermes.playbookId.slice(0, 18) + '…'} />
                <ReceiptBadge label="Governance" state={receipts.governance.state} detail={`${receipts.governance.blockedCount} blocked · ${receipts.governance.approvedCount} approved`} />
              </div>
            )}
          </div>
        </div>
      </section>

      {!productMode && (
        <section className="rubric-row" aria-label="Judging rubric mapping">
          {judgeRubric.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <p>{item.copy}</p>
            </article>
          ))}
        </section>
      )}

      <section id="workbench" data-testid="workbench-section" className="workbench">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Live workbench</span>
            <h2>Evaluate, fund, measure, kill/continue</h2>
          </div>
          <div className="toolbar">
            <button data-testid="evaluate-agent-ic" onClick={() => runEvaluation(selectedId)} disabled={loading}>
              {productMode ? 'Run mission' : 'Evaluate with Agent IC'}
            </button>
            <button data-testid="authorize-stripe-spend" onClick={authorizeStripe} disabled={!evaluation || loading || evaluation.decision === 'KILL'}>
              {productMode ? 'Approve spend envelope' : 'Authorize Stripe spend'}
            </button>
            <button data-testid="advance-roi-evidence" onClick={advanceEvidence} disabled={!evaluation || evidenceIndex >= (evaluation?.evidenceTimeline?.length || 1) - 1}>
              {productMode ? 'Import evidence' : 'Advance ROI evidence'}
            </button>
            <button data-testid="simulate-blocked-spend" onClick={() => setShowBlocked(true)} disabled={!evaluation || showBlocked}>
              {productMode ? 'Trigger blocked action' : 'Simulate blocked spend'}
            </button>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}
        {showBlocked && (blockedEvent || evaluation?.blockedAction) && (
          <div className="blocked-box">
            <strong>Blocked by policy — {blockedEvent?.policyBreach || evaluation?.blockedAction?.policyBreach}</strong>
            <p>{blockedEvent?.detail || evaluation?.blockedAction?.detail}</p>
            <div className="blocked-chips">
              <span>reason={blockedEvent?.reasonCode || evaluation?.blockedAction?.reasonCode || 'cap_exceeded'}</span>
              <span>policy={blockedEvent?.policyRule || evaluation?.blockedAction?.policyRule || 'GOV-ATLAS-01'}</span>
              <span>audit={blockedEvent?.auditId || evaluation?.blockedAction?.auditId || 'AUD-00173'}</span>
            </div>
            <small>{blockedEvent?.stripeResult || evaluation?.blockedAction?.stripeResult}</small>
          </div>
        )}

        <div className="demo-grid">
          <aside className="proposal-list" aria-label="Proposal list">
            <h3>Pilot queue</h3>
            {seededProposals.map((item) => (
              <button
                key={item.id}
                data-testid={item.id === 'atlas-freight-rma-copilot' ? 'proposal-atlas-freight' : undefined}
                className={item.id === selectedId ? 'proposal-card active' : 'proposal-card'}
                onClick={() => setSelectedId(item.id)}
              >
                <span>{item.company}</span>
                <strong>{item.title}</strong>
                <small>{money.format(item.ask)} request · {item.durationWeeks} weeks</small>
              </button>
            ))}
          </aside>

          <article className="proposal-detail">
            <div className="detail-header">
              <div>
                <span className="pill">{proposal.category}</span>
                <h3>{proposal.company}: {proposal.title}</h3>
              </div>
              <span className="sponsor">Sponsor: {proposal.sponsor}</span>
            </div>
            <div className="memo-grid">
              <div>
                <h4>Pain</h4>
                <p>{proposal.pain}</p>
              </div>
              <div>
                <h4>Proposal</h4>
                <p>{proposal.proposal}</p>
              </div>
            </div>
            <div className="score-bars">
              <Bar label="Data readiness" value={proposal.dataReadiness} />
              <Bar label="Automation leverage" value={proposal.automationLeverage} />
              <Bar label="Business urgency" value={proposal.businessUrgency} />
              <Bar label="Integration risk" value={proposal.integrationRisk} inverse />
              <Bar label="Compliance risk" value={proposal.complianceRisk} inverse />
            </div>
            <div className="tools-box">
              <h4>Requested tools</h4>
              <div className="tool-pills">
                {proposal.requestedTools.map((tool) => <span key={tool}>{tool}</span>)}
              </div>
            </div>
          </article>

          <article className="ic-output">
            <h3>Agent IC memo</h3>
            {evaluation ? (
              <>
                <div className="big-verdict">
                  <span className={`decision ${evaluation.decision.toLowerCase()}`}>{evaluation.decision}</span>
                  <div>
                    <strong>{money.format(evaluation.recommendedBudget)}</strong>
                    <small>budget · {money.format(evaluation.autonomousSpendCap)} autonomous spend cap</small>
                  </div>
                </div>
                <p>{evaluation.thesis}</p>
                <div className="metric-grid">
                  <Metric label="90-day ROI" value={evaluation.roiMultiple} suffix="x" />
                  <Metric label="Monthly value" value={money.format(evaluation.monthlyGrossBenefit)} />
                  <Metric label="Payback" value={evaluation.paybackDays} suffix=" days" />
                  <Metric label="Confidence" value={evaluation.confidence} />
                </div>
                <h4>Micro-pilot spend envelope</h4>
                <div className="envelope-card">
                  <div className="envelope-header">
                    <div>
                      <strong>{evaluation.spendEnvelope?.mission || evaluation.title}</strong>
                      <small>{evaluation.spendEnvelope?.durationHours || 72}h · {evaluation.spendEnvelope?.successMetric}</small>
                    </div>
                    <span>{money.format(evaluation.spendEnvelope?.cap || 100)}</span>
                  </div>
                  <div className="envelope-tools">
                    <span>Allowed tools:</span>
                    {evaluation.spendEnvelope?.allowedTools?.map((tool) => <span key={tool} className="tool-pill allowed">{tool}</span>)}
                  </div>
                  {evaluation.spendEnvelope?.blockedTool && (
                    <div className="envelope-blocked">
                      <span>Blocked tool:</span>
                      <strong>{evaluation.spendEnvelope.blockedTool.name}</strong>
                      <small>{evaluation.spendEnvelope.blockedTool.reason}</small>
                    </div>
                  )}
                </div>

                <h4>Budget lines</h4>
                <div className="budget-table">
                  {evaluation.budget.map((line) => (
                    <div className="budget-row" key={line.name}>
                      <div>
                        <strong>{line.name}</strong>
                        <small>{line.owner} · {line.stripeAction}</small>
                      </div>
                      <span>{money.format(line.amount)}</span>
                    </div>
                  ))}
                </div>
                {/* 72-hour run receipts — promoted to dedicated section in product mode */}
                {operationalRun && (
                  <div className={`operational-run ${productMode ? 'product' : ''}`}>
                    <h4>{productMode ? '72-hour run receipts' : `Operational mini-run — Week ${operationalRun.week}`}</h4>
                    <div className="metric-grid compact">
                      <Metric label="Cases processed" value={number.format(operationalRun.processed)} />
                      <Metric label="Auto-triaged" value={number.format(operationalRun.autoTriaged)} />
                      <Metric label="Escalated" value={number.format(operationalRun.escalated)} />
                      <Metric label="Failed policy" value={number.format(operationalRun.failedPolicy)} />
                      <Metric label="Hours saved" value={operationalRun.hoursSaved} />
                      <Metric label="Gross value" value={money.format(operationalRun.grossValue)} />
                      <Metric label="Spend" value={money.format(operationalRun.spend)} />
                      <Metric label="Net value" value={money.format(operationalRun.netValue)} />
                    </div>
                  </div>
                )}

                {evaluation.evidenceReceipts && (
                  <div className={`evidence-receipts ${productMode ? 'product' : ''}`}>
                    <h4>{productMode ? 'Capital earned by evidence' : 'Imported evidence receipts'}</h4>
                    <div className="metric-grid compact">
                      {evaluation.evidenceReceipts.map((receipt) => (
                        <Metric
                          key={receipt.metric}
                          label={receipt.metric.replace(/_/g, ' ')}
                          value={receipt.unit === 'USD' ? money.format(receipt.value) : number.format(receipt.value)}
                          suffix={receipt.unit === 'USD' ? '' : ` ${receipt.unit}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : <p>Evaluation pending.</p>}
          </article>
        </div>
      </section>

      {evaluation && (
        <section className="evidence-section">
          <div className="section-heading split">
            <div>
              <span className="eyebrow">ROI evidence</span>
              <h2>Decision gate follows measured business evidence</h2>
            </div>
            <div className={`evidence-decision ${evidenceGate?.decision?.toLowerCase()}`} data-testid="final-decision">{evidenceGate?.decision}</div>
          </div>
          <div className="evidence-grid">
            <div className="timeline-card">
              {evaluation.evidenceTimeline.map((event, index) => (
                <button
                  key={event.week}
                  className={index <= evidenceIndex ? 'timeline-event active' : 'timeline-event'}
                  onClick={() => setEvidenceIndex(index)}
                >
                  <span>W{event.week}</span>
                  <strong>{event.label}</strong>
                  <small>{event.metric}</small>
                </button>
              ))}
            </div>
            <div className="evidence-card">
              <h3>{evidenceGate.latest.label}</h3>
              <p>{evidenceGate.summary}</p>
              <div className="metric-grid compact">
                <Metric label="Evidence grade" value={evidenceGate.latest.grade} />
                <Metric label="Gross impact" value={money.format(evidenceGate.cumulativeImpact)} />
                <Metric label="Spend consumed" value={money.format(evidenceGate.spendConsumed)} />
                <Metric label="Net observed" value={money.format(evidenceGate.net)} />
              </div>
              <div className="chart" aria-label="ROI evidence chart">
                {evaluation.evidenceTimeline.map((event, index) => (
                  <span
                    key={event.week}
                    className={index <= evidenceIndex ? 'bar active' : 'bar'}
                    style={{ height: `${18 + Math.min(78, event.cumulativeImpact / 4500)}%` }}
                    title={`${event.label}: ${money.format(event.cumulativeImpact)}`}
                  />
                ))}
              </div>
            </div>
            <div className="stripe-card">
              <h3>Stripe spend path</h3>
              <p>
                Demo mode returns a mock Checkout Session. Add <code>STRIPE_SECRET_KEY</code> and set{' '}
                <code>AGENT_IC_DEMO_MODE=false</code> to create a real Checkout Session.
              </p>
              <button onClick={authorizeStripe} disabled={loading || evaluation.decision === 'KILL'}>
                Create Checkout Session
              </button>
              {stripe && (
                <div className="stripe-result" data-testid="stripe-result">
                  <span>{stripe.mode.toUpperCase()}</span>
                  <strong>{stripe.checkout?.id}</strong>
                  <small>{money.format((stripe.checkout?.amount_total || 0) / 100)} authorization · {stripe.checkout?.status}</small>
                  {stripe.checkout?.url && stripe.mode === 'demo' && <a href={stripe.checkout.url}>Open mock checkout</a>}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section id="governance" data-testid="governance-section" className="governance-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Governance</span>
            <h2>{governancePolicy.name}</h2>
          </div>
        </div>
        <div className="governance-grid">
          <article>
            <h3>Invariants</h3>
            <ul>
              {governancePolicy.invariants.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
          <article>
            <h3>Tool scopes</h3>
            <div className="scope-list">
              {governancePolicy.toolScopes.map((scope) => (
                <div key={scope.tool}>
                  <strong>{scope.tool}</strong>
                  <small>{scope.scope} · cap {money.format(scope.maxSpend)} · {scope.approval}</small>
                </div>
              ))}
            </div>
          </article>
          <article>
            <h3>Kill criteria</h3>
            <ul>
              {governancePolicy.killCriteria.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        </div>
      </section>

      <section data-testid="audit-section" className="audit-section">
        <div className="section-heading split">
          <div>
            <span className="eyebrow">Audit packet</span>
            <h2>Append-only operating record</h2>
          </div>
          <div className="audit-controls">
            {productMode && (
              <div className="audit-filters">
                {['all', 'spend', 'denied', 'evidence', 'playbook'].map((f) => (
                  <button
                    key={f}
                    className={auditFilter === f ? 'active' : ''}
                    onClick={() => setAuditFilter(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            )}
            <button onClick={refreshAudit}>Refresh audit</button>
          </div>
        </div>
        <div className="audit-log">
          {(audit.length ? audit : evaluation?.audit || [])
            .filter((item) => {
              if (!productMode || auditFilter === 'all') return true;
              const kind = item.kind || 'manual';
              if (auditFilter === 'spend') return kind === 'stripe' || kind === 'stripe-error';
              if (auditFilter === 'denied') return kind === 'blocked' || item.action?.includes('DENIED');
              if (auditFilter === 'evidence') return kind === 'evidence';
              if (auditFilter === 'playbook') return kind === 'evaluation' || kind === 'seed';
              return true;
            })
            .slice(0, productMode ? 6 : 12)
            .map((item, index) => (
              <div className="audit-row" key={item.id || `${item.actor}-${index}`}>
                <span>{item.id || `SEED-${index + 1}`}</span>
                <div>
                  <strong>{item.actor}: {item.action}</strong>
                <small>{item.detail}</small>
              </div>
              <time>{formatTime(item.ts)}</time>
            </div>
          ))}
        </div>
      </section>

      {/* Hermes playbook + Board packet section */}
      {playbook && boardPacket && (
        <section className="playbook-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Hermes playbook &amp; board packet</span>
              <h2>Reusable skill + exportable memo</h2>
            </div>
          </div>
          <div className="playbook-grid">
            <article className="playbook-card">
              <h3>{productMode ? 'Saved Hermes playbook' : 'Hermes playbook saved'}</h3>
              <div className="metric-grid compact">
                <Metric label="Playbook" value={playbook.name} />
                <Metric label="Version" value={playbook.version} />
                <Metric label="Task ID" value={playbook.taskId} />
                <Metric label="Reused on" value={playbook.reusedOn.join(', ')} />
              </div>
              <div className="playbook-status">
                <span className="status-badge approved">write-approved</span>
                <span className="reuse-count">reuse: {playbook.reusedOn.length} missions</span>
              </div>
              <p className="artifact-line">Artifact: <code>{playbook.artifact}</code></p>
              <div className="playbook-io">
                <div>
                  <strong>Inputs</strong>
                  <ul>{Object.entries(playbook.inputs).map(([k, v]) => <li key={k}><small>{k}</small>: {v}</li>)}</ul>
                </div>
                <div>
                  <strong>Outputs</strong>
                  <ul>{Object.entries(playbook.outputs).map(([k, v]) => <li key={k}><small>{k}</small>: {v}</li>)}</ul>
                </div>
              </div>
            </article>
            <article className="board-packet-card">
              <h3>Board packet</h3>
              <div className="metric-grid compact">
                <Metric label="Decision" value={boardPacket.memo.decision} />
                <Metric label="Budget" value={boardPacket.memo.budget} />
                <Metric label="Cap" value={boardPacket.memo.cap} />
                <Metric label="Payback" value={boardPacket.memo.payback} />
                <Metric label="ROI" value={boardPacket.memo.roi} />
                <Metric label="Confidence" value={boardPacket.memo.confidence} />
                <Metric label="Evidence grade" value={boardPacket.memo.evidenceGrade} />
                <Metric label="Net observed" value={boardPacket.memo.netObserved} />
              </div>
              <div className="packet-actions">
                <button onClick={() => navigator.clipboard?.writeText(JSON.stringify(boardPacket.memo, null, 2))}>Copy IC memo</button>
                <button onClick={() => navigator.clipboard?.writeText(JSON.stringify(boardPacket.auditSummary, null, 2))}>Export audit packet</button>
                <button onClick={() => alert(`Next gate: ${boardPacket.nextGate.label} on ${boardPacket.nextGate.date}`)}>Create next gate review</button>
              </div>
            </article>
          </div>
        </section>
      )}

      {!productMode && (
        <section id="storyboard" data-testid="storyboard-section" className="storyboard-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Submission storyboard</span>
              <h2>1–3 minute demo arc</h2>
            </div>
          </div>
          <div className="story-grid">
            {[
              ['0:00–0:20', 'Hook', '“Every enterprise wants agents, but CFOs need investment discipline.” Show proposal queue and IC score.'],
              ['0:20–0:55', 'Hermes/Nemotron evaluation', 'Run Agent IC. Explain viability, governance, budget, and risk memo generation.'],
              ['0:55–1:25', 'Governed spend', 'Click Stripe authorization. Show autonomous cap, metadata, and audit entry.'],
            ['1:25–2:10', 'ROI evidence', 'Advance weeks 2/4/6/8. Show measured impact, spend consumed, and kill/continue gate.'],
            ['2:10–2:45', 'Why it wins', 'Useful: capital allocation for AI pilots. Viable: demo/live paths. Presentation: clean executive/audit narrative.'],
          ].map(([time, title, copy]) => (
            <article key={time}>
              <span>{time}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      )}
    </main>
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

function Metric({ label, value, suffix = '', testId }) {
  return (
    <div className="metric" data-testid={testId}>
      <span>{label}</span>
      <strong>{value}{suffix}</strong>
    </div>
  );
}

function Bar({ label, value, inverse = false }) {
  const tone = inverse ? 100 - value : value;
  return (
    <div className="score-bar">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <i style={{ '--bar': `${tone}%` }} />
    </div>
  );
}

function computeEvidenceGate(evaluation, evidenceIndex) {
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
        ? `Continue: evidence grade ${latest.grade}, net observed value ${money.format(net)}, no kill criteria tripped.`
        : decision === 'KILL'
          ? `Kill: evidence grade ${latest.grade} or net value ${money.format(net)} breached the IC gate.`
          : `Observe: ${latest.label} is not enough evidence for a spend-up decision yet.`,
  };
}

function formatTime(ts) {
  if (!ts) return '—';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
