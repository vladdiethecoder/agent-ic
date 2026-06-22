import { governancePolicy } from './demoData.js';
import { isNemoclawLive, isNemoclawProxyConfigured } from './providerStatus.js';

const DEFAULT_NETWORK_POLICY = 'deny-all except allow-listed tool endpoints';

export function buildSandboxStatus(evaluation, blockedEvent, realBlockedCall = null, sandboxResult = null) {
  const liveBroker = isNemoclawLive();
  const localPolicyProof = !liveBroker && isNemoclawProxyConfigured();
  const runtime = liveBroker
    ? 'NemoClaw / OpenShell live broker'
    : localPolicyProof
      ? 'Agent IC policy gate (HTTP 403 proof)'
      : 'Agent IC policy gate (deterministic replay)';

  return {
    runtime,
    status: sandboxResult?.status || 'ready',
    credentialBroker: liveBroker ? 'OpenShell' : 'Agent IC policy broker',
    credentialPolicy: 'Primary tokens live outside the agent transcript; runtime injects short-lived session credentials.',
    networkPolicy: sandboxResult?.networkPolicy || DEFAULT_NETWORK_POLICY,
    sandboxId: sandboxResult?.sandboxId || `sandbox-${evaluation.proposalId}-replay`,
    policyHash: `gov-${governancePolicy.version}`,
    invariants: sandboxResult?.invariants || governancePolicy.invariants,
    blockedCall: realBlockedCall || {
      host: 'api.dat.com',
      method: 'POST',
      path: '/v1/rateview/market-rates',
      attemptedAmount: blockedEvent?.attemptedAmount || evaluation.spendEnvelope?.cap * 1.5 || 150,
      status: 403,
      policy: 'unapproved_external_vendor',
      detail:
        'Outbound call denied by policy gate. Merchant category outside approved SaaS list and per-authorization cap exceeded.',
    },
  };
}
