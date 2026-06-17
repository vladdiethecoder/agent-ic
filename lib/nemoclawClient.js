import { isNemoclawLive, resolveNemoclawProxyUrl } from './providerStatus.js';
import { sanitizeProviderError } from './validation.js';
import { governancePolicy } from './demoData.js';

const DEFAULT_PROXY_URL = 'http://localhost:9000';
const DEFAULT_NETWORK_POLICY = 'deny-all except allow-listed tool endpoints';

export async function createOpenShellSandbox(proposal, evaluation) {
  if (!isNemoclawLive()) {
    return {
      ok: false,
      sandboxId: `sandbox-${proposal.id}-fallback`,
      networkPolicy: DEFAULT_NETWORK_POLICY,
      invariants: governancePolicy.invariants,
      status: 'ready',
      error: 'NEMOCLAW_PROXY_URL not configured',
    };
  }

  const proxyUrl = resolveNemoclawProxyUrl() || DEFAULT_PROXY_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(`${proxyUrl.replace(/\/$/, '')}/v1/sandbox`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        proposalId: proposal.id,
        decision: evaluation.decision,
        cap: evaluation.autonomousSpendCap,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        sandboxId: null,
        networkPolicy: DEFAULT_NETWORK_POLICY,
        invariants: governancePolicy.invariants,
        status: 'error',
        error: sanitizeProviderError(`NemoClaw sandbox HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 200)}`),
      };
    }

    return {
      ok: true,
      sandboxId: payload.sandboxId || `sandbox-${proposal.id}-${Date.now()}`,
      networkPolicy: payload.networkPolicy || DEFAULT_NETWORK_POLICY,
      invariants: Array.isArray(payload.invariants) ? payload.invariants : governancePolicy.invariants,
      status: payload.status || 'ready',
      error: null,
    };
  } catch (error) {
    clearTimeout(timeout);
    const message = sanitizeProviderError(error?.name === 'AbortError' ? 'NemoClaw sandbox request timed out' : error);
    return {
      ok: false,
      sandboxId: null,
      networkPolicy: DEFAULT_NETWORK_POLICY,
      invariants: governancePolicy.invariants,
      status: 'error',
      error: message,
    };
  }
}

export async function gateToolCall(toolRequest) {
  if (!isNemoclawLive()) {
    return {
      ok: false,
      allowed: false,
      blockedCall: {
        host: extractHost(toolRequest?.targetUri || toolRequest?.endpoint || ''),
        method: toolRequest?.method || 'POST',
        path: extractPath(toolRequest?.targetUri || toolRequest?.endpoint || ''),
        attemptedAmount: Number(toolRequest?.amount) || 0,
        status: 403,
        policy: 'proxy_unconfigured',
        detail: 'NEMOCLAW_PROXY_URL not configured',
      },
      error: 'NEMOCLAW_PROXY_URL not configured',
    };
  }

  const proxyUrl = resolveNemoclawProxyUrl() || DEFAULT_PROXY_URL;
  const targetUri = toolRequest?.targetUri || toolRequest?.endpoint || '';
  const amount = Number(toolRequest?.amount) || 0;
  const method = toolRequest?.method || 'POST';
  const headers = toolRequest?.headers || {};
  const merchantCategory = toolRequest?.merchantCategory || toolRequest?.category || '';
  const proposalId = toolRequest?.proposalId || 'unknown';
  const sandboxId = toolRequest?.sandboxId || null;

  const body = {
    method,
    targetUri,
    headers,
    amount,
    merchantCategory,
    proposalId,
    sandboxId,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(`${proxyUrl.replace(/\/$/, '')}/v1/gate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const blockedCall = {
        host: extractHost(targetUri),
        method,
        path: extractPath(targetUri),
        attemptedAmount: amount,
        status: response.status,
        policy: payload.policy || payload.error || 'unapproved_external_vendor',
        detail: payload.detail || 'NemoClaw gate rejected the tool call',
      };
      return {
        ok: false,
        allowed: false,
        blockedCall,
        error: `${response.status} ${payload.error || 'blocked'}: ${blockedCall.detail}`,
      };
    }

    return {
      ok: true,
      allowed: true,
      blockedCall: null,
      issuedCredential: payload.issuedCredential || null,
      credential: payload,
      error: null,
    };
  } catch (error) {
    clearTimeout(timeout);
    const message = sanitizeProviderError(error?.name === 'AbortError' ? 'NemoClaw proxy request timed out' : error);
    return {
      ok: false,
      allowed: false,
      blockedCall: {
        host: extractHost(targetUri),
        method,
        path: extractPath(targetUri),
        attemptedAmount: amount,
        status: 0,
        policy: 'proxy_unreachable',
        detail: message,
      },
      error: message,
    };
  }
}

function extractHost(uri) {
  try {
    return new URL(uri).hostname;
  } catch {
    return uri;
  }
}

function extractPath(uri) {
  try {
    return new URL(uri).pathname;
  } catch {
    return '/';
  }
}
