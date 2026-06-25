import { execFile } from 'node:child_process';
import {
  isNemoclawLive,
  isNemoclawProxyConfigured,
  resolveNemoHermesSandboxName,
  resolveNemoclawProxyUrl,
} from './providerStatus.js';
import { sanitizeProviderError } from './validation.js';
import { governancePolicy } from './demoData.js';

const DEFAULT_PROXY_URL = 'http://localhost:9000';
const DEFAULT_NETWORK_POLICY = 'deny-all except allow-listed tool endpoints';

export async function createOpenShellSandbox(proposal, evaluation) {
  if (isNemoclawLive() && resolveNemoHermesSandboxName()) {
    return createNemoHermesSandboxReceipt(proposal);
  }

  if (!isNemoclawProxyConfigured()) {
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
        error: sanitizeProviderError(`Policy sandbox HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 200)}`),
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
    const message = sanitizeProviderError(error?.name === 'AbortError' ? 'Policy sandbox request timed out' : error);
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
  if (isNemoclawLive() && resolveNemoHermesSandboxName()) {
    return gateToolCallWithNemoHermes(toolRequest);
  }

  if (!isNemoclawProxyConfigured()) {
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
  const cap = Number(toolRequest?.cap) || null;
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
    cap,
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
        detail: payload.detail || 'Policy gate rejected the tool call',
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
    const message = sanitizeProviderError(error?.name === 'AbortError' ? 'Policy gate request timed out' : error);
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

async function createNemoHermesSandboxReceipt(proposal) {
  const sandboxName = resolveNemoHermesSandboxName();
  try {
    const status = await runNemoHermes([sandboxName, 'status'], { timeoutMs: 15_000 });
    return {
      ok: true,
      sandboxId: sandboxName,
      networkPolicy: DEFAULT_NETWORK_POLICY,
      invariants: governancePolicy.invariants,
      status: 'ready',
      provider: 'nemohermes',
      statusSummary: status.stdout.slice(0, 600),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      sandboxId: sandboxName,
      networkPolicy: DEFAULT_NETWORK_POLICY,
      invariants: governancePolicy.invariants,
      status: 'error',
      provider: 'nemohermes',
      error: sanitizeProviderError(error?.message || error),
    };
  }
}

async function gateToolCallWithNemoHermes(toolRequest) {
  const sandboxName = resolveNemoHermesSandboxName();
  const targetUri = toolRequest?.targetUri || toolRequest?.endpoint || '';
  const amount = Number(toolRequest?.amount) || 0;
  const cap = Number(toolRequest?.cap) || null;
  const method = toolRequest?.method || 'POST';
  const payload = JSON.stringify({
    amount,
    cap,
    proposalId: toolRequest?.proposalId || 'unknown',
    merchantCategory: toolRequest?.merchantCategory || toolRequest?.category || '',
  });

  try {
    const result = await runNemoHermes([
      sandboxName,
      'exec',
      '--timeout',
      '12',
      '--no-tty',
      '--',
      'curl',
      '--connect-timeout',
      '4',
      '--max-time',
      '8',
      '-sS',
      '-i',
      '-X',
      method,
      targetUri,
      '-H',
      'content-type: application/json',
      '-d',
      payload,
    ], { timeoutMs: 18_000 });

    const combined = `${result.stdout}\n${result.stderr}`.trim();
    const status = extractHttpStatus(combined);
    if (status === 403 || /forbidden|denied|blocked|policy/i.test(combined)) {
      return {
        ok: false,
        allowed: false,
        blockedCall: {
          host: extractHost(targetUri),
          method,
          path: extractPath(targetUri),
          attemptedAmount: amount,
          cap,
          status: 403,
          policy: 'openshell_network_policy',
          detail: 'OpenShell policy denied the out-of-envelope tool request inside the NemoHermes sandbox.',
        },
        error: '403 openshell_network_policy: request denied inside NemoHermes sandbox',
      };
    }

    return {
      ok: true,
      allowed: true,
      blockedCall: null,
      issuedCredential: null,
      credential: { provider: 'nemohermes', status: status || 200 },
      error: null,
    };
  } catch (error) {
    const combined = `${error?.stdout || ''}\n${error?.stderr || ''}\n${error?.message || ''}`.trim();
    if (/forbidden|denied|blocked|policy|403/i.test(combined)) {
      return {
        ok: false,
        allowed: false,
        blockedCall: {
          host: extractHost(targetUri),
          method,
          path: extractPath(targetUri),
          attemptedAmount: amount,
          cap,
          status: 403,
          policy: 'openshell_network_policy',
          detail: 'OpenShell policy denied the out-of-envelope tool request inside the NemoHermes sandbox.',
        },
        error: '403 openshell_network_policy: request denied inside NemoHermes sandbox',
      };
    }

    return {
      ok: false,
      allowed: false,
      blockedCall: {
        host: extractHost(targetUri),
        method,
        path: extractPath(targetUri),
        attemptedAmount: amount,
        cap,
        status: 0,
        policy: 'nemohermes_unavailable',
        detail: sanitizeProviderError(error?.message || error),
      },
      error: sanitizeProviderError(error?.message || error),
    };
  }
}

async function runNemoHermes(args, { timeoutMs = 10_000 } = {}) {
  const pathPrefix = process.env.HOME ? `${process.env.HOME}/.local/bin:` : '';
  const env = {
    ...process.env,
    PATH: `${pathPrefix}${process.env.PATH || ''}`,
    DOCKER_HOST: process.env.NEMOCLAW_DOCKER_HOST || 'unix:///run/docker.sock',
  };
  return execFileClosedStdin(process.env.NEMOHERMES_BIN || 'nemohermes', args, {
    env,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
}

function execFileClosedStdin(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    child.stdin?.end();
  });
}

function extractHttpStatus(text) {
  const match = String(text || '').match(/HTTP\/\S+\s+(\d{3})/);
  return match ? Number(match[1]) : null;
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
