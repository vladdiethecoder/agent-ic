'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import './admin-console.css';

const DEFAULT_CASE = 'safety-ops-complaint-triage';

export default function AgentICAdminConsole() {
  const [tenantId, setTenantId] = useState('demo-tenant');
  const [tenants, setTenants] = useState([]);
  const [newTenantName, setNewTenantName] = useState('Acme Production Tenant');
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(null);
  const [proof, setProof] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [activePolicy, setActivePolicy] = useState(null);
  const [trials, setTrials] = useState([]);
  const [payments, setPayments] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [telemetryExport, setTelemetryExport] = useState(null);
  const [slo, setSlo] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [incidentTitle, setIncidentTitle] = useState('Quarterly alert drill');
  const [memberships, setMemberships] = useState([]);
  const [memberUserId, setMemberUserId] = useState('operator-1');
  const [memberRole, setMemberRole] = useState('operator');
  const [exportBundle, setExportBundle] = useState(null);
  const [reconcileSessionId, setReconcileSessionId] = useState('');
  const [sessionStatus, setSessionStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('agent-ic-admin-token') || '';
    setToken(saved);
  }, []);

  const headers = useMemo(() => {
    const h = { 'content-type': 'application/json' };
    const csrf = cookieValue('agent_ic_csrf');
    if (csrf) h['x-agent-ic-csrf'] = csrf;
    if (token.trim()) h.authorization = `Bearer ${token.trim()}`;
    return h;
  }, [token]);

  const api = useCallback(async (path, options = {}) => {
    const sep = path.includes('?') ? '&' : '?';
    const scoped = path.startsWith('/api/') && !path.includes('tenantId=') ? `${path}${sep}tenantId=${encodeURIComponent(tenantId)}` : path;
    const res = await fetch(scoped, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.code || `HTTP ${res.status}`);
    return data;
  }, [headers, tenantId]);

  const refresh = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const [readyData, proofData, approvalData, policyData, trialData, paymentData, alertData, sloData, incidentData, membershipData, tenantData] = await Promise.all([
        api('/api/ready'),
        api('/api/proof-report'),
        api('/api/approvals'),
        api(`/api/policies?caseId=${DEFAULT_CASE}`),
        api('/api/trials'),
        api('/api/payments'),
        api('/api/alerts'),
        api('/api/slo'),
        api('/api/incidents'),
        api('/api/memberships'),
        api('/api/tenants'),
      ]);
      setReady(readyData);
      setProof(proofData);
      setApprovals(approvalData.approvals || []);
      setPolicies(policyData.policies || []);
      setActivePolicy(policyData.activePolicy || null);
      setTrials(trialData.trials || []);
      setPayments(paymentData.events || []);
      setAlerts(alertData.alerts || null);
      setSlo(sloData.slo || null);
      setIncidents(incidentData.incidents || []);
      setMemberships(membershipData.memberships || []);
      setTenants(tenantData.tenants || []);
      setMessage(`Refreshed ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);



  async function upsertTenant() {
    await mutate('Upserted tenant registry entry', () => api('/api/tenants', {
      method: 'POST',
      body: JSON.stringify({ action: 'upsert', tenantId, name: newTenantName }),
    }));
  }

  function saveToken() {
    localStorage.setItem('agent-ic-admin-token', token.trim());
    setMessage('Saved local admin token for this browser. In production this should come from SSO/OIDC.');
  }

  async function createBrowserSession() {
    if (!token.trim()) {
      setError('Paste a signed JWT before creating a browser session.');
      return;
    }
    await mutate('Created HttpOnly browser session from signed identity token', async () => {
      const data = await api('/api/session', { method: 'POST', body: JSON.stringify({ provider: 'oidc-token-exchange' }) });
      setSessionStatus(data);
    });
  }

  async function loadBrowserSession() {
    await mutate('Loaded browser session status', async () => {
      const data = await api('/api/session');
      setSessionStatus(data);
    });
  }

  async function logoutBrowserSession() {
    await mutate('Logged out browser session', async () => {
      const res = await fetch('/api/session', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.code || `HTTP ${res.status}`);
      setSessionStatus(data);
      setToken('');
      localStorage.removeItem('agent-ic-admin-token');
    });
  }

  async function requestApproval() {
    await mutate('Requested spend approval', () => api('/api/approvals', {
      method: 'POST',
      body: JSON.stringify({ action: 'request', tenantId, caseId: DEFAULT_CASE, spendCap: 100, reason: 'Operator console request' }),
    }));
  }


  async function upsertMember() {
    await mutate('Upserted tenant membership', () => api('/api/memberships', {
      method: 'POST',
      body: JSON.stringify({ action: 'upsert', tenantId, userId: memberUserId, role: memberRole, displayName: memberUserId }),
    }));
  }

  async function deactivateMember(userId) {
    await mutate('Deactivated tenant membership', () => api('/api/memberships', {
      method: 'POST',
      body: JSON.stringify({ action: 'deactivate', tenantId, userId }),
    }));
  }

  async function decideApproval(id, action) {
    await mutate(`${action}d approval`, () => api('/api/approvals', {
      method: 'POST',
      body: JSON.stringify({ action, tenantId, approvalId: id, reason: `Operator console ${action}` }),
    }));
  }

  async function createPolicy() {
    await mutate('Created policy draft', () => api('/api/policies', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', tenantId, caseId: DEFAULT_CASE, notes: 'Operator console draft' }),
    }));
  }

  async function activatePolicy(id) {
    await mutate('Activated policy', () => api('/api/policies', {
      method: 'POST',
      body: JSON.stringify({ action: 'activate', tenantId, policyId: id }),
    }));
  }

  async function generateExport() {
    await mutate('Generated evidence export bundle', async () => {
      const data = await api('/api/export');
      setExportBundle(data.bundle);
    });
  }

  async function createIncidentDrill() {
    await mutate('Created incident review drill evidence', () => api('/api/incidents', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', tenantId, title: incidentTitle, severity: 'warning', sourceAlertId: 'quarterly-alert-drill', runbook: 'docs/runbooks/slo-review.md', summary: 'Operator-created alert drill evidence from admin console.', drill: true, evidence: { source: 'admin-console' } }),
    }));
  }

  async function closeIncident(id) {
    await mutate('Closed incident review', () => api('/api/incidents', {
      method: 'POST',
      body: JSON.stringify({ action: 'update', tenantId, incidentId: id, status: 'closed', correctiveAction: 'Reviewed in admin console.' }),
    }));
  }

  async function exportTelemetryDryRun() {
    await mutate('Prepared telemetry export dry-run', async () => {
      const data = await api('/api/telemetry/export', { method: 'POST', body: JSON.stringify({ dryRun: true }) });
      setTelemetryExport(data.telemetry);
    });
  }

  async function reconcilePayment(eventId) {
    if (!reconcileSessionId.trim()) {
      setError('Paste a Stripe Checkout Session ID before reconciling payment state.');
      return;
    }
    await mutate('Reconciled Stripe payment state', () => api('/api/payments', {
      method: 'POST',
      body: JSON.stringify({ action: 'reconcile', tenantId, eventId, sessionId: reconcileSessionId.trim() }),
    }));
  }

  async function simulatePolicy(id) {
    await mutate('Simulated policy block', () => api('/api/policies', {
      method: 'POST',
      body: JSON.stringify({ action: 'simulate', tenantId, policyId: id, attemptedAction: { name: 'CARFAX vehicle-history report', attemptedAmount: 150 } }),
    }));
  }

  async function mutate(success, fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      setMessage(success);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const auth = proof?.auth || approvals[0]?.auth || { tenantId, role: token ? 'token-auth' : 'demo owner' };
  const pending = approvals.filter((approval) => approval.status === 'pending');

  return (
    <main className="admin-shell">
      <header className="admin-hero">
        <div>
          <p className="eyebrow">Agent IC production ops</p>
          <h1>Enterprise Ops Console</h1>
          <p className="subtitle">Auth-aware operating surface for tenant context, approvals, policy governance, payment receipts, and stored trial evidence.</p>
        </div>
        <a className="trial-link" href="/trial">Back to trial console</a>
      </header>

      <section className="admin-grid top-grid">
        <Panel title="Auth + tenant context">
          <label>Organization / Tenant</label>
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} aria-label="Tenant selector">
            <option value="demo-tenant">demo-tenant</option>
            {tenants.map((tenant) => <option key={tenant.tenantId} value={tenant.tenantId}>{tenant.name} ({tenant.tenantId})</option>)}
          </select>
          <label>Tenant display name</label>
          <div className="membership-form">
            <input value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)} aria-label="Tenant display name" />
            <button onClick={upsertTenant} disabled={busy}>Save tenant</button>
          </div>
          <label>Bearer token (optional outside production)</label>
          <textarea value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste signed Agent IC JWT from SSO/OIDC adapter" />
          <div className="button-row">
            <button onClick={saveToken}>Save token</button>
            <button onClick={createBrowserSession} disabled={busy}>Create browser session</button>
            <button onClick={loadBrowserSession} disabled={busy}>Check session</button>
            <button onClick={logoutBrowserSession} disabled={busy}>Logout session</button>
            <button onClick={refresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
          </div>
          <p className="session-note">Session exchange stores identity in an HttpOnly cookie; logout revokes the stored session and clears the cookie.</p>
          {sessionStatus?.auth && <div className="session-card">
            <strong>Browser session:</strong> {sessionStatus.auth.userId} · {sessionStatus.auth.tenantId} · {sessionStatus.auth.role}
          </div>}
          <div className="fact-list">
            <span>Tenant: {auth.tenantId || tenantId}</span>
            <span>User: {auth.userId || 'demo/local'}</span>
            <span>Role: {auth.role || 'unknown'}</span>
          </div>
        </Panel>

        <Panel title="Readiness + proof">
          <StatusPill ok={ready?.status === 'ready'} label={ready?.status || 'loading'} />
          <div className="fact-list">
            <span>Mode: {ready?.mode || 'unknown'}</span>
            <span>Store tenants: {ready?.dependencies?.tenantStore?.tenantCount ?? 0}</span>
            <span>Audit chain: {proof?.auditChain?.ok ? 'verified' : 'unknown'}</span>
            <span>Alerts: {alerts?.summary?.triggered ?? 'n/a'} triggered</span>
            <span>SLOs: {slo?.summary?.breached ?? 'n/a'} breached</span>
            <span>Workload rows: {proof?.workloadEvidence?.rowCount ?? 'n/a'}</span>
          </div>
          <p className="caveat">Production-ready still requires enterprise SSO/JWKS, durable DB/WORM storage, deployed observability, and compliance evidence.</p>
        </Panel>
      </section>

      {message && <div className="admin-message">{message}</div>}
      {error && <div className="admin-error">{error}</div>}

      <section className="admin-grid">

        <Panel title={`Memberships (${memberships.length})`} action={<button onClick={upsertMember} disabled={busy}>Upsert member</button>}>
          <div className="membership-form">
            <input value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} aria-label="Member user id" />
            <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)} aria-label="Member role">
              <option value="operator">operator</option>
              <option value="auditor">auditor</option>
              <option value="security_reviewer">security_reviewer</option>
              <option value="finance_approver">finance_approver</option>
              <option value="procurement_admin">procurement_admin</option>
              <option value="owner">owner</option>
            </select>
          </div>
          {memberships.length === 0 ? <Empty text="No tenant memberships yet." /> : memberships.slice(0, 6).map((member) => (
            <div className="admin-row" key={member.userId}>
              <div>
                <strong>{member.userId}</strong>
                <small>{member.role} · {member.status}</small>
              </div>
              {member.status === 'active' && <button onClick={() => deactivateMember(member.userId)} disabled={busy}>Deactivate</button>}
            </div>
          ))}
        </Panel>

        <Panel title={`Approval Queue (${pending.length} pending)`} action={<button onClick={requestApproval} disabled={busy}>Request $100 approval</button>}>
          {approvals.length === 0 ? <Empty text="No approvals for this tenant yet." /> : approvals.slice(0, 6).map((approval) => (
            <div className="admin-row" key={approval.id}>
              <div>
                <strong>{approval.caseId}</strong>
                <small>{approval.status} · ${approval.spendCap} · {approval.id}</small>
              </div>
              {approval.status === 'pending' && (
                <div className="row-actions">
                  <button onClick={() => decideApproval(approval.id, 'approve')} disabled={busy}>Approve</button>
                  <button onClick={() => decideApproval(approval.id, 'reject')} disabled={busy}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </Panel>

        <Panel title="Policy Governance" action={<button onClick={createPolicy} disabled={busy}>Create policy draft</button>}>
          <div className="fact-list">
            <span>Active: {activePolicy ? `v${activePolicy.version}` : 'none'}</span>
            <span>Case: {DEFAULT_CASE}</span>
          </div>
          {policies.length === 0 ? <Empty text="No policy versions yet." /> : policies.slice(0, 6).map((policy) => (
            <div className="admin-row" key={policy.id}>
              <div>
                <strong>v{policy.version} · {policy.status}</strong>
                <small>{policy.policyHash?.slice(0, 12)} · cap ${policy.policy?.spendCap}</small>
              </div>
              <div className="row-actions">
                <button onClick={() => simulatePolicy(policy.id)} disabled={busy}>Simulate</button>
                {policy.status !== 'active' && <button onClick={() => activatePolicy(policy.id)} disabled={busy}>Activate</button>}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Stored Trial Evidence">
          {trials.length === 0 ? <Empty text="No stored trial runs yet." /> : trials.slice(0, 6).map((trial) => (
            <div className="admin-row" key={trial.runId}>
              <div>
                <strong>{trial.decision?.verdict || 'UNKNOWN'} · {trial.caseId}</strong>
                <small>{trial.runId} · {trial.evidence?.casesProcessed || 0} rows · {trial.evidence?.dataHash?.slice(0, 12) || 'no hash'}</small>
              </div>
            </div>
          ))}
        </Panel>



        <Panel title="Compliance Export" action={<button onClick={generateExport} disabled={busy}>Generate export</button>}>
          {exportBundle ? (
            <div className="export-card">
              <strong>Export bundle ready</strong>
              <small>SHA-256: {exportBundle.sha256?.slice(0, 24)}…</small>
              <div className="fact-list">
                <span>Trials: {exportBundle.summary?.trialCount}</span>
                <span>Evidence: {exportBundle.summary?.evidenceArtifactCount}</span>
                <span>Audit rows: {exportBundle.summary?.auditRowCount}</span>
                <span>Audit chain: {exportBundle.summary?.auditChainOk ? 'verified' : 'check'}</span>
              </div>
            </div>
          ) : <Empty text="Generate a tenant-scoped export bundle for audit/compliance review." />}
        </Panel>


        <Panel title="Alerts + on-call">
          {!alerts ? <Empty text="Alert status loading." /> : (
            <div className="export-card">
              <strong>{alerts.ok ? 'No active alert thresholds' : `${alerts.summary.triggered} active alert(s)`}</strong>
              <small>On-call: {alerts.onCall?.target} · {alerts.onCall?.channel}</small>
              <div className="fact-list">
                <span>Critical: {alerts.summary?.critical}</span>
                <span>Warning: {alerts.summary?.warning}</span>
                <span>Rules: {alerts.summary?.totalRules}</span>
              </div>
              {alerts.triggered?.slice(0, 3).map((alert) => (
                <small key={alert.id}>{alert.severity}: {alert.summary} · {alert.runbook}</small>
              ))}
            </div>
          )}
        </Panel>



        <Panel title="SLO + error budget">
          {!slo ? <Empty text="SLO status loading." /> : (
            <div className="export-card">
              <strong>{slo.ok ? 'SLOs within budget' : `${slo.summary.breached} SLO breach(es)`}</strong>
              <small>{slo.summary.healthy} healthy · {slo.summary.atRisk} at risk · {slo.summary.breached} breached</small>
              <div className="fact-list">
                <span>Total: {slo.summary.total}</span>
                <span>Alerts: {slo.summary.alertTriggered}</span>
              </div>
              {slo.slos?.slice(0, 4).map((item) => (
                <small key={item.id}>{item.name}: {item.status} · success {(item.successRatio * 100).toFixed(2)}% · budget {(item.errorBudgetRemaining * 100).toFixed(1)}%</small>
              ))}
            </div>
          )}
        </Panel>


        <Panel title="Incident Reviews" action={<button onClick={createIncidentDrill} disabled={busy}>Record drill</button>}>
          <label>Incident / drill title</label>
          <input value={incidentTitle} onChange={(e) => setIncidentTitle(e.target.value)} aria-label="Incident drill title" />
          {incidents.length === 0 ? <Empty text="No incident reviews or alert drills recorded." /> : incidents.slice(0, 5).map((incident) => (
            <div className="admin-row" key={incident.id}>
              <div>
                <strong>{incident.title}</strong>
                <small>{incident.status} · {incident.severity} · {incident.runbook || 'no runbook'}</small>
              </div>
              {incident.status !== 'closed' && <button onClick={() => closeIncident(incident.id)} disabled={busy}>Close</button>}
            </div>
          ))}
        </Panel>

        <Panel title="Telemetry Export" action={<button onClick={exportTelemetryDryRun} disabled={busy}>Dry-run export</button>}>
          {!telemetryExport ? <Empty text="Prepare a redacted telemetry export payload before wiring an external backend." /> : (
            <div className="export-card">
              <strong>Telemetry dry-run ready</strong>
              <small>Destination: {telemetryExport.destination || 'not configured'}</small>
              <div className="fact-list">
                <span>Metrics: {telemetryExport.payload?.metrics?.counters?.length ?? 0}</span>
                <span>Alerts: {telemetryExport.payload?.alerts?.summary?.triggered ?? 0}</span>
                <span>Events: {telemetryExport.payload?.metrics?.recentEvents?.length ?? 0}</span>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Payment Events">
          <label>Stripe Checkout Session ID for reconciliation</label>
          <input value={reconcileSessionId} onChange={(e) => setReconcileSessionId(e.target.value)} placeholder="cs_test_..." aria-label="Stripe Checkout Session ID" />
          {payments.length === 0 ? <Empty text="No Stripe payment events recorded for this tenant." /> : payments.slice(0, 6).map((event) => (
            <div className="admin-row" key={event.eventId}>
              <div>
                <strong>{event.type}</strong>
                <small>{event.eventId} · {event.checkoutSession?.paymentStatus || 'n/a'} · {event.checkoutSession?.idMasked || 'masked'}</small>
                {event.reconciliation && <small>Reconciled: {event.reconciliation.ok ? 'matched' : 'mismatch'} · {event.reconciliation.checkoutSession?.paymentStatus || 'n/a'}</small>}
              </div>
              <button onClick={() => reconcilePayment(event.eventId)} disabled={busy}>Reconcile payment</button>
            </div>
          ))}
        </Panel>
      </section>
    </main>
  );
}

function Panel({ title, action, children }) {
  return (
    <section className="admin-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }) {
  return <p className="empty-state">{text}</p>;
}

function StatusPill({ ok, label }) {
  return <div className={`status-pill ${ok ? 'ok' : 'warn'}`}>{label}</div>;
}


function cookieValue(name) {
  if (typeof document === 'undefined') return '';
  return document.cookie.split(';').map((item) => item.trim()).reduce((found, item) => {
    if (found) return found;
    const index = item.indexOf('=');
    if (index === -1) return '';
    return item.slice(0, index) === name ? decodeURIComponent(item.slice(index + 1)) : '';
  }, '');
}
