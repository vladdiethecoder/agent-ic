'use client';

import { useState, useCallback } from 'react';
import './trial-console-v18.css';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const STAGES = [
  { id: 'intake', label: 'Intake' },
  { id: 'fund', label: 'Fund' },
  { id: 'dispatch', label: 'Dispatch' },
  { id: 'govern', label: 'Govern' },
  { id: 'evaluate', label: 'Evaluate' },
  { id: 'synthesize', label: 'Decide' },
  { id: 'playbook', label: 'Playbook' },
];

export default function AgentICTrialConsole() {
  const [phase, setPhase] = useState('intake');
  const [loading, setLoading] = useState(false);
  const [mission, setMission] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [cases, setCases] = useState(null);
  const [renewals, setRenewals] = useState(null);

  const loadCases = useCallback(async () => {
    if (cases) return;
    try {
      const res = await fetch('/api/enterprise-trial');
      const data = await res.json();
      setCases(data.cases || []);
    } catch {
      setCases([]);
    }
  }, [cases]);

  const [loadingStage, setLoadingStage] = useState('');
  const [reasoningTrace, setReasoningTrace] = useState([]);

  const runTrial = useCallback(async (caseId, missionText) => {
    setLoading(true);
    setError(null);
    setPhase('running');
    setLoadingStage('Analyzing mission statement with Nemotron...');

    // Set up reasoning trace stages — these fire via setTimeout
    // while the fetch is in flight. The server is doing REAL work
    // (Nemotron, Stripe, worker) which takes ~20 seconds.
    const stages = [
      { delay: 300, msg: 'Analyzing mission statement...', detail: 'Nemotron intake evaluation' },
      { delay: 2500, msg: 'Generating trial plan...', detail: 'Vendor matched · data source identified' },
      { delay: 3500, msg: 'Creating spend envelope...', detail: 'Stripe Checkout Session' },
      { delay: 5000, msg: 'Dispatching worker agent...', detail: 'Processing 330 NHTSA complaints' },
      { delay: 7000, msg: 'Classifying complaints...', detail: 'Nemotron NIM classification' },
      { delay: 10000, msg: 'Enforcing policy...', detail: 'OpenShell policy block verification' },
      { delay: 11000, msg: 'Computing metrics...', detail: '8 enterprise metrics' },
      { delay: 12000, msg: 'Synthesizing decision...', detail: 'Nemotron procurement synthesis' },
      { delay: 14000, msg: 'Trial complete', detail: 'Governed enterprise trial finished — loading results' },
    ];

    const trace = [];
    const timers = stages.map(s => setTimeout(() => {
      setLoadingStage(s.msg);
      trace.push({ msg: s.msg, detail: s.detail, status: 'complete' });
      setReasoningTrace([...trace]);
    }, s.delay));

    // Start the fetch immediately — it runs in parallel with the timers above
    // React's setTimeout callbacks fire between fetch network waits,
    // so the reasoning trace updates are visible while the server works.
    fetch('/api/enterprise-trial', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        caseId: caseId || undefined,
        missionStatement: missionText || undefined,
      }),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    }).then((data) => {
      timers.forEach(t => clearTimeout(t));
      setResult(data);
      setPhase('result');
    }).catch((err) => {
      timers.forEach(t => clearTimeout(t));
      setError(err.message);
      setPhase('intake');
    }).finally(() => {
      setLoading(false);
      setLoadingStage('');
      setReasoningTrace([]);
    });
  }, []);

  const loadRenewals = useCallback(async () => {
    setLoading(true);
    setPhase('renewals');
    try {
      // Seed demo history if empty, then load
      await fetch('/api/renewals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'seed' }) });
      const res = await fetch('/api/renewals?all=true');
      const data = await res.json();
      setRenewals(data.relationships || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Intake Phase ──────────────────────────────────────────
  if (phase === 'intake') {
    return (
      <div className="ic-trial-console">
        <Header phase={phase} onNav={loadRenewals} onTrial={() => setPhase('intake')} />
        <div className="ic-intake">
          <div className="ic-intake-eyebrow">Enterprise Procurement Control Plane</div>
          <h1>
            Fund the right AI pilots.
            <br />
            <span className="ic-highlight">Stop the wrong ones.</span>
          </h1>
          <p className="ic-intake-subtitle">
            Agent IC helps CFOs and enterprise operators fund the right AI pilots,
            stop the wrong ones, and prove every dollar with evidence.
            Give any vendor&apos;s agentic service a bounded trial, govern its tools and spend,
            block unsafe actions, and decide whether it earns your budget.
          </p>

          <textarea
            className="ic-mission-input"
            placeholder="Describe the enterprise problem you want an agentic service to solve. Example: 'We need to evaluate RouteGuard AI for complaint triage before signing a $14,400 annual contract...'"
            value={mission}
            onChange={(e) => setMission(e.target.value)}
          />

          <div className="ic-intake-actions">
            <button
              className="ic-btn-primary"
              onClick={() => runTrial(null, mission)}
              disabled={loading || (!mission.trim() && !cases)}
            >
              Analyze &amp; Generate Trial Plan
            </button>
            <button className="ic-btn-secondary" onClick={loadCases}>
              Browse Vendor Cases
            </button>
          </div>

          {cases && cases.length > 0 && (
            <div className="ic-case-grid">
              {cases.map((c) => (
                <div
                  key={c.id}
                  className="ic-case-card"
                  onClick={() => runTrial(c.id, c.missionStatement)}
                >
                  <div className="ic-case-domain">{c.domain}</div>
                  <div className="ic-case-title">{c.vendor.product}</div>
                  <div className="ic-case-vendor">{c.vendor.name}</div>
                  <div className="ic-case-meta">
                    <span>Data: {c.dataSource.split('(')[0].trim()}</span>
                    <span>Block: {c.blockedAction.split('(')[0].slice(0, 30)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Loading Phase ─────────────────────────────────────────
  if (phase === 'running' || loading) {
    return (
      <div className="ic-trial-console">
        <Header phase={phase} onNav={loadRenewals} onTrial={() => setPhase('intake')} />
        <div className="ic-reasoning-container">
          <div className="ic-reasoning-header">
            <div className="ic-reasoning-spinner" />
            <div className="ic-reasoning-title">{loadingStage || 'Initializing...'}</div>
          </div>
          <div className="ic-reasoning-trace">
            {reasoningTrace.map((step, i) => (
              <div key={i} className="ic-reasoning-line" style={{ opacity: 0.4 + (0.6 * (i + 1) / reasoningTrace.length) }}>
                <div className="ic-reasoning-step-marker" />
                <div className="ic-reasoning-step-content">
                  <div className="ic-reasoning-step-msg">{step.msg}</div>
                  <div className="ic-reasoning-step-detail">{step.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="ic-reasoning-footer">
            Agent IC · Enterprise Procurement Control Plane
          </div>
        </div>
      </div>
    );
  }

  // ─── Result Phase ──────────────────────────────────────────
  if (phase === 'result' && result) {
    return (
      <div className="ic-trial-console">
        <Header phase={phase} onNav={loadRenewals} onTrial={() => setPhase('intake')} />
        <StageBar activeStage="playbook" />
        <TrialResult result={result} onReset={() => { setPhase('intake'); setResult(null); }} />
      </div>
    );
  }

  // ─── Renewals Phase ────────────────────────────────────────
  if (phase === 'renewals') {
    return (
      <div className="ic-trial-console">
        <Header phase={phase} onNav={loadRenewals} onTrial={() => setPhase('intake')} />
        <div className="ic-trial-view">
          {loading && (
            <div className="ic-panel ic-trial-full">
              <div className="ic-loading">
                <div className="ic-loading-spinner" />
                <div className="ic-loading-text">Loading vendor renewal history...</div>
              </div>
            </div>
          )}
          {!loading && renewals && renewals.length === 0 && (
            <div className="ic-panel ic-trial-full">
              <div className="ic-panel-body" style={{ textAlign: 'center', padding: '40px' }}>
                <p style={{ color: 'var(--ic-text-muted)' }}>No vendor relationships yet. Run a trial first.</p>
                <button className="ic-btn-primary" style={{ marginTop: '16px' }} onClick={() => setPhase('intake')}>Start a Trial</button>
              </div>
            </div>
          )}
          {!loading && renewals && renewals.map((r) => (
            <div key={r.caseId} className="ic-panel ic-trial-full">
              <div className="ic-panel-header">
                <div className="ic-panel-title">{r.vendor.product} — {r.domain}</div>
                <div className={`ic-panel-badge ${r.renewalAction === 'renew_and_expand' ? 'live' : r.renewalAction === 'cancel' ? 'blocked' : 'test'}`}>
                  {r.renewalAction.replace(/_/g, ' ').toUpperCase()}
                </div>
              </div>
              <div className="ic-panel-body">
                <div className="ic-metrics-grid">
                  <Metric label="Cycles" value={r.cycleCount} tone="neutral" />
                  <Metric label="Total Value" value={money.format(r.totalValue)} tone="positive" />
                  <Metric label="Cases Processed" value={r.totalCases} tone="neutral" />
                  <Metric label="Current Cap" value={money.format(r.latestSpendCap)} tone="neutral" />
                </div>
                <div style={{ marginTop: '16px', padding: '16px', background: 'var(--ic-base)', borderRadius: 'var(--ic-radius)', fontSize: '13px', lineHeight: 1.6, color: 'var(--ic-text-muted)' }}>
                  {r.renewalRecommendation}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Error Fallback ────────────────────────────────────────
  return (
    <div className="ic-trial-console">
      <Header />
      <div className="ic-intake">
        <p>Error: {error}</p>
        <button className="ic-btn-primary" onClick={() => setPhase('intake')}>Back to Intake</button>
      </div>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────
function Header({ phase, onNav, onTrial }) {
  return (
    <div className="ic-header">
      <div className="ic-brand">
        <div className="ic-brand-mark">IC</div>
        <div className="ic-brand-text">
          <strong>Agent IC</strong>
          <small>Enterprise Procurement Control Plane</small>
        </div>
      </div>
      <div className="ic-header-nav">
        <div className={`ic-nav-item ${phase === 'intake' || phase === 'result' ? 'active' : ''}`} onClick={onTrial}>Trial Console</div>
        <div className={`ic-nav-item ${phase === 'renewals' ? 'active' : ''}`} onClick={onNav}>Vendor Renewals</div>
        <div className="ic-nav-item">Evidence Ledger</div>
      </div>
    </div>
  );
}

// ─── Stage Progress Bar ──────────────────────────────────────
function StageBar({ activeStage }) {
  const activeIndex = STAGES.findIndex((s) => s.id === activeStage);
  return (
    <div className="ic-stage-bar">
      {STAGES.map((stage, i) => (
        <div
          key={stage.id}
          className={`ic-stage-item ${i < activeIndex ? 'complete' : i === activeIndex ? 'active' : ''}`}
        >
          <div className="ic-stage-dot">{i < activeIndex ? '✓' : i + 1}</div>
          <div className="ic-stage-label">{stage.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Trial Result ────────────────────────────────────────────
function TrialResult({ result, onReset }) {
  const d = result.decision;
  const vendor = result.vendor;
  const evidence = result.workerResult?.evidence || {};
  const metrics = d.metrics;
  const claims = d.claimValidation;

  return (
    <div className="ic-trial-view">
      {/* ─── Vendor Under Evaluation ─── */}
      <div className="ic-panel ic-trial-full">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Service Under Evaluation</div>
          <div className={`ic-panel-badge ${result.stripe.sessionId ? (result.stripe.testMode ? 'test' : 'live') : 'test'}`}>
            {result.stripe.sessionId ? 'Stripe Funded' : 'Awaiting Funding'}
          </div>
        </div>
        <div className="ic-panel-body">
          <div className="ic-vendor-card">
            <div className="ic-vendor-header">
              <div>
                <div className="ic-vendor-name">{vendor.product}</div>
                <div className="ic-vendor-company">
                  {vendor.name} — {vendor.productCategory}
                </div>
              </div>
              <div className="ic-vendor-pricing">{vendor.pricingModel}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Decision Hero ─── */}
      <div className="ic-panel ic-trial-full">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Procurement Decision</div>
          <div className="ic-panel-badge live">
            {d.nemotronSynthesis?.requestId ? `Nemotron Live` : 'Trial Complete'}
          </div>
        </div>
        <div className="ic-panel-body">
          <div className="ic-decision-hero">
            <div className={`ic-decision-badge ${d.verdict.toLowerCase()}`}>
              {d.verdict}
            </div>
            <p className="ic-decision-recommendation">{d.businessCase}</p>
            <div className="ic-decision-procurement">
              <ProcurementItem
                value={`${d.procurementRecommendation.valueVsVendorAsk}x`}
                label="Value vs Vendor Ask"
              />
              <ProcurementItem
                value={money.format(metrics.annualizedProjection.annualValue)}
                label="Annual Value"
              />
              <ProcurementItem
                value={money.format(metrics.profitability.netValue)}
                label="Trial Net Value"
              />
              <ProcurementItem
                value={`${metrics.riskAdjustedROI.multiple}x`}
                label="Risk-Adj ROI"
              />
              <ProcurementItem
                value={`${Math.round(metrics.wasteRatio.ratio * 100)}%`}
                label="Waste Ratio"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Enterprise Metrics ─── */}
      <div className="ic-panel">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Enterprise Metrics</div>
        </div>
        <div className="ic-panel-body">
          <div className="ic-metrics-grid">
            <Metric
              label="Net Value"
              value={money.format(metrics.profitability.netValue)}
              tone={metrics.profitability.profitable ? 'positive' : 'negative'}
              sub={`Baseline ${money.format(metrics.profitability.baselineCost)}`}
            />
            <Metric
              label="Waste Ratio"
              value={`${Math.round(metrics.wasteRatio.ratio * 100)}%`}
              tone={metrics.wasteRatio.ratio < 0.15 ? 'positive' : 'negative'}
              sub={`${metrics.wasteRatio.usefulOutputs}/${metrics.wasteRatio.totalOutputs} useful`}
            />
            <Metric
              label="Throughput"
              value={`${metrics.throughputUplift.multiple}x`}
              tone="neutral"
              sub="vs manual baseline"
            />
            <Metric
              label="Cost/Unit"
              value={`$${metrics.costPerUnit.agent}`}
              tone="positive"
              sub={`from $${metrics.costPerUnit.baseline}`}
            />
            <Metric
              label="Risk-Adj ROI"
              value={`${metrics.riskAdjustedROI.multiple}x`}
              tone={metrics.riskAdjustedROI.multiple >= 1.5 ? 'positive' : 'negative'}
              sub="after policy risk"
            />
            <Metric
              label="Annual Value"
              value={money.format(metrics.annualizedProjection.annualValue)}
              tone="neutral"
              sub={`vs ${money.format(metrics.annualizedProjection.vendorAnnualAsk)} ask`}
            />
            <Metric
              label="Opp. Cost"
              value={money.format(metrics.opportunityCost.value)}
              tone="neutral"
              sub={`${metrics.opportunityCost.hoursSaved} hrs freed`}
            />
            <Metric
              label="Time to Value"
              value={`${metrics.timeToValue.seconds}s`}
              tone="neutral"
              sub={`of ${metrics.timeToValue.totalRuntimeSeconds}s total`}
            />
          </div>
        </div>
      </div>

      {/* ─── Vendor Claims Validation ─── */}
      <div className="ic-panel">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Vendor Claims — Validated</div>
          <div className="ic-panel-badge test">
            {claims.summary.validated}/{claims.summary.total - claims.summary.informational} measurable · {claims.summary.informational} informational
          </div>
        </div>
        <div className="ic-panel-body">
          <div className="ic-vendor-claims">
            {claims.results.map((claim, i) => (
              <div key={i} className="ic-claim-row">
                <span className="ic-claim-text">{claim.claim}</span>
                <span className={`ic-claim-verdict ${claim.verdict}`}>
                  {claim.verdict === 'validated' && '✓ '}
                  {claim.verdict === 'failed' && '✗ '}
                  {claim.verdict === 'partially_met' && '△ '}
                  {claim.label}
                  {claim.measured !== undefined && claim.verdict !== 'informational'
                    ? `: ${typeof claim.measured === 'number' ? claim.measured + '%' : claim.measured}`
                    : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Blocked Action Hero ─── */}
      <div className="ic-panel ic-trial-full">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Policy Enforcement</div>
          <div className="ic-panel-badge blocked">
            Policy Blocked
          </div>
        </div>
        <div className="ic-panel-body">
          <div className="ic-blocked-hero">
            <div className="ic-blocked-hero-icon">🛡</div>
            <div className="ic-blocked-hero-title">
              {result.policyBlock.blockedTool.name} — Policy Blocked
            </div>
            <div className="ic-blocked-hero-detail">
              {result.policyBlock.blockedTool.reason}
              <br />
              <strong>Policy rule:</strong>{' '}
              <code>{result.policyBlock.blockedTool.policyRule}</code>
            </div>
            <div className="ic-blocked-hero-stats">
              {result.policyBlock.result.attemptedAmount > 0 && (
                <BlockedStat
                  value={`$${result.policyBlock.result.attemptedAmount}`}
                  label="Attempted"
                />
              )}
              <BlockedStat
                value={`$${result.spendEnvelope.cap}`}
                label="Spend Cap"
              />
              <BlockedStat
                value={result.policyBlock.result.status === 403 ? 'Blocked' : String(result.policyBlock.result.status)}
                label="Status"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Evidence ─── */}
      <div className="ic-panel">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Trial Evidence</div>
          <div className="ic-panel-badge test">NHTSA ODI Data</div>
        </div>
        <div className="ic-panel-body">
          <div className="ic-metrics-grid">
            <Metric label="Processed" value={evidence.casesProcessed || 0} tone="neutral" />
            <Metric label="Auto-Routed" value={evidence.autoRouted || 0} tone="positive" />
            <Metric label="Human Review" value={evidence.humanReviewQueue || 0} tone="neutral" />
            <Metric label="False Positives" value={evidence.falsePositives || 0} tone="negative" />
          </div>
          <div className="ic-evidence-source">
            <div className="ic-evidence-source-row">
              <span className="ic-evidence-source-label">Source:</span>
              <code className="ic-evidence-source-value">NHTSA ODI Public Complaints API</code>
            </div>
            <div className="ic-evidence-source-row">
              <span className="ic-evidence-source-label">Data Hash:</span>
              <code className="ic-evidence-source-value">{evidence.dataHash || 'N/A'}</code>
            </div>
            <div className="ic-evidence-source-row">
              <span className="ic-evidence-source-label">Worker:</span>
              <code className="ic-evidence-source-value">{evidence.source || 'worker-agent'}</code>
            </div>
            {evidence.classificationMethod && (
              <>
                <div className="ic-evidence-source-row">
                  <span className="ic-evidence-source-label">Nemotron:</span>
                  <code className="ic-evidence-source-value">
                    {evidence.classificationMethod.nemotronClassified > 0
                      ? `${evidence.classificationMethod.nemotronClassified} classified by Nemotron · ${evidence.classificationMethod.patternExtended} pattern-extended`
                      : 'Worker agent'}
                  </code>
                </div>
                {evidence.classificationMethod.nemotronRequestId && (
                  <div className="ic-evidence-source-row">
                    <span className="ic-evidence-source-label">Request ID:</span>
                    <code className="ic-evidence-source-value">{maskId(evidence.classificationMethod.nemotronRequestId)}</code>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── Playbook ─── */}
      <div className="ic-panel">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Saved Playbook</div>
          <div className="ic-panel-badge live">{result.playbook.version}</div>
        </div>
        <div className="ic-panel-body">
          <div className="ic-audit-trail">
            {result.playbook.steps.map((step, i) => (
              <div key={i} className="ic-audit-entry">
                <div className={`ic-audit-marker ${i === result.playbook.steps.length - 1 ? 'info' : 'allowed'}`} />
                <div className="ic-audit-content">
                  <div className="ic-audit-action">{step}</div>
                </div>
                <div className="ic-audit-time">{i < 9 ? `0${i + 1}` : i + 1}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Provider Receipts ─── */}
      <div className="ic-panel ic-trial-full">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Provider Receipts</div>
        </div>
        <div className="ic-provider-strip">
          <ProviderChip
            name="Stripe"
            status={result.stripe.sessionId ? 'active' : 'pending'}
            detail={result.stripe.sessionId ? 'Session created' : 'no session'}
          />
          <ProviderChip
            name="Nemotron"
            status={d.nemotronSynthesis?.requestId ? 'active' : 'pending'}
            detail={d.nemotronSynthesis?.requestId ? maskId(d.nemotronSynthesis.requestId) : 'Evaluation'}
          />
          <ProviderChip
            name="OpenShell"
            status={result.policyBlock.result.status === 403 ? 'active' : 'pending'}
            detail="Policy enforced"
          />
          <ProviderChip
            name="Hermes"
            status="active"
            detail={result.playbook.name.split('—')[1]?.trim() || 'playbook saved'}
          />
        </div>
      </div>

      {/* ─── Reset ─── */}
      <div className="ic-trial-full" style={{ textAlign: 'center', padding: '24px' }}>
        <button className="ic-btn-secondary" onClick={onReset}>
          Run Another Trial
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────
function Metric({ label, value, tone = 'neutral', sub }) {
  return (
    <div className="ic-metric-cell">
      <div className="ic-metric-label">{label}</div>
      <div className={`ic-metric-value ${tone}`}>{value}</div>
      {sub && <div className="ic-metric-sub">{sub}</div>}
    </div>
  );
}

function ProcurementItem({ value, label }) {
  return (
    <div className="ic-procurement-item">
      <div className="ic-procurement-value">{value}</div>
      <div className="ic-procurement-label">{label}</div>
    </div>
  );
}

function BlockedStat({ value, label }) {
  return (
    <div className="ic-blocked-stat">
      <div className="ic-blocked-stat-value">{value}</div>
      <div className="ic-blocked-stat-label">{label}</div>
    </div>
  );
}

function ProviderChip({ name, status, detail }) {
  return (
    <div className="ic-provider-chip">
      <div className={`ic-provider-dot ${status}`} />
      <span>{name}</span>
      <span style={{ color: 'var(--ic-text-quiet)' }}>· {detail}</span>
    </div>
  );
}

function maskId(id) {
  const text = String(id || '');
  if (text.length <= 18) return text;
  return `${text.slice(0, 12)}…${text.slice(-4)}`;
}
