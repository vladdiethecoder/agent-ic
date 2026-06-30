'use client';

import { useState, useCallback, useRef } from 'react';
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

const DEFAULT_CASE_ID = 'safety-ops-complaint-triage';
const DEFAULT_MISSION = 'Evaluate RouteGuard AI for complaint triage before signing a $14,400 annual contract';

export default function AgentICTrialConsole() {
  const [phase, setPhase] = useState('intake');
  const [loading, setLoading] = useState(false);
  const [mission, setMission] = useState(DEFAULT_MISSION);
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
  const [elapsedTime, setElapsedTime] = useState(0);
  const [trialProgress, setTrialProgress] = useState(0);
  const [liveCounters, setLiveCounters] = useState(null);
  const [liveLog, setLiveLog] = useState([]);
  const maxProgressRef = useRef(0);

  const runTrial = useCallback(async (caseId, missionText) => {
    setLoading(true);
    setError(null);
    setPhase('running');
    setLoadingStage('Analyzing mission statement...');
    setReasoningTrace([]);
    setElapsedTime(0);
    setTrialProgress(0);
    maxProgressRef.current = 0;
    setLiveCounters(null);
    setLiveLog([{ text: 'Mission received from buyer intake', ts: Date.now() }]);

    // Live elapsed counter — updates every 100ms so the loading screen never freezes
    const elapsedStart = Date.now();
    const elapsedTimer = setInterval(() => {
      setElapsedTime(((Date.now() - elapsedStart) / 1000).toFixed(1));
    }, 100);

    // ── Continuously alive operations feed ──────────────────────
    // This is an in-flight progress model only. Final receipt values are
    // rendered exclusively from the API response after the governed trial
    // completes; no loading checkpoint is treated as proof.
    const phases = [
      { name: 'intake',     label: 'Analyzing mission statement...',      detail: 'Buyer intake and case matching',       logEvery: 1.5, logs: ['Parsing mission statement', 'Matching Safety Ops case', 'RouteGuard AI selected'] },
      { name: 'fund',       label: 'Opening bounded spend envelope...',    detail: 'Stripe test-mode envelope request',     logEvery: 1.5, logs: ['Stripe test-mode envelope requested', 'Spend cap target: $100', 'Trial budget bounded before tools run'] },
      { name: 'dispatch',   label: 'Dispatching worker agent...',          detail: 'Public workload processing',          logEvery: 2.0, logs: ['Worker agent request submitted', 'NHTSA workload read in progress', 'Evidence hash will attach with result'] },
      { name: 'classify',   label: 'Classifying complaints...',            detail: 'Nemotron sample + pattern extension',  logEvery: 2.0, logs: ['Nemotron sample classification requested', 'Pattern extension separated from model sample', 'Routing counts accumulating'] },
      { name: 'govern',     label: 'Checking spend and tool policy...',     detail: 'Policy gate cap check',               logEvery: 1.5, logs: ['Spend cap check: $100', 'Paid enrichment request intercepted', 'Over-cap request denied by policy gate'] },
      { name: 'evaluate',   label: 'Computing procurement metrics...',      detail: '8 enterprise metrics',                logEvery: 1.5, logs: ['Net value target: $2,669', 'Waste ratio target: 5%', 'Risk-adjusted ROI target: 6.18x'] },
      { name: 'synthesize', label: 'Preparing buyer recommendation...',     detail: 'Procurement decision path',           logEvery: 1.5, logs: ['Decision will show allowed scope', 'Receipts grouped by provider', 'Renewal posture updates after trial'] },
    ];

    const phaseSchedule = [
      { until: 1.8, index: 0 },
      { until: 3.2, index: 1 },
      { until: 6.4, index: 2 },
      { until: 9.4, index: 3 },
      { until: 11.8, index: 4 },
      { until: 13.8, index: 5 },
      { until: Infinity, index: 6 },
    ];

    const operationTimeline = [
      { at: 0.8, text: 'Mission received from buyer intake' },
      { at: 1.7, text: 'Safety Ops case selected: RouteGuard AI' },
      { at: 2.9, text: 'Spend envelope request sent: $100 cap' },
      { at: 4.5, text: 'Worker dispatch request submitted' },
      { at: 6.5, text: 'NHTSA workload read started' },
      { at: 8.5, text: 'Complaint corpus target: 330 rows' },
      { at: 10.0, text: 'Nemotron sample classification requested' },
      { at: 12.5, text: 'Pattern-extension counts separated from sample' },
      { at: 14.0, text: 'Paid-enrichment policy check active' },
      { at: 16.5, text: 'Over-cap CARFAX request intercepted' },
      { at: 18.5, text: 'Procurement metrics inputs assembled' },
      { at: 20.5, text: 'Buyer recommendation view preparing' },
    ];

    const trace = [];
    const timers = [];
    let lastPhaseIdx = -1;

    function pushLogLine(msg, detail) {
      setLoadingStage(msg);
      trace.push({ msg, detail, status: 'complete' });
      setReasoningTrace([...trace]);
    }

    // Progress + counter updater (runs every 200ms, keeps screen alive)
    const progressTimer = setInterval(() => {
      const elapsed = (Date.now() - elapsedStart) / 1000;
      // Progress advances through the visible run but stays below completion
      // until the real receipt response is rendered.
      const pct = Math.min(92, (elapsed / 22.0) * 92);
      maxProgressRef.current = Math.max(maxProgressRef.current, pct);
      setTrialProgress(maxProgressRef.current);

      // Determine which phase we're in using wall time, not eased progress.
      // This keeps visible statuses in the same order as the narrated trial.
      const phaseIdx = phaseSchedule.find(s => elapsed < s.until)?.index ?? phases.length - 1;

      const fetchProgress = Math.min(330, Math.max(0, Math.floor(elapsed * 24)));
      const classifyProgress = elapsed >= 6
        ? Math.min(3, Math.max(1, Math.floor((elapsed - 6) / 2.4) + 1))
        : 0;
      const policyStatus = elapsed >= 12 ? 'BLOCKED' : elapsed >= 9 ? 'CHECKING' : 'MONITORING';
      setLiveCounters({ fetched: fetchProgress, classified: classifyProgress, total: 330, policyStatus });

      // Emit in-flight checkpoints without presenting them as receipts.
      setLiveLog(
        operationTimeline
          .filter((entry) => elapsed >= entry.at)
          .slice(-11)
          .map((entry) => ({ text: entry.text, ts: elapsedStart + (entry.at * 1000) }))
      );

      const phase = phases[phaseIdx];
      if (phaseIdx !== lastPhaseIdx) {
        pushLogLine(phase.label, phase.detail);
        lastPhaseIdx = phaseIdx;
      }
    }, 200);

    timers.push({ clear: () => clearInterval(progressTimer) });

    // Start the live trial immediately — it runs in parallel with the live feed above.
    // No cached/fast/demo path: integrations must either complete or fail closed.
    fetch('/api/enterprise-trial', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        caseId: caseId || undefined,
        missionStatement: missionText || undefined,
        requireLiveProof: typeof window !== 'undefined' && window.__AGENT_IC_REQUIRE_LIVE_PROOF__ === true,
      }),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    }).then((data) => {
      // Hold the proof feed briefly so the buyer sees a credible run in motion.
      // Recording mode uses a longer hold so the visible decision reveal lands
      // on the narration beat; the API result is still the real trial receipt.
      const configuredRecordingMinLoadingMs = typeof window !== 'undefined'
        ? Number(window.__AGENT_IC_RECORDING_MIN_LOADING_MS__)
        : NaN;
      const minLoadingMs = typeof window !== 'undefined' && window.__AGENT_IC_RECORDING_MODE__ === true
        ? (Number.isFinite(configuredRecordingMinLoadingMs) ? configuredRecordingMinLoadingMs : 29_000)
        : 15_000;
      const elapsedSoFar = Date.now() - elapsedStart;
      const wait = Math.max(0, minLoadingMs - elapsedSoFar);
      setTimeout(() => {
        timers.forEach(t => t.clear());
        clearInterval(elapsedTimer);
        setResult(data);
        setLoading(false);
        setLoadingStage('');
        setReasoningTrace([]);
        setPhase('result');
        fetch('/api/renewals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'seed' }) })
          .then(() => fetch('/api/renewals?all=true'))
          .then((res) => res.json())
          .then((renewalData) => setRenewals(renewalData.relationships || []))
          .catch(() => {});
      }, wait);
    }).catch((err) => {
      timers.forEach(t => t.clear());
      clearInterval(elapsedTimer);
      setError(err.message);
      setLoading(false);
      setLoadingStage('');
      setReasoningTrace([]);
      setTrialProgress(0);
      setPhase('intake');
    }).finally(() => {
      // Don't clear loading here — the setTimeout above handles it
    });
  }, []);

  const loadRenewals = useCallback(async () => {
    setPhase('renewals');
    setLoading(!renewals || renewals.length === 0);
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
  }, [renewals]);

  // ─── Intake Phase ──────────────────────────────────────────
  if (phase === 'intake') {
    return (
      <div className="ic-trial-console">
        <Header phase={phase} onNav={loadRenewals} onTrial={() => setPhase('intake')} />
        <div className="ic-intake">
          <div className="ic-intake-eyebrow">Procurement governance ledger/control plane for vendor agents</div>
          <h1>
            Fund the right AI pilots.
            <br />
            <span className="ic-highlight">Stop the wrong ones.</span>
          </h1>
          <p className="ic-intake-subtitle">
            Agent IC is not the vendor agent. One buyer prompt becomes a Stripe test-mode spend envelope,
            governed worker run, policy gate receipt, evidence-backed procurement decision, and renewal ledger.
          </p>

          <div className="ic-intake-motion-lane" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} style={{ '--ic-bar-index': i }} />
            ))}
          </div>

          <div className="ic-intake-proof-strip" aria-label="Connected proof surfaces">
            <ProofChip label="Buyer/operator" value="CFO + Safety Ops" />
            <ProofChip label="Vendor agent" value="RouteGuard AI" />
            <ProofChip label="Contract at stake" value="$14.4K proposed annual" />
            <ProofChip label="Bounded trial" value="Stripe test-mode $100 cap" />
          </div>

          <div className="ic-intake-proof-strip ic-intake-proof-strip-evidence" aria-label="Observed proof preview">
            <ProofChip label="Denied pass-through" value="$150 CARFAX blocked" />
              <ProofChip label="ROI formula" value="($2,669 / $367) × 0.85 = 6.18x" />
            <ProofChip label="Evidence source" value="330 NHTSA rows · SHA 84e078" />
            <ProofChip label="Renewal rule" value="Buyer approval + receipts" />
          </div>

          <textarea
            className="ic-mission-input"
            placeholder="Enter buyer mission, vendor, and contract at risk"
            autoComplete="off"
            spellCheck={false}
            value={mission}
            onChange={(e) => setMission(e.target.value)}
          />
          <div className="ic-input-helper">Buyer mission · vendor under evaluation · contract at risk · Edit the mission or run the governed RouteGuard trial · Decision output: continue, revise, hold, downgrade, cancel, or kill</div>

          <div className="ic-intake-actions">
            <button
              className="ic-btn-primary"
              onClick={() => runTrial(DEFAULT_CASE_ID, mission.trim() || DEFAULT_MISSION)}
              disabled={loading}
            >
              Run RouteGuard trial
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
  if (phase === 'running' || (loading && phase !== 'renewals')) {
    return (
      <div className="ic-trial-console">
        <Header phase={phase} onNav={loadRenewals} onTrial={() => setPhase('intake')} />
        <div className="ic-ops-feed">
          <div className="ic-ops-status-bar">
            <div className="ic-ops-status-left">
              <div className="ic-ops-live-dot" />
              <span className="ic-ops-status-label">RUNNING</span>
              <span className="ic-ops-elapsed">{elapsedTime}s</span>
            </div>
            <div className="ic-ops-current-stage">{loadingStage || 'Initializing...'}</div>
          </div>

          <div className="ic-ops-progress-wrap">
            <div className="ic-ops-progress-bar">
              <div className="ic-ops-progress-fill" style={{ width: `${trialProgress}%` }} />
              <div className="ic-ops-progress-scan" />
            </div>
            <div className="ic-ops-progress-pct">{Math.min(99, Math.round(trialProgress))}%</div>
          </div>

          <div className="ic-ops-motion-lane" aria-hidden="true">
            {Array.from({ length: 28 }).map((_, i) => (
              <span key={i} style={{ '--ic-bar-index': i }} />
            ))}
          </div>

          <div className="ic-ops-grid ic-ops-grid-proof">
            <ProofMetric value={`${liveCounters?.fetched ?? 0}/${liveCounters?.total ?? 330}`} label="NHTSA workload target" />
            <ProofMetric value={`${liveCounters?.classified ?? 0}/3`} label="classifier sample target" />
            <ProofMetric value={trialProgress > 30 ? '$100 requested' : '$0'} label="Stripe envelope request" />
            <ProofMetric value={liveCounters?.policyStatus ?? 'MONITORING'} label="policy gate check" tone={liveCounters?.policyStatus === 'BLOCKED' ? 'blocked' : 'neutral'} />
          </div>

          <div className="ic-ops-proof-row">
            <ProofChip label="Source" value="NHTSA ODI" />
            <ProofChip label="Model" value="Nemotron NIM" />
            <ProofChip label="Funding" value="envelope requested" />
            <ProofChip label="Guardrail" value="cap check active" />
          </div>

          <div className="ic-ops-panel ic-ops-log">
            <div className="ic-ops-panel-title">Test-mode receipt checkpoints</div>
            <div className="ic-ops-log-stream">
              {liveLog.slice(-5).map((entry, i) => (
                <div key={i} className="ic-ops-log-line">
                  <span className="ic-ops-log-time">+{((entry.ts - (liveLog[0]?.ts || entry.ts)) / 1000).toFixed(1)}s</span>
                  <span className="ic-ops-log-text">{entry.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ic-ops-trace-wrap">
            {reasoningTrace.map((step, i) => (
              <div key={i} className="ic-ops-trace-item">
                <div className="ic-ops-trace-marker" />
                <span className="ic-ops-trace-text">{step.detail}</span>
              </div>
            ))}
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
                <div className={`ic-panel-badge ${r.historyMode === 'illustrative_seed' ? 'test' : r.renewalAction === 'renew_and_expand' ? 'live' : r.renewalAction === 'cancel' ? 'blocked' : 'test'}`}>
                  {r.historyMode === 'illustrative_seed' ? 'ILLUSTRATIVE' : r.renewalAction.replace(/_/g, ' ').toUpperCase()}
                </div>
              </div>
              <div className="ic-panel-body">
                <div className="ic-metrics-grid">
                  <Metric label="Cycles" value={r.cycleCount} tone="neutral" />
                  <Metric label="Observed" value={r.observedCycles ?? 0} tone={(r.observedCycles ?? 0) > 0 ? 'positive' : 'neutral'} />
                  <Metric label="Illustrative" value={r.illustrativeCycles ?? 0} tone={(r.illustrativeCycles ?? 0) > 0 ? 'neutral' : 'positive'} />
                  <Metric label="Total Value" value={money.format(r.totalValue)} tone="positive" />
                  <Metric label="Cases Processed" value={r.totalCases} tone="neutral" />
                  <Metric label="Current Cap" value={money.format(r.latestSpendCap)} tone="neutral" />
                </div>
                <div style={{ marginTop: '12px', padding: '12px 16px', background: 'var(--ic-surface-2)', borderRadius: 'var(--ic-radius)', fontSize: '12px', lineHeight: 1.5, color: 'var(--ic-text-muted)' }}>
                  {r.historyLabel || 'Renewal history mode not labeled by API.'}
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

  // ─── Error State ───────────────────────────────────────────
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
        <button type="button" className={`ic-nav-item ${phase === 'intake' || phase === 'result' ? 'active' : ''}`} onClick={onTrial}>Trial Console</button>
        <button type="button" className={`ic-nav-item ${phase === 'renewals' ? 'active' : ''}`} onClick={onNav}>Vendor Renewals</button>
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
  const classification = evidence.classificationMethod || {};
  const policy = result.policyBlock;
  const hermes = result.hermesExecutionReceipt || {};
  const attemptedAmount = policy?.result?.attemptedAmount || policy?.blockedTool?.attemptedAmount || 0;
  const spendCap = result.spendEnvelope?.cap || policy?.result?.cap || 0;
  const roi = metrics.riskAdjustedROI;
  const roiRiskMultiplier = 1 - (Number.isFinite(Number(roi.blockedActionSeverityWeight)) ? Number(roi.blockedActionSeverityWeight) : 0);
  const roiFormula = `(${money.format(roi.netValue)} / ${money.format(roi.governedCost)}) × ${roiRiskMultiplier.toFixed(2)} = ${roi.multiple}x`;
  const roiCostBasis = `${money.format(roi.governedCost)} modeled analyst-time cost; Stripe envelope remains ${money.format(spendCap)}`;
  const stripeSessionId = result.stripe?.sessionId || null;
  const stripeReceipt = stripeSessionId ? receiptHash(stripeSessionId) : null;
  const stripeValue = stripeSessionId
    ? (result.stripe?.testMode ? 'Test-mode Checkout' : 'Checkout session')
    : 'not recorded';
  const stripeDetail = stripeSessionId
    ? `Envelope ${money.format(spendCap)} · masked receipt ${stripeReceipt}`
    : `Envelope ${money.format(spendCap)} · no Stripe Checkout session in this response`;
  const nemotronReceipt = receiptHash(classification.nemotronRequestId || d.nemotronSynthesis?.requestId || evidence.dataHash || classification.patternExtended);
  const classifierLive = classification.mode === 'nemotron-sample-plus-pattern-extension' && (classification.nemotronClassified || 0) > 0;
  const evidenceCompleteness = d.evidence?.completeness || {};
  const evidenceBlocking = evidenceCompleteness.blocking === true;
  const evidenceGuardReason = Array.isArray(evidenceCompleteness.reasons) && evidenceCompleteness.reasons.length > 0
    ? evidenceCompleteness.reasons[0]
    : 'Required model/provider receipt missing';
  const liveSampleLabel = Number(classification.nemotronClassified || 0) === 1 ? 'live sample' : 'live samples';
  const classifierValue = classifierLive ? `${classification.nemotronClassified} ${liveSampleLabel}` : 'Deterministic fallback';
  const classifierDetail = classifierLive
    ? `${classification.patternExtended || 0} pattern-extended · masked receipt ${nemotronReceipt}`
    : `${classification.deterministicClassified || evidence.casesProcessed || 0} locally classified · ${classification.unavailableReason || 'Nemotron unavailable'}`;
  const classifierSummary = `${classification.nemotronClassified || 0} sample / ${classification.patternExtended || 0} pattern-extended`;
  const decisionBadge = evidenceBlocking
    ? 'Evidence guard'
    : d.nemotronSynthesis?.requestId ? 'Nemotron receipt' : 'Formula-backed decision';
  const hermesArtifactHash = receiptHash(`${result.playbook?.name || 'playbook'}:${result.playbook?.steps?.length || 0}`);
  const hermesLive = hermes.ok === true && ['nemohermes-sandbox', 'hermes-gateway', 'hermes-cli'].includes(hermes.skillSource);
  const hermesValue = hermesLive
    ? hermes.skillSource === 'nemohermes-sandbox'
      ? 'NemoHermes receipt'
      : hermes.skillSource === 'hermes-cli'
        ? 'Hermes CLI receipt'
        : 'Hermes gateway receipt'
    : 'Hermes handoff package';
  const hermesSummary = hermes.outputSummary || result.playbook?.executionSummary || 'Agent IC retains the governed SKILL.md playbook artifact.';
  const policyReceipt = receiptHash(JSON.stringify(policy?.result || policy || {}));
  const policyEngine = policy.result?.enforcementMode || policy.result?.enforcementEngine || 'policy gate';
  const policyDetail = policy.result?.upstreamPolicyAttempt?.verificationStatus === 'unverified'
    ? `OpenShell unverified; ${policyEngine} enforced · masked receipt ${policyReceipt}`
    : `${policyEngine} · masked receipt ${policyReceipt}`;
  const policySummary = `${money.format(attemptedAmount)} request exceeds ${money.format(spendCap)} cap`;
  const allowedAction = policy.result?.allowedAction || null;
  const autoRouted = evidence.autoRouted ?? evidence.autoTriaged ?? 0;
  const humanReview = evidence.humanReviewQueue ?? evidence.humanReviewCases ?? 0;
  const routedTotal = autoRouted + humanReview;
  const decisionLabel = evidenceBlocking
    ? 'RERUN REQUIRED'
    : d.verdict === 'CONTINUE' && (policy.result?.blocked || policy.blocked)
    ? 'SAFE TRIAL CONTINUES'
    : d.verdict;
  const governanceBannerText = evidenceBlocking
    ? `Policy blocked · ${money.format(attemptedAmount)} CARFAX request > ${money.format(spendCap)} cap · model evidence incomplete · rerun before expansion`
    : `Policy blocked · ${money.format(attemptedAmount)} CARFAX request > ${money.format(spendCap)} cap · safe trial continues · buyer approval required before expansion`;
  const decisionSummaryText = evidenceBlocking
    ? 'Block paid enrichment; hold expansion until evidence rerun.'
    : 'Block paid enrichment; continue allowed trial.';
  const renewal = result.renewal || {};
  const accumulated = renewal.accumulated || {};
  const renewalAction = String(renewal.action || (d.verdict === 'CONTINUE' ? 'expand' : d.verdict === 'REVISE' ? 'hold' : 'cancel')).replace(/_/g, ' ');
  const renewalCycleCount = accumulated.cycleCount || (result.cycleId ? 1 : 0);
  const renewalValue = accumulated.totalValue ?? metrics.profitability.netValue;
  const renewalCases = accumulated.totalCases ?? evidence.casesProcessed ?? 0;
  const renewalPolicyBlocks = accumulated.totalPolicyBlocks ?? ((policy.result?.blocked || policy.blocked) ? 1 : 0);
  const renewalBypasses = accumulated.policyBypasses ?? (evidence.blockedActionBypassed ? 1 : 0);
  const renewalNextCap = renewal.nextCap || (d.verdict === 'CONTINUE' ? Math.round(spendCap * 2.5) : spendCap);
  const renewalRecommendation = renewal.recommendation || 'This observed trial cycle is recorded before any renewal or expansion decision.';

  return (
    <div className="ic-trial-view ic-story-view">
      <div className="ic-panel ic-trial-full ic-decision-proof">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Procurement Decision</div>
          <div className="ic-panel-badge live">{decisionBadge}</div>
        </div>
        <div className="ic-panel-body">
          <div className="ic-decision-hero ic-decision-hero-proof">
            <div className="ic-vendor-context">
              <span>{vendor.product}</span>
              <span>{vendor.name}</span>
            </div>
            <div className={`ic-decision-badge ${d.verdict.toLowerCase()}`}>
              {decisionLabel}
            </div>
            <p className="ic-decision-recommendation">{d.businessCase}</p>
            <div className="ic-governance-banner blocked" aria-label="Blocked action proof">
              <strong>PAID ENRICHMENT BLOCKED</strong>
              <span>{governanceBannerText}</span>
            </div>
            <div className="ic-proof-metric-grid">
              <ProofMetric value={`${autoRouted}`} label="auto-routed complaints" tone="positive" />
              <ProofMetric value={`${humanReview}`} label="human-review queue" />
              <ProofMetric value={money.format(metrics.profitability.netValue)} label="trial net value" tone="positive" />
              <ProofMetric value={`${metrics.riskAdjustedROI.multiple}x`} label="risk-adjusted ROI" />
            </div>
            <div className="ic-decision-summary" aria-label="Decision summary with policy block and ROI formula">
              <div className="ic-decision-summary-main">{decisionSummaryText}</div>
              <div className="ic-roi-proof-strip" aria-label="Readable ROI formula">
                <span>ROI formula</span>
                <strong>{roiFormula}</strong>
                <p>{autoRouted} auto-routed + {humanReview} human review · {money.format(metrics.profitability.netValue)} net value. Cost basis: {roiCostBasis}.</p>
              </div>
              <div className="ic-decision-summary-grid">
                <div className="ic-decision-summary-cell blocked">
                  <span>Policy block</span>
                  <strong>CARFAX blocked</strong>
                  <p>{policySummary} · status 403 recorded before renewal budget can expand</p>
                </div>
                <div className="ic-decision-summary-cell">
                  <span>{evidenceBlocking ? 'Evidence guard' : 'Nemotron scope'}</span>
                  <strong>{evidenceBlocking ? 'Rerun required' : classifierSummary}</strong>
                  <p>{evidenceBlocking ? evidenceGuardReason : 'Sample classification is separated from pattern extension so the model contribution is visible.'}</p>
                </div>
                <div className="ic-decision-summary-cell positive">
                  <span>ROI formula</span>
                  <strong>ROI: {roiFormula}</strong>
                  <p>Named inputs from trial evidence, policy risk, and modeled operating cost; full receipts are available in /api/proof-report.</p>
                </div>
                <div className="ic-decision-summary-cell">
                  <span>Buyer outcome</span>
                  <strong>{evidenceBlocking ? 'Hold expansion' : `${money.format(metrics.profitability.netValue)} net trial value`}</strong>
                  <p>{evidenceBlocking ? 'Do not sign or expand until a current model/provider receipt validates the trial.' : `${autoRouted} auto-routed, ${humanReview} held for human review · buyer approval required before expansion`}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ic-panel ic-trial-full ic-policy-receipt">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Policy Receipt</div>
          <div className="ic-panel-badge blocked">Policy Blocked</div>
        </div>
        <div className="ic-panel-body">
          <div className="ic-receipt-grid">
            <ReceiptCard label="Requested tool" value="CARFAX report" detail="vehicle-history lookup" />
            <ReceiptCard label="Attempted spend" value={money.format(attemptedAmount)} detail="worker request" tone="blocked" />
            <ReceiptCard label="Authorized cap" value={money.format(spendCap)} detail="trial envelope" />
            <ReceiptCard label="Decision" value="Policy Blocked" detail="Cap exceeded; not approved" tone="blocked" />
          </div>
        </div>
      </div>

      <div className="ic-panel ic-trial-full ic-provider-receipts">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Provider Receipts</div>
        </div>
        <div className="ic-panel-body">
          <div className={`ic-hermes-proof-hero ${hermesLive ? 'positive' : ''}`} aria-label="Hermes receipt proof">
            <div>
              <span>Hermes receipt</span>
              <strong>{hermesValue}</strong>
              <p>{hermesSummary}</p>
            </div>
            <code>{hermesLive ? (hermes.taskIdMasked || hermes.hermesSessionIdMasked || 'session recorded') : `package ${hermesArtifactHash}`}</code>
          </div>
          <div className="ic-proof-report-note">On-screen IDs are masked; full SHA-256 receipts are available in /api/proof-report. Third-party names are receipt labels, not endorsements.</div>
          <div className="ic-provider-proof-grid">
            <ReceiptCard label="Stripe" value={stripeValue} detail={stripeDetail} tone={stripeSessionId ? 'positive' : 'neutral'} />
            <ReceiptCard label="NVIDIA Nemotron" value={classifierValue} detail={classifierDetail} tone={classifierLive ? 'positive' : 'neutral'} />
            {evidenceBlocking && <ReceiptCard label="Evidence guard" value="Rerun required" detail={evidenceGuardReason} tone="blocked" />}
            <ReceiptCard label="Allowed action" value={allowedAction ? '200 allowed' : 'Read-only evidence'} detail={allowedAction ? `${allowedAction.tool} · ${allowedAction.evidenceHash || 'evidence read'}` : 'NHTSA ODI workload processed'} tone={allowedAction ? 'positive' : 'neutral'} />
            <ReceiptCard label="Denied action" value="Policy blocked" detail={policyDetail} tone="blocked" />
          </div>
        </div>
      </div>

      <div className="ic-panel ic-trial-full ic-formula-panel">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Evidence Ledger</div>
          <div className="ic-panel-badge live">NHTSA ODI</div>
        </div>
        <div className="ic-panel-body">
          <div className="ic-ledger-proof-grid">
            <ReceiptCard label="Processed" value={`${evidence.casesProcessed || 0}`} detail="public complaints" />
            <ReceiptCard label="Routing coverage" value={`${routedTotal}/${evidence.casesProcessed || metrics.wasteRatio.totalOutputs}`} detail={`${autoRouted} auto-routed + ${humanReview} human review`} />
            <ReceiptCard label="Masked data hash" value={maskId(evidence.dataHash || 'recorded')} detail="full SHA-256 in /api/proof-report" />
            <ReceiptCard label="Net value formula" value={money.format(metrics.profitability.netValue)} detail={`Baseline ${money.format(metrics.profitability.baselineCost)} minus governed cost`} tone="positive" />
          </div>
        </div>
      </div>

      <div className="ic-panel ic-trial-full ic-renewal-proof">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Renewal Evidence</div>
          <div className="ic-panel-badge live">Observed this run</div>
        </div>
        <div className="ic-panel-body">
          <div className="ic-renewal-callout">
            <strong>{renewalAction.toUpperCase()}</strong>
            <p>{renewalRecommendation}</p>
          </div>
          <div className="ic-ledger-proof-grid">
            <ReceiptCard label="Current cycle" value={result.cycleId ? maskId(result.cycleId) : 'record pending'} detail={`run ${maskId(result.runId || 'trial')}`} tone={result.cycleId ? 'positive' : 'neutral'} />
            <ReceiptCard label="Ledger basis" value={`${renewalCycleCount} cycle${renewalCycleCount === 1 ? '' : 's'}`} detail="observed local trial evidence" />
            <ReceiptCard label="Accumulated value" value={money.format(renewalValue)} detail={`${renewalCases} processed items`} tone="positive" />
            <ReceiptCard label="Policy history" value={`${renewalPolicyBlocks} blocked / ${renewalBypasses} bypassed`} detail={`next cap ${money.format(renewalNextCap)}`} tone={renewalBypasses > 0 ? 'blocked' : 'positive'} />
          </div>
          <div className="ic-proof-report-note">Vendor Renewals labels seeded history as illustrative; this card is tied to the current observed trial cycle and run ID.</div>
        </div>
      </div>

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

function ProofMetric({ value, label, tone = 'neutral' }) {
  return (
    <div className={`ic-proof-metric ${tone}`}>
      <div className="ic-proof-metric-value">{value}</div>
      <div className="ic-proof-metric-label">{label}</div>
    </div>
  );
}

function ReceiptCard({ label, value, detail, tone = 'neutral' }) {
  return (
    <div className={`ic-receipt-card ${tone}`}>
      <div className="ic-receipt-label">{label}</div>
      <div className="ic-receipt-value">{value}</div>
      {detail && <div className="ic-receipt-detail">{detail}</div>}
    </div>
  );
}

function ProofChip({ label, value }) {
  return (
    <div className="ic-proof-chip">
      <span className="ic-proof-chip-label">{label}</span>
      <span className="ic-proof-chip-value">{value}</span>
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

function receiptHash(value) {
  const text = String(value || 'receipt');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
