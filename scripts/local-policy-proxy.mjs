import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { governancePolicy } from '../lib/demoData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PROXY_URL = 'http://localhost:9000';

function loadPolicy() {
  const policyPath = process.env.NEMOCLAW_POLICY_FILE || join(__dirname, '..', 'nemoclaw-policy.json');
  try {
    const raw = readFileSync(policyPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to load local policy from ${policyPath}: ${error.message}`);
    process.exit(1);
  }
}

function readJsonBody(request, maxBytes = 32 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    request.on('data', (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        reject(new Error('request_too_large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('malformed_json'));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function isAllowedMerchant(policy, targetHost) {
  return policy.allowedMerchants.some((m) => m.host.toLowerCase() === targetHost.toLowerCase());
}

function buildCredential(proposalId) {
  const now = Date.now();
  return {
    issuedCredential: `nemoclaw_${Buffer.from(`${proposalId}:${now}`).toString('base64url')}`,
    expiry: new Date(now + 5 * 60 * 1000).toISOString(),
  };
}

function buildSandbox(proposalId) {
  const now = Date.now();
  return {
    sandboxId: `nemoclaw-${Buffer.from(`${proposalId}:${now}`).toString('base64url')}`,
    status: 'ready',
    networkPolicy: 'deny-all except allow-listed tool endpoints',
    invariants: governancePolicy.invariants,
    policyTier: 'baseline',
    createdAt: new Date(now).toISOString(),
  };
}

async function handleSandbox(request, response) {
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return sendJson(response, 400, { error: error.message });
  }

  const proposalId = body.proposalId || 'unknown';
  return sendJson(response, 200, buildSandbox(proposalId));
}

async function handleGate(request, response, policy) {
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return sendJson(response, 400, { error: error.message });
  }

  const targetUri = body.targetUri;
  const amount = Number(body.amount);
  const merchantCategory = body.merchantCategory || 'unknown';
  const proposalId = body.proposalId || 'unknown';
  const method = body.method || 'POST';

  let targetHost = 'unknown-host';
  try {
    targetHost = new URL(targetUri).host;
  } catch {
    return sendJson(response, 400, {
      error: 'invalid_target_uri',
      detail: `Could not parse targetUri: ${targetUri}`,
    });
  }

  if (!Number.isFinite(amount) || amount < 0) {
    return sendJson(response, 400, {
      error: 'invalid_amount',
      detail: 'amount must be a non-negative number',
    });
  }

  if (amount > policy.perCallCap) {
    return sendJson(response, 403, {
      error: 'unapproved_external_vendor',
      policy: 'per_authorization_cap_exceeded',
      detail: `Amount ${amount} USD exceeds per-call cap of ${policy.perCallCap} USD`,
      targetHost,
      merchantCategory,
      attemptedAmount: amount,
      cap: policy.perCallCap,
    });
  }

  if (!isAllowedMerchant(policy, targetHost)) {
    return sendJson(response, 403, {
      error: 'unapproved_external_vendor',
      policy: 'merchant_not_in_allow_list',
      detail: `Host ${targetHost} (${merchantCategory}) is not in the approved merchant list`,
      targetHost,
      merchantCategory,
      attemptedAmount: amount,
      cap: policy.perCallCap,
    });
  }

  return sendJson(response, 200, {
    allowed: true,
    method,
    targetHost,
    merchantCategory,
    amount,
    ...buildCredential(proposalId),
  });
}

function handleHealth(response, policy) {
  sendJson(response, 200, {
    ok: true,
    name: policy.name,
    version: policy.version,
    perCallCap: policy.perCallCap,
    allowedMerchantCount: policy.allowedMerchants.length,
  });
}

function handleRootHealth(response) {
  sendJson(response, 200, { ok: true });
}

async function main() {
  const policy = loadPolicy();
  const proxyUrl = process.env.NEMOCLAW_PROXY_URL || DEFAULT_PROXY_URL;
  const parsedProxyUrl = new URL(proxyUrl);
  const port = parsedProxyUrl.port === '' ? 9000 : Number(parsedProxyUrl.port);
  const hostname = parsedProxyUrl.hostname;

  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/health') {
        return handleHealth(response, policy);
      }
      if (request.method === 'GET' && request.url === '/') {
        return handleRootHealth(response);
      }
      if (request.method === 'POST' && request.url === '/v1/sandbox') {
        return handleSandbox(request, response);
      }
      if (request.method === 'POST' && request.url === '/v1/gate') {
        return handleGate(request, response, policy);
      }
      return sendJson(response, 404, { error: 'not_found' });
    } catch (error) {
      console.error('Local policy proxy error:', error);
      return sendJson(response, 500, { error: 'internal_error', detail: error.message });
    }
  });

  server.listen(port, hostname, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`Local policy proxy listening on ${hostname}:${actualPort}`);
    console.log(`Per-call cap: ${policy.perCallCap} USD`);
    console.log(`Allowed merchants: ${policy.allowedMerchants.map((m) => m.host).join(', ')}`);
  });
}

main().catch((error) => {
  console.error('Local policy proxy failed to start:', error);
  process.exit(1);
});
