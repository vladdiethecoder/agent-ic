import { governancePolicy } from './demoData.js';
import { isNemoclawLive } from './providerStatus.js';

const DEFAULT_NETWORK_POLICY = 'deny-all except allow-listed tool endpoints';

export function buildSandboxStatus(evaluation, blockedEvent, realBlockedCall = null, sandboxResult = null) {
  const liveBroker = isNemoclawLive();

  return {
    runtime: liveBroker ? 'NemoClaw / OpenShell live broker' : 'NemoClaw / OpenShell sandbox (deterministic replay)',
    status: sandboxResult?.status || 'ready',
    credentialBroker: 'OpenShell',
    credentialPolicy: 'Primary tokens live outside the agent transcript; runtime injects short-lived session credentials.',
    networkPolicy: sandboxResult?.networkPolicy || DEFAULT_NETWORK_POLICY,
    sandboxId: sandboxResult?.sandboxId || `sandbox-${evaluation.proposalId}-replay`,
    policyHash: `gov-${governancePolicy.version}`,
    invariants: sandboxResult?.invariants || governancePolicy.invariants,
    blockedCall: realBlockedCall || {
      host: 'premium-market-api.example.com',
      method: 'POST',
      path: '/v1/lookup',
      attemptedAmount: blockedEvent?.attemptedAmount || evaluation.spendEnvelope?.cap * 1.5 || 150,
      status: 403,
      policy: 'unapproved_external_vendor',
      detail:
        'Outbound call intercepted by OpenShell network policy. Merchant category outside approved SaaS list and per-authorization cap exceeded.',
    },
  };
}
