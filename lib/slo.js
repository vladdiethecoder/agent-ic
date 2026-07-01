import { evaluateAlerts } from './alerting.js';
import { getMetricsSnapshot } from './observability.js';

export const SLO_TARGETS = Object.freeze([
  {
    id: 'trial-success-ratio',
    name: 'Governed trial success ratio',
    target: 0.99,
    goodMetric: 'agent_ic_trials_completed_total',
    badMetric: 'agent_ic_trials_failed_total',
    description: 'Completed governed trials should dominate failed trial attempts.',
  },
  {
    id: 'audit-integrity',
    name: 'Audit integrity',
    target: 1,
    goodMetric: 'agent_ic_audit_entries_total',
    badMetric: 'agent_ic_audit_chain_failures_total',
    description: 'Audit chain verification failures should consume zero error budget.',
  },
  {
    id: 'stripe-webhook-acceptance',
    name: 'Stripe webhook acceptance',
    target: 0.995,
    goodMetric: 'agent_ic_stripe_webhooks_total',
    badMetric: 'agent_ic_stripe_webhook_rejected_total',
    description: 'Stripe webhook rejects should stay below the production error budget.',
  },
  {
    id: 'policy-enforcement',
    name: 'Policy enforcement',
    target: 1,
    goodMetric: 'agent_ic_policy_blocks_total',
    badMetric: 'agent_ic_policy_bypass_attempts_total',
    description: 'Policy bypass attempts should consume zero error budget.',
  },
]);

export function evaluateSLOs({ snapshot = getMetricsSnapshot(), alerts = evaluateAlerts({ snapshot }) } = {}) {
  const slos = SLO_TARGETS.map((target) => evaluateTarget(target, snapshot));
  const breached = slos.filter((slo) => slo.status === 'breached');
  const atRisk = slos.filter((slo) => slo.status === 'at_risk');
  return {
    ok: breached.length === 0,
    generatedAt: new Date().toISOString(),
    summary: {
      total: slos.length,
      breached: breached.length,
      atRisk: atRisk.length,
      healthy: slos.filter((slo) => slo.status === 'healthy').length,
      alertTriggered: alerts.summary?.triggered || 0,
    },
    slos,
  };
}

function evaluateTarget(target, snapshot) {
  const good = metricValue(snapshot, target.goodMetric);
  const bad = metricValue(snapshot, target.badMetric);
  const total = good + bad;
  const successRatio = total === 0 ? 1 : good / total;
  const errorBudget = Math.max(0, 1 - target.target);
  const errorRatio = total === 0 ? 0 : bad / total;
  const consumed = errorBudget === 0 ? (bad > 0 ? 1 : 0) : Math.min(1, errorRatio / errorBudget);
  const status = successRatio < target.target ? 'breached' : consumed >= 0.8 ? 'at_risk' : 'healthy';
  return {
    id: target.id,
    name: target.name,
    description: target.description,
    status,
    target: target.target,
    successRatio: round(successRatio),
    errorBudgetRemaining: round(Math.max(0, 1 - consumed)),
    good,
    bad,
    total,
    goodMetric: target.goodMetric,
    badMetric: target.badMetric,
  };
}

function metricValue(snapshot, name) {
  return (snapshot.counters || [])
    .filter((metric) => metric.name === name)
    .reduce((sum, metric) => sum + Number(metric.value || 0), 0);
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}
