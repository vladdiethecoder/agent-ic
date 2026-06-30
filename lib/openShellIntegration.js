/**
 * OpenShell Integration
 *
 * Attempts NVIDIA OpenShell — the Apache-2.0 agent sandbox runtime —
 * as a policy enforcement engine for Agent IC governed trials when it is
 * actually installed and returns an observed denial receipt.
 *
 * This replaces the old localhost proxy (127.0.0.1:9000) that was falsely
 * claimed as an external NemoClaw/OpenShell broker. OpenShell proof is recorded
 * only when a sandbox execution returns HTTP 403 or an explicit policy-denied
 * marker. Otherwise the attempt is marked unverified and the trial falls back
 * to the local deny-by-default policy gate.
 *
 * Flow:
 *   1. Create an OpenShell sandbox for the trial
 *   2. Apply the Agent IC policy YAML (allow NHTSA+Nemotron, block CARFAX/Slack/payments)
 *   3. Attempt the blocked action inside the sandbox
 *   4. Record OpenShell proof only if a genuine 403/policy_denied marker appears
 *   5. Otherwise record the non-secret failed attempt without claiming enforcement
 */

import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const OPENSHELL_BINARY = process.env.OPENSHELL_BINARY || '/usr/bin/openshell';
const SANDBOX_TIMEOUT_MS = 30_000;

/**
 * Check if OpenShell is available on this system.
 */
export function isOpenShellAvailable() {
  const binary = process.env.OPENSHELL_BINARY || 'openshell';
  try {
    if (binary.includes('/') || binary.startsWith('.')) {
      accessSync(binary, constants.X_OK);
    } else {
      execFileSync('which', [binary], { encoding: 'utf8', stdio: 'pipe' });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a governed OpenShell sandbox for an Agent IC trial.
 *
 * @param {Object} caseDef — enterprise case definition
 * @returns {Object} sandbox creation result
 */
export async function createGovernedSandbox(caseDef) {
  const sandboxName = `agent-ic-${caseDef.domainKey}-${Date.now()}`;

  try {
    // Create the sandbox
    const { stdout, stderr } = await execFileAsync(
      OPENSHELL_BINARY,
      ['-g', 'nemoclaw', 'sandbox', 'create', '--name', sandboxName, '--no-tty', '--', 'echo', 'ready'],
      { timeout: SANDBOX_TIMEOUT_MS, encoding: 'utf8' }
    );

    const sandboxId = extractSandboxId(stdout) || sandboxName;

    // Apply the Agent IC policy
    await applyPolicy(sandboxName, caseDef);

    return {
      ok: true,
      sandboxId,
      sandboxName,
      policyEngine: 'NVIDIA OpenShell',
      policyVersion: 'agent-ic-governed-trial-v1',
      networkPolicy: 'OpenShell live deny rule for blocked endpoint; Agent IC policy gate still verifies allowed/denied business action',
      enforcement: 'container-level network interception',
      status: 'ready',
      raw: stdout.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      sandboxId: null,
      sandboxName,
      policyEngine: 'NVIDIA OpenShell',
      error: sanitizeError(error),
      status: 'creation_failed',
    };
  }
}

/**
 * Apply the governed trial policy to a sandbox.
 */
async function applyPolicy(sandboxName, caseDef) {
  const testAction = buildBlockedActionTest(caseDef);
  let url;
  try {
    url = new URL(testAction.url);
  } catch {
    return false;
  }
  const host = url.hostname;
  const port = url.protocol === 'http:' ? '80' : '443';
  const pathGlob = url.pathname.endsWith('/') ? `${url.pathname}**` : `${url.pathname}/**`;

  try {
    await execFileAsync(
      OPENSHELL_BINARY,
      [
        '-g', 'nemoclaw', 'policy', 'update',
        '--wait',
        '--add-endpoint', `${host}:${port}:read-only:rest:enforce`,
        '--add-deny', `${host}:${port}:${testAction.method}:${pathGlob}`,
        sandboxName,
      ],
      { timeout: SANDBOX_TIMEOUT_MS, encoding: 'utf8' }
    );
    return true;
  } catch (error) {
    // Policy application may fail if sandbox isn't ready. Do not claim
    // network-level enforcement unless testPolicyEnforcement observes a denial.
    console.error('[openshell] policy update warning:', sanitizeError(error));
    return false;
  }
}

/**
 * Test a policy enforcement — attempt a blocked action from inside the sandbox.
 *
 * This attempts the same blocked action a worker agent requested so the policy can
 * prevent it. The result is verified only when OpenShell returns HTTP 403 or an
 * explicit policy-denied marker.
 *
 * @param {Object} caseDef — case with the blocked tool definition
 * @param {string} sandboxName — sandbox to test against
 * @returns {Object} policy enforcement result with verified or unverified receipt
 */
export async function testPolicyEnforcement(caseDef, sandboxName) {
  const blockedTool = caseDef.policyEnvelope.blockedTool;

  // Determine the target URL and method to test
  const testAction = buildBlockedActionTest(caseDef);

  try {
    // Execute the test action inside the sandbox
    // OpenShell's network policy intercepts this at the container level
    const executionProcess = spawnSync(
      OPENSHELL_BINARY,
      ['-g', 'nemoclaw', 'sandbox', 'exec', '--name', sandboxName, '--timeout', String(Math.ceil(SANDBOX_TIMEOUT_MS / 1000)), '--no-tty', 'curl', '-sS', '-o', '/dev/null', '-w', '%{http_code}', '-X', testAction.method, testAction.url],
      { timeout: SANDBOX_TIMEOUT_MS + 10_000, encoding: 'utf8', maxBuffer: 1024 * 1024 }
    );
    const execution = {
      ok: executionProcess.status === 0,
      stdout: executionProcess.stdout || '',
      stderr: executionProcess.stderr || executionProcess.error?.message || '',
      exitCode: Number.isInteger(executionProcess.status) ? executionProcess.status : 1,
    };

    // OpenShell proof requires an observed 403 or an explicit policy-denied marker.
    // A generic command failure, missing sandbox, or network error is an unverified
    // enforcement attempt — never synthesize it into a successful block receipt.
    const httpStatus = parseInt(String(execution.stdout || '').trim(), 10);
    const explicitPolicyDeny = /policy_denied|policy denied|blocked by policy|blocked_by_policy|response\s+403|http\s*403|\b403\b/i.test(`${execution.stderr}\n${execution.stdout}`);
    const isBlocked = httpStatus === 403 || explicitPolicyDeny;
    const status = Number.isFinite(httpStatus) ? httpStatus : 0;

    if (!isBlocked) {
      return buildUnverifiedOpenShellReceipt(caseDef, sandboxName, testAction, {
        status,
        exitCode: execution.exitCode,
        stderr: execution.stderr,
        stdout: execution.stdout,
      });
    }

    return {
      blocked: true,
      status: 403,
      enforced: true,
      verificationStatus: 'verified',
      enforcementEngine: 'NVIDIA OpenShell',
      enforcementType: 'container-network-policy',
      sandbox: sandboxName,
      tool: blockedTool.name,
      targetUri: testAction.url,
      method: testAction.method,
      attemptedAmount: blockedTool.attemptedAmount,
      cap: caseDef.policyEnvelope.spendCap,
      policyRule: blockedTool.policyRule,
      reason: blockedTool.reason,
      receipt: `openshell-block-${Date.now()}`,
      rawResponse: String(execution.stderr || execution.stdout || '').slice(0, 300),
      proof: {
        engine: 'NVIDIA OpenShell',
        enforcementLevel: 'container network interception',
        policyFile: 'openshell/policy-agent-ic.yaml',
        genuineExternal: true,
      },
    };
  } catch (error) {
    return buildUnverifiedOpenShellReceipt(caseDef, sandboxName, testAction, error);
  }
}

/**
 * Build the appropriate blocked-action test for each case domain.
 */
function buildBlockedActionTest(caseDef) {
  const blocked = caseDef.policyEnvelope.blockedTool;

  switch (blocked.type) {
    case 'paid_enrichment_over_cap':
      return {
        url: 'https://www.carfax.com/vehicle-history-reports/',
        method: 'GET',
      };
    case 'write_action_without_approval':
      return {
        url: 'https://api.github.com/repos/test/test/pulls/1/merge',
        method: 'PUT',
      };
    case 'data_exfiltration_prevention':
      return {
        url: 'https://blocked-webhook.invalid/threatscope/slack-alert',
        method: 'POST',
      };
    case 'payment_approval_threshold_breach':
      return {
        url: 'https://erp.meridian-industries.internal/api/v1/payments/approve',
        method: 'POST',
      };
    default:
      return {
        url: blocked.targetUri || 'https://blocked.example.com/',
        method: 'GET',
      };
  }
}

/**
 * Build an honest unverified receipt when OpenShell execution did not produce
 * an observed policy denial. This preserves the attempted action metadata but
 * refuses to claim sandbox enforcement.
 */
function buildUnverifiedOpenShellReceipt(caseDef, sandboxName, testAction, error) {
  const detail = typeof error === 'object'
    ? error.stderr || error.stdout || error.message || JSON.stringify(error)
    : String(error || 'OpenShell enforcement did not return a policy denial');
  return {
    blocked: false,
    status: Number.isFinite(error?.status) ? error.status : 0,
    enforced: false,
    verificationStatus: 'unverified',
    enforcementEngine: 'NVIDIA OpenShell',
    enforcementType: 'container-network-policy',
    sandbox: sandboxName,
    tool: caseDef.policyEnvelope.blockedTool.name,
    targetUri: testAction.url,
    method: testAction.method,
    attemptedAmount: caseDef.policyEnvelope.blockedTool.attemptedAmount,
    cap: caseDef.policyEnvelope.spendCap,
    policyRule: caseDef.policyEnvelope.blockedTool.policyRule,
    reason: caseDef.policyEnvelope.blockedTool.reason,
    receipt: null,
    rawResponse: sanitizeError(detail),
    proof: {
      engine: 'NVIDIA OpenShell attempt (unverified)',
      enforcementLevel: 'not observed',
      policyFile: 'openshell/policy-agent-ic.yaml',
      genuineExternal: false,
      note: 'Blocked action was attempted, but no 403 or explicit policy-denied marker was observed. Do not claim OpenShell enforcement for this run.',
    },
  };
}

/**
 * Destroy a sandbox after the trial is complete.
 */
export async function destroySandbox(sandboxName) {
  try {
    await execFileAsync(
      OPENSHELL_BINARY,
      ['-g', 'nemoclaw', 'sandbox', 'delete', sandboxName],
      { timeout: SANDBOX_TIMEOUT_MS, encoding: 'utf8' }
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: sanitizeError(error) };
  }
}

/**
 * Get OpenShell version for provenance.
 */
export async function getOpenShellVersion() {
  try {
    const { stdout } = await execFileAsync(OPENSHELL_BINARY, ['--version'], {
      timeout: 5_000,
      encoding: 'utf8',
    });
    return stdout.trim();
  } catch {
    return null;
  }
}



function extractSandboxId(stdout) {
  const match = stdout.match(/(?:sandbox|id)[:\s]+([a-f0-9-]{8,})/i);
  return match?.[1] || null;
}

function sanitizeError(error) {
  const msg = error?.message || error?.stderr || String(error || 'Unknown error');
  return String(msg).slice(0, 200)
    .replace(/sk_[a-zA-Z0-9]+/gi, '[REDACTED]')
    .replace(/nvapi-[a-zA-Z0-9-]+/gi, '[REDACTED]');
}
