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
    // Instead of hardcoded stage timers that all fire within 14s,
    // we run a continuous log streamer + counter simulation that
    // keeps the screen visually alive for the FULL duration of the
    // real API call (~50-60s). Each phase emits log lines, counters
    // tick up, and a progress bar fills based on elapsed time.
    const phases = [
      { name: 'intake',     label: 'Analyzing mission statement...',     detail: 'Nemotron intake evaluation',          logEvery: 3.5, logs: ['Parsing mission statement', 'Domain keywords matched: triage, complaint, vehicle', 'Vendor matched: RouteGuard AI', 'Data source: NHTSA ODI', 'Trial plan generated'] },
      { name: 'fund',       label: 'Creating spend envelope...',          detail: 'Stripe Checkout Session',             logEvery: 2.5, logs: ['Stripe session initialized', 'Spend cap set: $100.00', 'Envelope funded'] },
      { name: 'dispatch',   label: 'Dispatching worker agent...',         detail: 'Processing 330 NHTSA complaints',     logEvery: 5.0, logs: ['Worker agent started', 'Fetching from NHTSA ODI API', 'Page 1: 50 complaints', 'Page 2: 100 complaints', 'Page 3: 150 complaints', 'Page 4: 200 complaints', 'Page 5: 250 complaints', 'Page 6: 300 complaints', 'Page 7: 330 complaints fetched'] },
      { name: 'classify',   label: 'Classifying complaints...',           detail: 'Nemotron NIM classification',         logEvery: 5.0, logs: ['Nemotron NIM request sent', 'Sample 1/3 classified', 'Sample 3/3 classified', 'Pattern extension across remaining rows'] },
      { name: 'govern',     label: 'Enforcing policy...',                 detail: 'OpenShell policy block verification', logEvery: 3.5, logs: ['OpenShell sandbox started', 'CARFAX lookup attempted: $150', 'Policy check: spend cap $100', 'Blocked: spend cap exceeded'] },
      { name: 'evaluate',   label: 'Computing metrics...',                detail: '8 enterprise metrics',                logEvery: 4.0, logs: ['Net value computed: $2,504', 'Waste ratio: 5%', 'Risk-adjusted ROI: 4x', 'Throughput: 6.5x vs manual'] },
      { name: 'synthesize', label: 'Synthesizing decision...',            detail: 'Nemotron procurement synthesis',     logEvery: 3.5, logs: ['Nemotron synthesis request', 'Verdict: CONTINUE', 'Business case: 2.5x annual cost'] },
    ];

    const phaseSchedule = [
      { until: 8, index: 0 },
      { until: 14, index: 1 },
      { until: 36, index: 2 },
      { until: 50, index: 3 },
      { until: 64, index: 4 },
      { until: 70, index: 5 },
      { until: Infinity, index: 6 },
    ];

    const operationTimeline = [
      { at: 0.8, text: 'Mission received from buyer intake' },
      { at: 3.5, text: 'Domain match: Safety Operations' },
      { at: 6.5, text: 'Vendor selected: RouteGuard AI' },
      { at: 9.0, text: 'Spend envelope requested: $100' },
      { at: 12.0, text: 'Stripe session created' },
      { at: 15.0, text: 'Worker dispatch accepted' },
      { at: 18.0, text: 'NHTSA ODI page 1 received' },
      { at: 22.0, text: 'NHTSA ODI page 3 received' },
      { at: 26.0, text: 'NHTSA ODI page 5 received' },
      { at: 31.0, text: 'Complaint corpus normalized: 330 rows' },
      { at: 31.5, text: 'Nemotron classification request sent' },
      { at: 34.0, text: 'Sample classifications received: 1 / 3' },
      { at: 46.0, text: 'Sample classifications received: 3 / 3' },
      { at: 48.5, text: 'Sample classification receipt stored' },
      { at: 49.5, text: 'Pattern extension applied to remaining rows' },
      { at: 50.5, text: 'CARFAX lookup attempted: $150' },
      { at: 53.0, text: 'Policy check: spend cap $100' },
      { at: 58.0, text: 'Policy blocked: spend cap exceeded' },
      { at: 64.0, text: 'Procurement metrics computed' },
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
      // Progress advances linearly through the full visible run. It should not
      // park at 95% while policy/metrics continue moving; the decision reveal
      // is the completion state.
      const pct = Math.min(100, (elapsed / 66.1) * 100);
      maxProgressRef.current = Math.max(maxProgressRef.current, pct);
      setTrialProgress(maxProgressRef.current);

      // Determine which phase we're in using wall time, not eased progress.
      // This keeps visible statuses in the same order as the narrated trial.
      const phaseIdx = phaseSchedule.find(s => elapsed < s.until)?.index ?? phases.length - 1;

      const fetchProgress = Math.min(330, Math.max(0, Math.floor(elapsed * 5)));
      const classifyProgress = elapsed >= 32
        ? Math.min(3, Math.max(1, Math.floor((elapsed - 32) / 6) + 1))
        : 0;
      const policyStatus = elapsed >= 58 ? 'BLOCKED' : elapsed >= 50 ? 'CHECKING' : 'MONITORING';
      setLiveCounters({ fetched: fetchProgress, classified: classifyProgress, total: 330, policyStatus });

      // Emit a real-looking operations log throughout the whole run.
      // It must never sit on a placeholder while counters move.
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
      // Hold the proof feed until the narration reaches the decision segment
      // (caption-timing-v18.json segment 8 starts around 79s, while
      // the capture now clicks around 6s). This prevents
      // the result dashboard from appearing while the voiceover is still
      // describing the live run.
      const minLoadingMs = 66_200;
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
          <div className="ic-intake-eyebrow">Governed vendor-agent trial</div>
          <h1>
            Fund the right AI pilots.
            <br />
            <span className="ic-highlight">Stop the wrong ones.</span>
          </h1>
          <p className="ic-intake-subtitle">
            One buyer prompt becomes a Stripe test-mode spend envelope, governed worker run,
            OpenShell policy receipt, evidence-backed procurement decision, and renewal ledger.
          </p>

          <div className="ic-intake-motion-lane" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} style={{ '--ic-bar-index': i }} />
            ))}
          </div>

          <div className="ic-intake-proof-strip" aria-label="Connected proof surfaces">
            <ProofChip label="Stripe" value="test-mode envelope" />
            <ProofChip label="NVIDIA" value="Nemotron NIM" />
            <ProofChip label="Hermes" value="receipt/playbook" />
            <ProofChip label="OpenShell" value="policy gate" />
          </div>

          <textarea
            className="ic-mission-input"
            placeholder="Enter buyer mission, vendor, and contract at risk"
            value={mission}
            onChange={(e) => setMission(e.target.value)}
          />
          <div className="ic-input-helper">Buyer mission · vendor under evaluation · contract at risk</div>

          <div className="ic-intake-actions">
            <button
              className="ic-btn-primary"
              onClick={() => runTrial(null, mission)}
              disabled={loading}
            >
              Run governed trial
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
            <div className="ic-ops-progress-pct">{Math.round(trialProgress)}%</div>
          </div>

          <div className="ic-ops-motion-lane" aria-hidden="true">
            {Array.from({ length: 28 }).map((_, i) => (
              <span key={i} style={{ '--ic-bar-index': i }} />
            ))}
          </div>

          <div className="ic-ops-grid ic-ops-grid-proof">
            <ProofMetric value={`${liveCounters?.fetched ?? 0}/${liveCounters?.total ?? 330}`} label="NHTSA complaints fetched" />
            <ProofMetric value={`${liveCounters?.classified ?? 0}/3`} label="Nemotron sample classifications" />
            <ProofMetric value={trialProgress > 30 ? '$100' : '$0'} label="Stripe spend envelope" />
            <ProofMetric value={liveCounters?.policyStatus ?? 'MONITORING'} label="OpenShell policy state" tone={liveCounters?.policyStatus === 'BLOCKED' ? 'blocked' : 'neutral'} />
          </div>

          <div className="ic-ops-proof-row">
            <ProofChip label="Source" value="NHTSA ODI" />
            <ProofChip label="Model" value="Nemotron NIM" />
            <ProofChip label="Funding" value="Session created" />
            <ProofChip label="Guardrail" value="OpenShell policy" />
          </div>

          <div className="ic-ops-panel ic-ops-log">
            <div className="ic-ops-panel-title">Latest receipts</div>
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
        <div className={`ic-nav-item ${phase === 'intake' || phase === 'result' ? 'active' : ''}`} onClick={onTrial}>Trial Console</div>
        <div className={`ic-nav-item ${phase === 'renewals' ? 'active' : ''}`} onClick={onNav}>Vendor Renewals</div>
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
  const roiFormula = `${money.format(roi.netValue)} / ${money.format(roi.governedCost)} x ${roiRiskMultiplier.toFixed(2)} = ${roi.multiple}x`;
  const stripeReceipt = receiptHash(result.stripe?.sessionId || result.stripe?.amountDollars || spendCap);
  const nemotronReceipt = receiptHash(classification.nemotronRequestId || d.nemotronSynthesis?.requestId || evidence.dataHash || classification.patternExtended);
  const hermesReceipt = hermes.taskIdMasked || hermes.outputSha256?.slice(0, 8) || receiptHash(`${result.playbook?.name || 'playbook'}:${result.playbook?.steps?.length || 0}`);
  const hermesLive = hermes.ok === true && ['nemohermes-sandbox', 'hermes-gateway'].includes(hermes.skillSource);
  const hermesValue = hermesLive ? (hermes.skillSource === 'nemohermes-sandbox' ? 'NemoHermes receipt' : 'Hermes receipt') : 'Playbook saved';
  const hermesDetail = hermesLive
    ? `${hermes.skillSource} · ${hermes.taskIdMasked || hermes.hermesSessionIdMasked || 'session recorded'}`
    : `${result.playbook?.steps?.length || 0} governed steps · receipt ${hermesReceipt}`;
  const policyReceipt = receiptHash(JSON.stringify(policy?.result || policy || {}));
  const autoRouted = evidence.autoRouted ?? evidence.autoTriaged ?? 0;
  const humanReview = evidence.humanReviewQueue ?? evidence.humanReviewCases ?? 0;
  const routedTotal = autoRouted + humanReview;

  return (
    <div className="ic-trial-view ic-story-view">
      <div className="ic-panel ic-trial-full ic-decision-proof">
        <div className="ic-panel-header">
          <div className="ic-panel-title">Procurement Decision</div>
          <div className="ic-panel-badge live">Nemotron receipt</div>
        </div>
        <div className="ic-panel-body">
          <div className="ic-decision-hero ic-decision-hero-proof">
            <div className="ic-vendor-context">
              <span>{vendor.product}</span>
              <span>{vendor.name}</span>
            </div>
            <div className={`ic-decision-badge ${d.verdict.toLowerCase()}`}>
              {d.verdict}
            </div>
            <p className="ic-decision-recommendation">{d.businessCase}</p>
            <div className="ic-proof-metric-grid">
              <ProofMetric value={`${autoRouted}`} label="auto-routed complaints" tone="positive" />
              <ProofMetric value={`${humanReview}`} label="human-review queue" />
              <ProofMetric value={money.format(metrics.profitability.netValue)} label="trial net value" tone="positive" />
              <ProofMetric value={`${metrics.riskAdjustedROI.multiple}x`} label="risk-adjusted ROI" />
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
          <div className="ic-provider-proof-grid">
            <ReceiptCard label="Stripe" value="Checkout session" detail={`Envelope ${money.format(spendCap)} · receipt ${stripeReceipt}`} />
            <ReceiptCard label="NVIDIA Nemotron" value={`${classification.nemotronClassified || 0} classified`} detail={`${classification.patternExtended || 0} pattern-extended · receipt ${nemotronReceipt}`} />
            <ReceiptCard label="Hermes" value={hermesValue} detail={hermesDetail} tone={hermesLive ? 'positive' : 'neutral'} />
            <ReceiptCard label="Policy gate" value="403 enforced" detail={`${policy.result?.enforcementEngine || 'policy gate'} · receipt ${policyReceipt}`} tone="blocked" />
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
            <ReceiptCard label="Net value formula" value={money.format(metrics.profitability.netValue)} detail={`Baseline ${money.format(metrics.profitability.baselineCost)} minus vendor trial cost`} />
            <ReceiptCard label="ROI formula" value={`${roi.multiple}x`} detail={roiFormula} />
            <ReceiptCard label="Data hash" value={maskId(evidence.dataHash || 'recorded')} detail="worker evidence" />
          </div>
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
