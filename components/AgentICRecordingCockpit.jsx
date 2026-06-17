'use client';

import { useEffect, useRef, useState } from 'react';
import { seededProposals } from '../lib/demoData.js';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat('en-US');

const STAGES = ['mission', 'envelope', 'stripe', 'blocked', 'evidence', 'decision'];

export default function AgentICRecordingCockpit({ initialProposal, recordingMode = false }) {
  const STAGE_DWELL_MS = recordingMode ? 8000 : 3400;
  const [proposal, setProposal] = useState(initialProposal);
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [qaAgreement, setQaAgreement] = useState(91);
  const [envelopeCap, setEnvelopeCap] = useState(100);
  const [activeStage, setActiveStage] = useState(null);
  const [savedSkill, setSavedSkill] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const timersRef = useRef([]);

  const canRun = !loading;

  async function runExperiment(nextProposal = proposal) {
    setLoading(true);
    setError(null);
    setRun(null);
    setActiveStage(null);
    setSavedSkill(null);
    setLogLines([]);
    clearTimers();

    try {
      const response = await fetch('/api/run-capital-experiment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposalId: nextProposal.id,
          qaAgreement,
          envelopeCap,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
      setRun(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function savePlaybook(payload) {
    try {
      const response = await fetch('/api/save-playbook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposalId: payload.mission?.company || proposal.id,
          version: 'v1',
          playbook: payload.hermesPlaybook,
        }),
      });
      const result = await response.json();
      if (response.ok) setSavedSkill(result);
    } catch {
      // Non-fatal: the UI can still show the playbook metadata.
    }
  }

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  useEffect(() => {
    if (!run) return;
    clearTimers();
    setActiveStage('mission');
    setLogLines([run.stages[0]]);
    let index = 0;

    function advance() {
      if (index >= STAGES.length - 1) return;
      const nextIndex = index + 1;
      const t = setTimeout(() => {
        index = nextIndex;
        const stageId = STAGES[index];
        setActiveStage(stageId);
        setLogLines((prev) => {
          const stage = run.stages.find((s) => s.id === stageId);
          return stage ? [stage, ...prev].slice(0, 6) : prev;
        });
        if (stageId === 'decision') {
          savePlaybook(run);
        }
        advance();
      }, STAGE_DWELL_MS);
      timersRef.current.push(t);
    }

    advance();
    return () => clearTimers();
  }, [run]);

  function reuseOn(nextProposal) {
    setProposal(nextProposal);
    runExperiment(nextProposal);
  }

  const isPreRun = !run && !loading;

  return (
    <main className="recording-cockpit">
      <div className="cockpit-shell">
        <header className="cockpit-header">
          <div className="brand-mark">
            <span className="brand-orb">IC</span>
            <div>
              <strong>Agent IC</strong>
              <small>Hermes × Nemotron × Stripe</small>
            </div>
          </div>
          <div className="counterfactual-bar">
            <label>
              <span>QA agreement</span>
              <input
                type="range"
                min="75"
                max="100"
                value={qaAgreement}
                onChange={(e) => setQaAgreement(Number(e.target.value))}
                disabled={loading}
              />
              <b>{qaAgreement}%</b>
            </label>
            <label>
              <span>Envelope cap</span>
              <input
                type="range"
                min="20"
                max="200"
                step="10"
                value={envelopeCap}
                onChange={(e) => setEnvelopeCap(Number(e.target.value))}
                disabled={loading}
              />
              <b>{money.format(envelopeCap)}</b>
            </label>
            <button
              className="run-button"
              onClick={() => runExperiment()}
              disabled={!canRun}
              data-testid="run-capital-experiment"
            >
              {loading ? 'Running…' : 'Run capital experiment'}
            </button>
          </div>
        </header>

        {error && <div className="cockpit-error">{error}</div>}

        {isPreRun && (
          <div className="pre-run-state">
            <h1>Agents can now spend money. Agent IC is the governed capital account that lets them operate safely.</h1>
            <p>
              This is a seeded case study, not a hard-coded outcome. The envelope, block, spend ledger,
              evidence, and decision are generated live by Agent IC. Change the cap or QA threshold, then
              run the experiment.
            </p>
          </div>
        )}

        {run && (
          <div className="stage-layout">
            <div className="stage-main">
              <Stepper activeStage={activeStage} />
              <StageCard
                activeStage={activeStage}
                run={run}
                envelopeCap={envelopeCap}
                savedSkill={savedSkill}
                onReuse={reuseOn}
              />
            </div>
            <aside className="stage-sidebar">
              <div className="sidebar-section">
                <div className="card-label">Evaluator</div>
                <div className={`evaluator-badge ${run.nemotron?.state || 'fallback'}`}>
                  {run.nemotron?.badge || 'Deterministic fallback'}
                </div>
              </div>
              <div className="sidebar-section">
                <div className="card-label">OpenShell sandbox</div>
                <div className="sandbox-status">
                  <span className="status-dot ready" />
                  {run.sandbox?.status || 'ready'}
                </div>
                <p className="sandbox-policy">{run.sandbox?.networkPolicy}</p>
              </div>
              <div className="sidebar-section log-section">
                <div className="card-label">Live audit log</div>
                <div className="log-list">
                  {logLines.map((line, i) => (
                    <div key={`${line.id}-${i}`} className={`log-row ${line.status}`}>
                      <span>{line.label}</span>
                      <small>{line.detail}</small>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

function Stepper({ activeStage }) {
  const activeIndex = STAGES.indexOf(activeStage);
  return (
    <div className="stepper">
      {STAGES.map((id, idx) => {
        const state = idx < activeIndex ? 'done' : idx === activeIndex ? 'active' : 'pending';
        return (
          <div key={id} className={`step ${state}`} data-step={id}>
            <span>{idx + 1}</span>
            <small>{id}</small>
          </div>
        );
      })}
    </div>
  );
}

function StageCard({ activeStage, run, envelopeCap, savedSkill, onReuse }) {
  return (
    <div className="stage-card" data-stage={activeStage || 'empty'}>
      {activeStage === 'mission' && <MissionStage run={run} proposal={run?.mission} />}
      {activeStage === 'envelope' && <EnvelopeStage run={run} />}
      {activeStage === 'stripe' && <StripeStage run={run} envelopeCap={envelopeCap} />}
      {activeStage === 'blocked' && <BlockedStage run={run} />}
      {activeStage === 'evidence' && <EvidenceStage run={run} />}
      {activeStage === 'decision' && (
        <DecisionStage run={run} savedSkill={savedSkill} onReuse={onReuse} />
      )}
    </div>
  );
}

function MissionStage({ run, proposal }) {
  const mission = run?.mission || proposal;
  if (!mission) return null;
  return (
    <>
      <div className="card-label">Mission</div>
      <h2>{mission.description}</h2>
      <div className="card-meta">
        <span>{mission.durationHours} hours</span>
        <span>{mission.company}</span>
      </div>
      <div className="card-list">
        <div className="list-section">
          <strong>Allowed tools</strong>
          <ul>
            {mission.allowedTools.map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
        </div>
        <div className="list-section">
          <strong>Kill criteria</strong>
          <ul>
            {mission.killCriteria.slice(0, 3).map((criterion, i) => (
              <li key={i}>{criterion}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function EnvelopeStage({ run }) {
  const cap = run?.envelope?.cap ?? 0;
  const spent = run?.envelope?.spent ?? 0;
  const remaining = run?.envelope?.remaining ?? 0;
  return (
    <>
      <div className="card-label">Spend envelope</div>
      <div className="envelope-values">
        <BigValue label="Approved cap" value={run ? money.format(cap) : '—'} />
        <BigValue label="Spent" value={run ? money.format(spent) : '—'} />
        <BigValue label="Remaining" value={run ? money.format(remaining) : '—'} />
      </div>
      <div className="card-footer">
        <span className="status-pill">Renewal: {run?.envelope?.renewal || 'blocked'}</span>
        <span className="status-pill">{run?.envelope?.allowedToolCount || 0} allowed tools</span>
      </div>
    </>
  );
}

function StripeStage({ run, envelopeCap }) {
  const skill = run?.stripeSkill;
  return (
    <>
      <div className="card-label">Stripe authorization</div>
      <div className="stripe-id">{run?.stripe?.sessionId || 'No session yet'}</div>
      <div className="stripe-meta">
        <div>
          <span>client_reference_id</span>
          <strong>{run?.stripe?.clientReferenceId || run?.mission?.company}</strong>
        </div>
        <div>
          <span>cap</span>
          <strong>{run ? money.format(run.envelope.cap) : money.format(envelopeCap)}</strong>
        </div>
        <div>
          <span>mode</span>
          <strong>{run?.stripe?.mode || 'test/demo'}</strong>
        </div>
        <div>
          <span>recurring spend</span>
          <strong>blocked</strong>
        </div>
      </div>
      {skill && (
        <div className="skill-receipt">
          <div className="skill-header">
            <strong>{skill.displayName}</strong>
            <span className="status-pill">{skill.status}</span>
          </div>
          <p>{skill.action}</p>
          <div className="skill-facts">
            <div>
              <span>Amount</span>
              <strong>{skill.amount === 0 ? 'Free tier' : money.format(skill.amount)}</strong>
            </div>
            <div>
              <span>Merchant</span>
              <strong>{skill.merchant}</strong>
            </div>
            <div>
              <span>Approval</span>
              <strong>{skill.approvalGate}</strong>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BlockedStage({ run }) {
  const blocked = run?.blocked;
  const sandbox = run?.sandbox;
  return (
    <>
      <div className="card-label">Blocked action</div>
      <div className="denied-badge">DENIED</div>
      <h2>{blocked?.attemptedTool || 'Out-of-policy tool request'}</h2>
      <p className="blocked-reason">{blocked?.detail || 'The agent attempted an action outside the approved tool scope.'}</p>
      <div className="blocked-facts">
        <div>
          <span>Attempted</span>
          <strong>{run ? money.format(blocked.attemptedAmount) : '—'}</strong>
        </div>
        <div>
          <span>Cap</span>
          <strong>{run ? money.format(blocked.cap) : '—'}</strong>
        </div>
        <div>
          <span>Stripe result</span>
          <strong>{blocked?.stripeResult || 'No session created'}</strong>
        </div>
        <div>
          <span>Policy</span>
          <strong>{blocked?.policyBreach || 'tool_scope_violation'}</strong>
        </div>
      </div>
      {sandbox?.blockedCall && (
        <div className="sandbox-log">
          <div className="log-line">
            <span>POST</span>
            <code>{sandbox.blockedCall.host}{sandbox.blockedCall.path}</code>
          </div>
          <div className="log-line">
            <span>status</span>
            <code className="danger">{sandbox.blockedCall.status} Forbidden</code>
          </div>
          <div className="log-line">
            <span>policy</span>
            <code>{sandbox.blockedCall.policy}</code>
          </div>
          <div className="log-line detail">{sandbox.blockedCall.detail}</div>
        </div>
      )}
    </>
  );
}

function EvidenceStage({ run }) {
  const evidence = run?.evidence || {};
  return (
    <>
      <div className="card-label">Evidence imported</div>
      <div className="evidence-grid">
        <BigValue label="Cases processed" value={number.format(evidence.casesProcessed || 0)} />
        <BigValue label="Auto-triaged" value={number.format(evidence.autoTriaged || 0)} />
        <BigValue label="QA agreement" value={`${evidence.qaAgreement || 0}%`} />
        <BigValue label="Hours saved" value={evidence.hoursSaved || 0} />
        <BigValue label="Gross value" value={money.format(evidence.grossValue || 0)} />
        <BigValue label="Net value" value={money.format(evidence.netValue || 0)} />
      </div>
      <div className="card-footer">
        <span className="status-pill">{evidence.criticalIncidents || 0} critical incidents</span>
        <span className="status-pill">{money.format(evidence.spendConsumed || 0)} spent</span>
      </div>
    </>
  );
}

function DecisionStage({ run, savedSkill, onReuse }) {
  const verdict = run?.decision?.verdict || 'PENDING';
  return (
    <>
      <div className="card-label">Capital decision</div>
      <div className={`verdict ${verdict.toLowerCase()}`}>{verdict}</div>
      <div className="decision-facts">
        <BigValue label="Next cap" value={run ? money.format(run.decision.nextCap) : '—'} />
        <BigValue label="Autonomy" value={run?.decision?.autonomy || '—'} />
      </div>
      <div className="decision-threshold">QA threshold: {run?.decision?.qaThreshold ?? 85}%</div>
      <div className="playbook-line">
        <span>Hermes playbook saved</span>
        <code>{savedSkill?.filename || run?.hermesPlaybook?.name || 'bounded-capital-experiment-v1'}</code>
        {savedSkill?.filepath && (
          <small className="skill-path">{savedSkill.filepath}</small>
        )}
      </div>
      <div className="reuse-row">
        <span>Reuse on another mission:</span>
        <div className="reuse-buttons">
          {seededProposals.slice(1).map((p) => (
            <button key={p.id} className="reuse-button" onClick={() => onReuse(p)}>
              {p.company}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function BigValue({ label, value }) {
  return (
    <div className="big-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
