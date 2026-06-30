import { NextResponse } from 'next/server.js';
import { buildProviderStates } from '../../../lib/providerStatus.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  let openshellAvailable = false;
  try {
    const { isOpenShellAvailable } = await import('../../../lib/openShellIntegration.js');
    openshellAvailable = isOpenShellAvailable();
  } catch {}

  const providers = buildProviderStates();
  const providerStates = {
    nemotron: maskProvider(providers.nemotron),
    stripe: maskProvider(providers.stripe),
    hermes: maskProvider(providers.hermes),
    policy: {
      state: openshellAvailable ? 'available' : providers.nemoclaw.state,
      mode: openshellAvailable ? 'capability-check' : providers.nemoclaw.mode,
      detail: openshellAvailable
        ? 'OpenShell binary available; per-run 403 receipt still required for enforcement proof'
        : providers.nemoclaw.detail,
    },
  };

  return NextResponse.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    truthModel: 'Health reports configured capabilities only. Provider success requires per-run receipts in trial/proof data.',
    services: {
      nemotronConfigured: providerStates.nemotron.state === 'configured',
      stripeConfigured: providerStates.stripe.state === 'configured',
      hermesConfigured: providerStates.hermes.state === 'configured',
      openshellAvailable,
    },
    providerStates,
  });
}


function maskProvider(provider = {}) {
  return {
    state: provider.state,
    mode: provider.mode,
    provider: provider.provider,
    detail: provider.detail,
    sandboxId: provider.sandboxId ? '[MASKED]' : null,
  };
}
