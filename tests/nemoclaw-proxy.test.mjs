import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { governancePolicy } from '../lib/demoData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROXY_SCRIPT = join(__dirname, '..', 'scripts', 'nemoclaw-proxy.mjs');

function startProxy(preferredPort = 0) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      NEMOCLAW_PROXY_URL: `http://127.0.0.1:${preferredPort}`,
    };
    const proc = spawn('node', [PROXY_SCRIPT], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let resolved = false;

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('NemoClaw proxy start timeout'));
    }, 5000);

    function onData(data) {
      output += data.toString();
      const match = output.match(/listening on (\S+):(\d+)/i);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timer);
        const url = `http://${match[1]}:${match[2]}`;
        resolve({ proc, url });
      }
    }

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('exit', (code) => {
      if (!resolved) {
        clearTimeout(timer);
        reject(new Error(`NemoClaw proxy exited ${code}\n${output}`));
      }
    });
  });
}

test('NemoClaw proxy endpoints', { concurrency: false }, async (t) => {
  let proxy;
  t.after(() => {
    if (proxy?.proc && !proxy.proc.killed) {
      proxy.proc.kill('SIGTERM');
    }
  });

  await t.test('GET /health returns ok', async () => {
    proxy = await startProxy(0);
    const response = await fetch(`${proxy.url}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.ok(body.name);
  });

  await t.test('POST /v1/sandbox returns a sandbox', async () => {
    proxy = proxy || (await startProxy(0));
    const response = await fetch(`${proxy.url}/v1/sandbox`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposalId: 'atlas-freight-rma-copilot' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.sandboxId);
    assert.equal(body.status, 'ready');
    assert.equal(body.networkPolicy, 'deny-all except allow-listed tool endpoints');
    assert.deepEqual(body.invariants, governancePolicy.invariants);
    assert.equal(body.policyTier, 'baseline');
    assert.ok(body.createdAt);
  });

  await t.test('POST /v1/gate still enforces policy', async () => {
    proxy = proxy || (await startProxy(0));
    const response = await fetch(`${proxy.url}/v1/gate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetUri: 'https://blocked.example.com/v1/lookup',
        amount: 25,
        merchantCategory: 'unapproved',
        proposalId: 'atlas-freight-rma-copilot',
      }),
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'unapproved_external_vendor');
  });
});
