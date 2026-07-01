// Per-integration live/fallback flags. These are intentionally independent so a
// local vLLM/Hermes development path can be live even when Stripe keys are absent.

export function isLocalProviderMode() {
  return process.env.AGENT_IC_LOCAL_MODE === 'true';
}

function firstEnvValue(primaryKey, aliasKeys = []) {
  const value = process.env[primaryKey];
  if (value) return value;
  for (const key of aliasKeys) {
    const aliasValue = process.env[key];
    if (aliasValue) return aliasValue;
  }
  return undefined;
}

function isEnvConfigured(primaryKey, aliasKeys = []) {
  return Boolean(firstEnvValue(primaryKey, aliasKeys));
}

export function getProviderState(envKey, aliasKeys = [], liveCheck = (value) => Boolean(value)) {
  const rawValue = firstEnvValue(envKey, aliasKeys);
  const hasCredential = liveCheck(rawValue);
  const localMode = isLocalProviderMode();
  const configured = hasCredential && !localMode;

  return {
    state: configured ? 'configured' : 'unavailable',
    mode: configured ? 'configured-attempt-live' : localMode ? 'local-disabled' : 'unavailable',
    detail: configured
      ? `${envKey} configured; live success requires a per-run provider receipt`
      : localMode ? 'local development mode enabled' : `${envKey} not configured`,
  };
}

export function isNemotronLive() {
  return Boolean(process.env.NEMOTRON_API_KEY) && !isLocalProviderMode();
}

export function isStripeLive() {
  return Boolean(process.env.STRIPE_SECRET_KEY) && !isLocalProviderMode();
}

export function isHermesLive() {
  return (
    isEnvConfigured('HERMES_AGENT_URL', ['HERMES_GATEWAY_URL', 'HERMES_WEBHOOK_URL']) ||
    isHermesNemoHermesLive() ||
    isHermesCliLive()
  ) && !isLocalProviderMode();
}

export function isHermesCliLive() {
  return process.env.AGENT_IC_HERMES_CLI_LIVE === 'true' && !isLocalProviderMode();
}

function isLocalUrl(value = '') {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isNemoclawProxyConfigured() {
  return isEnvConfigured('NEMOCLAW_PROXY_URL', ['OPENSHELL_COMMAND', 'NEMOCLAW_POLICY_MODE']) && !isLocalProviderMode();
}

export function resolveNemoHermesSandboxName() {
  return firstEnvValue('AGENT_IC_NEMOHERMES_SANDBOX', ['NEMOHERMES_SANDBOX', 'NEMOCLAW_SANDBOX_NAME']) || '';
}

export function resolveHermesNemoHermesSandboxName() {
  return (
    firstEnvValue('AGENT_IC_HERMES_NEMOHERMES_SANDBOX', [
      'AGENT_IC_NEMOHERMES_SANDBOX',
      'NEMOHERMES_SANDBOX',
      'NEMOCLAW_SANDBOX_NAME',
    ]) || ''
  );
}

export function isHermesNemoHermesLive() {
  return (
    process.env.AGENT_IC_HERMES_NEMOHERMES_LIVE === 'true' &&
    Boolean(resolveHermesNemoHermesSandboxName()) &&
    !isLocalProviderMode()
  );
}

export function isNemoHermesSandboxConfigured() {
  return Boolean(resolveNemoHermesSandboxName()) && !isLocalProviderMode();
}

export function isNemoclawLive() {
  const value = resolveNemoclawProxyUrl();
  if (isLocalProviderMode() || process.env.AGENT_IC_NEMOCLAW_EXTERNAL_LIVE !== 'true') {
    return false;
  }
  return isNemoHermesSandboxConfigured() || (Boolean(value) && !isLocalUrl(value));
}

export function resolveHermesUrl() {
  return firstEnvValue('HERMES_AGENT_URL', ['HERMES_GATEWAY_URL', 'HERMES_WEBHOOK_URL']) || '';
}

export function resolveNemoclawProxyUrl() {
  return firstEnvValue('NEMOCLAW_PROXY_URL', ['OPENSHELL_COMMAND', 'NEMOCLAW_POLICY_MODE']) || '';
}

export function buildProviderStates() {
  const policyProxyConfigured = isNemoclawProxyConfigured();
  const nemoHermesConfigured = isNemoHermesSandboxConfigured();
  const policyExternalLive = isNemoclawLive();
  const hermesUrlConfigured = isEnvConfigured('HERMES_AGENT_URL', ['HERMES_GATEWAY_URL', 'HERMES_WEBHOOK_URL']);
  const hermesSandboxLive = isHermesNemoHermesLive();
  const hermesCliLive = isHermesCliLive();
  return {
    localMode: isLocalProviderMode(),
    nemotron: getProviderState('NEMOTRON_API_KEY'),
    stripe: getProviderState('STRIPE_SECRET_KEY'),
    hermes: {
      state: (hermesUrlConfigured || hermesSandboxLive || hermesCliLive) && !isLocalProviderMode() ? 'configured' : 'handoff',
      mode: (hermesUrlConfigured || hermesSandboxLive || hermesCliLive) && !isLocalProviderMode() ? 'configured-attempt-live' : 'artifact',
      provider: hermesSandboxLive ? 'nemohermes-sandbox' : hermesUrlConfigured ? 'hermes-gateway' : hermesCliLive ? 'hermes-cli' : 'local-artifact',
      detail:
        (hermesUrlConfigured || hermesSandboxLive || hermesCliLive) && !isLocalProviderMode()
          ? 'Hermes dispatch configured; live success requires a per-run dispatch receipt'
          : isLocalProviderMode()
            ? 'local development mode enabled'
            : 'HERMES_AGENT_URL or AGENT_IC_HERMES_NEMOHERMES_LIVE not configured',
      sandboxId: hermesSandboxLive ? resolveHermesNemoHermesSandboxName() : null,
    },
    nemoclaw: {
      state: policyExternalLive ? 'live' : policyProxyConfigured || nemoHermesConfigured ? 'local-proof' : 'unavailable',
      mode: policyExternalLive ? 'live' : policyProxyConfigured || nemoHermesConfigured ? 'local-policy' : 'unavailable',
      detail: policyExternalLive
        ? undefined
        : nemoHermesConfigured
          ? 'NemoHermes sandbox configured but not marked live'
          : policyProxyConfigured
            ? 'local Agent IC policy proxy configured'
          : isLocalProviderMode()
            ? 'local development mode enabled'
            : 'NEMOCLAW_PROXY_URL not configured',
    },
  };
}
