import { evaluateAlerts } from './alerting.js';
import { getMetricsSnapshot } from './observability.js';
import { redactSecrets } from './validation.js';

export function buildTelemetryPayload({ snapshot = getMetricsSnapshot(), alerts = evaluateAlerts({ snapshot }), service = 'agent-ic', env = process.env } = {}) {
  return sanitizeTelemetry({
    recordType: 'agent-ic-telemetry-export-v1',
    service,
    environment: env.AGENT_IC_DEPLOYMENT_MODE || env.NODE_ENV || 'development',
    generatedAt: new Date().toISOString(),
    metrics: snapshot,
    alerts,
  });
}

export async function exportTelemetry({ endpoint = process.env.AGENT_IC_TELEMETRY_EXPORT_URL, token = process.env.AGENT_IC_TELEMETRY_EXPORT_TOKEN, dryRun = false, snapshot, alerts, fetchImpl = fetch, env = process.env } = {}) {
  const payload = buildTelemetryPayload({ snapshot, alerts, env });
  if (dryRun) return { ok: true, dryRun: true, payload, destination: safeDestination(endpoint) };
  const validation = validateEndpoint(endpoint, env);
  if (!validation.ok) return { ok: false, code: validation.code, message: validation.message, payload };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.AGENT_IC_TELEMETRY_EXPORT_TIMEOUT_MS || 8000));
  try {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetchImpl(endpoint, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal });
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      return { ok: false, code: 'telemetry_export_failed', status: response.status, message: redactSecrets(text || `HTTP ${response.status}`).slice(0, 300), destination: safeDestination(endpoint) };
    }
    return { ok: true, dryRun: false, status: response.status, destination: safeDestination(endpoint), response: redactSecrets(text).slice(0, 300) };
  } catch (error) {
    return { ok: false, code: 'telemetry_export_error', message: redactSecrets(error?.message || String(error)).slice(0, 300), destination: safeDestination(endpoint) };
  } finally {
    clearTimeout(timeout);
  }
}

export function validateEndpoint(endpoint, env = process.env) {
  if (!endpoint) return { ok: false, code: 'telemetry_endpoint_missing', message: 'Telemetry export endpoint is not configured' };
  let parsed;
  try { parsed = new URL(endpoint); } catch { return { ok: false, code: 'telemetry_endpoint_invalid', message: 'Telemetry export endpoint must be a valid URL' }; }
  if (env.AGENT_IC_DEPLOYMENT_MODE === 'production' && parsed.protocol !== 'https:') {
    return { ok: false, code: 'telemetry_endpoint_https_required', message: 'Production telemetry export endpoint must use HTTPS' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { ok: false, code: 'telemetry_endpoint_protocol_invalid', message: 'Telemetry export endpoint must use HTTP(S)' };
  return { ok: true };
}

function sanitizeTelemetry(value) {
  if (value == null) return value;
  if (typeof value === 'string') return redactSecrets(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeTelemetry);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (/token|secret|password|authorization|api[_-]?key/i.test(key)) return [key, '[REDACTED]'];
      return [key, sanitizeTelemetry(item)];
    }));
  }
  return String(value);
}

function safeDestination(endpoint) {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return 'invalid-url';
  }
}
