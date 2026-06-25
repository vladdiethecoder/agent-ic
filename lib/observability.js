import { redactSecrets } from './validation.js';

const globalForObservability = globalThis;

if (!globalForObservability.__agentIcObservability) {
  globalForObservability.__agentIcObservability = {
    startedAt: new Date().toISOString(),
    counters: new Map(),
    gauges: new Map(),
    events: [],
  };
}

const MAX_EVENTS = Number(process.env.AGENT_IC_OBSERVABILITY_EVENT_LIMIT || 200);

export function incrementCounter(name, labels = {}, value = 1) {
  const key = metricKey(name, labels);
  const state = stateRef();
  const current = state.counters.get(key) || { name, labels: normalizeLabels(labels), value: 0 };
  current.value += Number(value) || 0;
  state.counters.set(key, current);
  return current.value;
}

export function setGauge(name, labels = {}, value = 0) {
  const key = metricKey(name, labels);
  const state = stateRef();
  const current = { name, labels: normalizeLabels(labels), value: Number(value) || 0 };
  state.gauges.set(key, current);
  return current.value;
}

export function recordEvent(event) {
  const state = stateRef();
  const safe = sanitizeEvent({ ts: new Date().toISOString(), ...event });
  state.events.unshift(safe);
  state.events = state.events.slice(0, MAX_EVENTS);
  if (safe.kind) incrementCounter('agent_ic_events_total', { kind: safe.kind, action: safe.action || 'unknown' });
  return safe;
}

export function logInfo(action, detail = {}) {
  return recordEvent({ level: 'info', kind: 'log', action, detail });
}

export function logError(action, error, detail = {}) {
  return recordEvent({
    level: 'error',
    kind: 'error',
    action,
    error: sanitizeValue(error?.message || String(error || 'unknown error')),
    detail,
  });
}

export function getMetricsSnapshot() {
  const state = stateRef();
  return {
    startedAt: state.startedAt,
    generatedAt: new Date().toISOString(),
    counters: Array.from(state.counters.values()).map(cloneMetric),
    gauges: Array.from(state.gauges.values()).map(cloneMetric),
    recentEvents: state.events.slice(0, 25),
  };
}

export function metricsAsPrometheus(snapshot = getMetricsSnapshot()) {
  const lines = [];
  for (const metric of snapshot.counters) {
    lines.push(`${sanitizeMetricName(metric.name)}${formatLabels(metric.labels)} ${metric.value}`);
  }
  for (const metric of snapshot.gauges) {
    lines.push(`${sanitizeMetricName(metric.name)}${formatLabels(metric.labels)} ${metric.value}`);
  }
  return `${lines.join('\n')}\n`;
}

export function resetObservability() {
  globalForObservability.__agentIcObservability = {
    startedAt: new Date().toISOString(),
    counters: new Map(),
    gauges: new Map(),
    events: [],
  };
}

function stateRef() {
  return globalForObservability.__agentIcObservability;
}

function metricKey(name, labels) {
  return `${name}:${JSON.stringify(normalizeLabels(labels))}`;
}

function normalizeLabels(labels = {}) {
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [sanitizeMetricName(key), sanitizeLabelValue(value)])
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function sanitizeEvent(event) {
  return sanitizeValue(event);
}

function sanitizeValue(value) {
  if (value == null) return value;
  if (typeof value === 'string') return redactSecrets(value).slice(0, 1000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (/secret|token|password|api[_-]?key|authorization/i.test(key)) return [key, '[REDACTED]'];
        return [key, sanitizeValue(item)];
      })
    );
  }
  return String(value);
}

function sanitizeMetricName(value) {
  return String(value || 'metric').replace(/[^a-zA-Z0-9_:]/g, '_');
}

function sanitizeLabelValue(value) {
  return redactSecrets(String(value)).replace(/[\n\r]/g, ' ').slice(0, 120);
}

function cloneMetric(metric) {
  return { name: metric.name, labels: { ...metric.labels }, value: metric.value };
}

function formatLabels(labels = {}) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries.map(([key, value]) => `${sanitizeMetricName(key)}=${JSON.stringify(sanitizeLabelValue(value))}`).join(',')}}`;
}
