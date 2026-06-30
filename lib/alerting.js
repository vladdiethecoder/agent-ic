import { getMetricsSnapshot } from './observability.js';
import { redactSecrets } from './validation.js';

export const ALERT_RULES = Object.freeze([
  {
    id: 'audit-chain-failure',
    severity: 'critical',
    metric: 'agent_ic_audit_chain_failures_total',
    threshold: 0,
    comparator: 'gt',
    runbook: 'docs/runbooks/audit-restore.md',
    summary: 'Audit chain verification has failures.',
  },
  {
    id: 'stripe-webhook-rejected',
    severity: 'warning',
    metric: 'agent_ic_stripe_webhook_rejected_total',
    threshold: 0,
    comparator: 'gt',
    runbook: 'docs/runbooks/payment-incident.md',
    summary: 'Stripe webhook signature or payload was rejected.',
  },
  {
    id: 'trial-failure-rate',
    severity: 'warning',
    metric: 'agent_ic_trials_failed_total',
    threshold: 0,
    comparator: 'gt',
    runbook: 'docs/runbooks/provider-outage.md',
    summary: 'Governed trial failures have been recorded.',
  },
  {
    id: 'policy-bypass-attempt',
    severity: 'critical',
    metric: 'agent_ic_policy_bypass_attempts_total',
    threshold: 0,
    comparator: 'gt',
    runbook: 'docs/runbooks/policy-bypass.md',
    summary: 'Policy bypass attempts have been recorded.',
  },
  {
    id: 'recent-error-events',
    severity: 'warning',
    eventKind: 'error',
    threshold: 0,
    comparator: 'gt',
    runbook: 'docs/runbooks/provider-outage.md',
    summary: 'Recent error events are present in the in-process event buffer.',
  },
]);

export function evaluateAlerts({ snapshot = getMetricsSnapshot(), env = process.env } = {}) {
  const rules = ALERT_RULES.map((rule) => evaluateRule(rule, snapshot, env));
  const triggered = rules.filter((rule) => rule.triggered);
  return {
    ok: triggered.length === 0,
    generatedAt: new Date().toISOString(),
    onCall: onCallMetadata(env),
    summary: {
      totalRules: rules.length,
      triggered: triggered.length,
      critical: triggered.filter((rule) => rule.severity === 'critical').length,
      warning: triggered.filter((rule) => rule.severity === 'warning').length,
    },
    rules,
    triggered,
  };
}

function evaluateRule(rule, snapshot, env) {
  const observed = rule.metric ? metricValue(snapshot, rule.metric) : eventCount(snapshot, rule.eventKind);
  const triggered = compare(observed, rule.comparator, rule.threshold);
  return {
    id: rule.id,
    severity: rule.severity,
    summary: rule.summary,
    triggered,
    observed,
    threshold: rule.threshold,
    comparator: rule.comparator,
    metric: rule.metric || null,
    eventKind: rule.eventKind || null,
    runbook: rule.runbook,
    escalation: triggered ? escalation(rule, env) : null,
  };
}

function metricValue(snapshot, name) {
  return (snapshot.counters || [])
    .filter((metric) => metric.name === name)
    .reduce((sum, metric) => sum + Number(metric.value || 0), 0);
}

function eventCount(snapshot, kind) {
  return (snapshot.recentEvents || []).filter((event) => event.kind === kind || event.level === kind).length;
}

function compare(observed, comparator, threshold) {
  if (comparator === 'gt') return observed > threshold;
  if (comparator === 'gte') return observed >= threshold;
  if (comparator === 'eq') return observed === threshold;
  return false;
}

function escalation(rule, env) {
  return {
    channel: redactSecrets(env.AGENT_IC_ONCALL_CHANNEL || 'unconfigured-oncall-channel'),
    target: redactSecrets(env.AGENT_IC_ONCALL_TARGET || 'platform-owner'),
    severity: rule.severity,
    responseSlaMinutes: rule.severity === 'critical' ? Number(env.AGENT_IC_CRITICAL_ALERT_SLA_MINUTES || 15) : Number(env.AGENT_IC_WARNING_ALERT_SLA_MINUTES || 60),
  };
}

function onCallMetadata(env) {
  return {
    configured: Boolean(env.AGENT_IC_ONCALL_CHANNEL || env.AGENT_IC_ONCALL_TARGET),
    channel: redactSecrets(env.AGENT_IC_ONCALL_CHANNEL || 'unconfigured-oncall-channel'),
    target: redactSecrets(env.AGENT_IC_ONCALL_TARGET || 'platform-owner'),
    criticalSlaMinutes: Number(env.AGENT_IC_CRITICAL_ALERT_SLA_MINUTES || 15),
    warningSlaMinutes: Number(env.AGENT_IC_WARNING_ALERT_SLA_MINUTES || 60),
  };
}
