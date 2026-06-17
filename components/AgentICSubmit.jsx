'use client';

import { useEffect, useMemo, useState } from 'react';
import { seededProposals } from '../lib/demoData.js';
import './submit-v7.css';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat('en-US');

const STAGE_DELAYS = [0, 3000, 5500, 8000, 10500, 13000, 16000, 19000, 22000];

export default function AgentICSubmit() {
  const [proposal] = useState(seededProposals[0]);
  const [payload, setPayload] = useState(null);
  const [counterPayload, setCounterPayload] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [qaAgreement, setQaAgreement] = useState(91);

  const displayedPayload = counterPayload || payload;
  const stages = useMemo(() => {
    const base = displayedPayload?.stages || [];
    if (counterPayload && counterPayload.decision?.verdict === 'KILL') {
      return [
        ...base,
        {
          id: 'counterfactual',
          label: 'Counterfactual KILL',
          status: 'blocked',
          detail: `QA lowered to ${counterPayload.evidence?.qaAgreement}% · decision flips to KILL`,
          ts: new Date().toISOString(),
        },
      ];
    }
    return base;
  }, [displayedPayload, counterPayload]);

  useEffect(() => {
    if (activeIndex < 0 || activeIndex >= stages.length - 1) return;
    const next = stages.findIndex((_, i) => i > activeIndex);
    if (next === -1) return;
    const delay = Math.max(2500, (STAGE_DELAYS[next] || next * 3000) - (STAGE_DELAYS[activeIndex] || activeIndex * 3000));
    const timer = setTimeout(() => setActiveIndex(next), delay);
    return () => clearTimeout(timer);
  }, [activeIndex, stages.length]);

  function resetAndShow(data, isCounter) {
    if (isCounter) {
      setCounterPayload(data);
      setActiveIndex(0);
    } else {
      setPayload(data);
      setCounterPayload(null);
      setActiveIndex(0);
    }
  }

  async function runExperiment(overrideQa) {
    setLoading(true);
    try {
      const body = { proposalId: proposal.id };
      if (Number.isFinite(overrideQa)) body.qaAgreement = overrideQa;
      const response = await fetch('/api/run-capital-experiment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      return data;
    } finally {
      setLoading(false);
    }
  }

  async function startRun() {
    const data = await runExperiment();
    resetAndShow(data, false);
  }

  async function runCounterfactual() {
    const data = await runExperiment(qaAgreement);
    resetAndShow(data, true);
  }

  const visibleStages = stages.slice(0, activeIndex + 1);
  const currentStage = stages[activeIndex] || null;

  return (
    <main className="submit-shell">
      {activeIndex < 0 && !displayedPayload && (
        <section className="submit-hero" data-stage="hero">
          <div className="submit-brand">
            <span className="brand-orb">IC</span>
            <strong>Agent IC</strong>
          </div>
          <h1>Agents need capital controls before they can run businesses.</h1>
          <p className="submit-lead">
            Agent IC gives autonomous agents a bounded spend envelope, blocks unsafe actions,
            measures real outcomes, and decides whether they earned more capital.
          </p>
          <div className="submit-cta">
            <button className="primary" onClick={startRun} disabled={loading} data-testid="run-capital-experiment">
              {loading ? 'Running…' : 'Run capital experiment'}
            </button>
          </div>
        </section>
      )}

      {displayedPayload && (
        <>
          <StageStepper stages={stages} activeIndex={activeIndex} />
          <div className="stage-panels">
            {visibleStages.map((stage, idx) => (
              <StagePanel
                key={`${displayedPayload.runId}-${stage.id}`}
                stage={stage}
                payload={displayedPayload}
                isActive={idx === activeIndex}
                qaAgreement={qaAgreement}
                setQaAgreement={setQaAgreement}
                onRerun={runCounterfactual}
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function StageStepper({ stages, activeIndex }) {
  return (
    <nav className="stage-stepper" aria-label="Experiment stages">
      {stages.map((stage, i) => (
        <div
          key={stage.id}
          className={`stage-step ${i === activeIndex ? 'active' : i < activeIndex ? 'complete' : ''}`}
          data-stage={stage.id}
        >
          <span className="stage-dot" />
          <span className="stage-label">{stage.label}</span>
        </div>
      ))}
    </nav>
  );
}

function StagePanel({ stage, payload, isActive, qaAgreement, setQaAgreement, onRerun }) {
  const { envelope, blocked, evidence, decision, sandbox, stripeSkill, skills, hermesPlaybook } = payload;
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const panelContent = () => {
    switch (stage.id) {
      case 'mission':
        return (
          <div className="stage-panel mission-panel">
            <div className="panel-header">
              <span className="panel-eyebrow">Mission</span>
              <h2>{payload.mission?.company}: {payload.mission?.title}</h2>
            </div>
            <p className="stage-summary">{payload.mission?.description}</p>
            <div className="mission-grid">
              <div className="mission-detail">
                <h3>Duration</h3>
                <p>{payload.mission?.durationHours} hours</p>
              </div>
              <div className="mission-detail">
                <h3>Allowed tools</h3>
                <div className="tool-pills">
                  {payload.mission?.allowedTools?.map((tool) => (
                    <span key={tool} className="tool-pill allowed">{tool}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      case 'sandbox':
        return (
          <div className="stage-panel sandbox-panel">
            <div className="panel-header">
              <span className="panel-eyebrow">OpenShell Sandbox</span>
              <h2>{sandbox?.runtime || 'NemoClaw / OpenShell sandbox'}</h2>
            </div>
            <div className="terminal-window">
              <div className="terminal-line"><span className="terminal-prompt">$</span> openshell create --proposal {payload.inputHash}</div>
              <div className="terminal-line"><span className="terminal-success">✓</span> Sandbox ready</div>
              <div className="terminal-line"><span className="terminal-success">✓</span> Network policy: {sandbox?.networkPolicy}</div>
              <div className="terminal-line"><span className="terminal-success">✓</span> Credential broker: {sandbox?.credentialBroker}</div>
              <div className="terminal-line"><span className="terminal-prompt">$</span> openshell invariant list</div>
              {sandbox?.invariants?.slice(0, 3).map((inv, i) => (
                <div key={i} className="terminal-line indent">• {inv}</div>
              ))}
            </div>
          </div>
        );
      case 'envelope':
      case 'stripe':
        return (
          <div className="stage-panel spend-panel">
            <div className="panel-header">
              <span className="panel-eyebrow">Spend envelope</span>
              <h2>Bounded capital before work begins</h2>
            </div>
            <div className="spend-grid">
              <div className="spend-card"><span className="spend-label">Approved cap</span><span className="spend-value">{money.format(envelope?.cap || 0)}</span></div>
              <div className="spend-card"><span className="spend-label">Session amount</span><span className="spend-value">{money.format(envelope?.spent || 0)}</span></div>
              <div className="spend-card blocked"><span className="spend-label">Renewal</span><span className="spend-value">BLOCKED</span></div>
              <div className="spend-card"><span className="spend-label">Scope</span><span className="spend-value">Approved SaaS only</span></div>
            </div>
            <div className="stripe-receipt">
              <div className="receipt-row"><span>session_id</span><code>{payload.stripe?.sessionId}</code></div>
              <div className="receipt-row"><span>client_reference_id</span><code>{payload.stripe?.clientReferenceId}</code></div>
              <div className="receipt-row"><span>cap</span><code>{money.format(envelope?.cap || 0)}</code></div>
              <div className="receipt-row"><span>mode</span><code>{payload.stripe?.mode}</code></div>
            </div>
          </div>
        );
      case 'stripeSkill':
        return (
          <div className="stage-panel skill-panel">
            <div className="panel-header">
              <span className="panel-eyebrow">Stripe Skill</span>
              <h2>{stripeSkill?.displayName}</h2>
            </div>
            <p className="stage-summary">{stripeSkill?.action}</p>
            <div className="skill-grid">
              <div className="skill-card"><span className="skill-label">Amount</span><span className="skill-value">{money.format(stripeSkill?.amount || 0)}</span></div>
              <div className="skill-card"><span className="skill-label">Merchant</span><span className="skill-value">{stripeSkill?.merchant}</span></div>
              <div className="skill-card"><span className="skill-label">Approval</span><span className="skill-value">{stripeSkill?.approvalGate}</span></div>
              <div className="skill-card"><span className="skill-label">Status</span><span className="skill-value approved">{stripeSkill?.status}</span></div>
            </div>
          </div>
        );
      case 'blocked':
        return (
          <div className="stage-panel blocked-panel">
            <div className="panel-header">
              <span className="panel-eyebrow danger">Blocked action</span>
              <h2>Unsafe spend stopped before money moved</h2>
            </div>
            <div className="terminal-window danger">
              <div className="terminal-line"><span className="terminal-prompt">$</span> agent buy {blocked?.attemptedTool} --amount {money.format(blocked?.attemptedAmount || 0)}</div>
              <div className="terminal-line"><span className="terminal-error">✗</span> POST {payload.sandbox?.blockedCall?.host}{payload.sandbox?.blockedCall?.path}</div>
              <div className="terminal-line"><span className="terminal-error">✗</span> {payload.sandbox?.blockedCall?.status} Forbidden — {payload.sandbox?.blockedCall?.policy}</div>
              <div className="terminal-line"><span className="terminal-error">✗</span> {blocked?.stripeResult}</div>
            </div>
            <div className="blocked-drama">
              <div className="blocked-badge">DENIED</div>
              <p><strong>{blocked?.attemptedTool}</strong> — {money.format(blocked?.attemptedAmount || 0)}/mo</p>
              <p>{blocked?.detail}</p>
            </div>
          </div>
        );
      case 'evidence':
        return (
          <div className="stage-panel evidence-panel">
            <div className="panel-header">
              <span className="panel-eyebrow">Evidence</span>
              <h2>Capital earned by measured outcomes</h2>
            </div>
            <div className="evidence-grid">
              <div className="evidence-card"><span className="evidence-label">Cases processed</span><span className="evidence-value">{number.format(evidence?.casesProcessed || 0)}</span></div>
              <div className="evidence-card"><span className="evidence-label">Auto-triaged</span><span className="evidence-value">{number.format(evidence?.autoTriaged || 0)}</span></div>
              <div className="evidence-card"><span className="evidence-label">QA agreement</span><span className="evidence-value">{evidence?.qaAgreement}%</span></div>
              <div className="evidence-card continue"><span className="evidence-label">Net value</span><span className="evidence-value">{money.format(evidence?.netValue || 0)}</span></div>
            </div>
          </div>
        );
      case 'skills':
        return (
          <div className="stage-panel skills-panel">
            <div className="panel-header">
              <span className="panel-eyebrow">Hermès skills</span>
              <h2>Multi-skill workflow inside the envelope</h2>
            </div>
            <div className="skills-list">
              {skills?.map((skill) => (
                <div key={skill.name} className="skill-row">
                  <div className="skill-meta">
                    <strong>{skill.displayName}</strong>
                    <span>{skill.action}</span>
                  </div>
                  <div className="skill-result">
                    <span>{skill.result}</span>
                    <span className="skill-amount">{skill.amount ? money.format(skill.amount) : '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'decision':
        return (
          <div className="stage-panel decision-panel">
            <div className="panel-header">
              <span className="panel-eyebrow continue">Capital decision</span>
              <h2>Budget earned, not recommended</h2>
            </div>
            <div className="decision-hero">
              <div className="decision-badge continue">{decision?.verdict}</div>
              <p className="decision-reason">Evidence positive. No critical incidents. One unsafe spend blocked.</p>
            </div>
            <div className="decision-grid">
              <div className="decision-card"><span className="decision-label">Next cap</span><span className="decision-value">{money.format(decision?.nextCap || 0)}</span></div>
              <div className="decision-card"><span className="decision-label">Autonomy</span><span className="decision-value">{decision?.autonomy}</span></div>
              <div className="decision-card"><span className="decision-label">Playbook</span><span className="decision-value">{hermesPlaybook?.name}</span></div>
            </div>
            <div className="counterfactual-controls">
              <label>QA agreement threshold</label>
              <input
                type="range"
                min="70"
                max="100"
                value={qaAgreement}
                onChange={(e) => setQaAgreement(Number(e.target.value))}
              />
              <span>{qaAgreement}%</span>
              <button className="danger-btn" onClick={onRerun} data-testid="run-counterfactual">
                Rerun experiment
              </button>
            </div>
          </div>
        );
      case 'counterfactual':
        return (
          <div className="stage-panel counterfactual-panel">
            <div className="panel-header">
              <span className="panel-eyebrow danger">Counterfactual</span>
              <h2>Lower QA threshold → decision flips to KILL</h2>
            </div>
            {payload?.decision?.verdict === 'KILL' && (
              <div className="decision-hero kill">
                <div className="decision-badge kill">KILL</div>
                <p className="decision-reason">Evidence grade below B+ after week 4. Capital frozen.</p>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section className={`stage-viewport ${isActive ? 'active' : 'past'}`} data-stage={stage.id}>
      {panelContent()}
    </section>
  );
}
