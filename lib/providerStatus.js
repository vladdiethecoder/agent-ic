// Per-integration live/fallback flags. These are intentionally independent so a
// local vLLM/Hermes demo can be live even when Stripe keys are absent.

export function isDemoModeGlobal() {
  return process.env.AGENT_IC_DEMO_MODE === 'true';
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
  const demo = isDemoModeGlobal();
  const live = hasCredential && !demo;

  return {
    state: live ? 'live' : 'mock',
    mode: live ? 'live' : 'demo',
    detail: live ? undefined : demo ? 'demo mode enabled' : `${envKey} not configured`,
  };
}

export function isNemotronLive() {
  return Boolean(process.env.NEMOTRON_API_KEY) && !isDemoModeGlobal();
}

export function isStripeLive() {
  return Boolean(process.env.STRIPE_SECRET_KEY) && !isDemoModeGlobal();
}

export function isHermesLive() {
  return isEnvConfigured('HERMES_AGENT_URL', ['HERMES_GATEWAY_URL', 'HERMES_WEBHOOK_URL']) && !isDemoModeGlobal();
}

export function isNemoclawLive() {
  return isEnvConfigured('NEMOCLAW_PROXY_URL', ['OPENSHELL_COMMAND', 'NEMOCLAW_POLICY_MODE']) && !isDemoModeGlobal();
}

export function resolveHermesUrl() {
  return firstEnvValue('HERMES_AGENT_URL', ['HERMES_GATEWAY_URL', 'HERMES_WEBHOOK_URL']) || '';
}

export function resolveNemoclawProxyUrl() {
  return firstEnvValue('NEMOCLAW_PROXY_URL', ['OPENSHELL_COMMAND', 'NEMOCLAW_POLICY_MODE']) || '';
}

export function buildProviderStates() {
  return {
    demoMode: isDemoModeGlobal(),
    nemotron: getProviderState('NEMOTRON_API_KEY'),
    stripe: getProviderState('STRIPE_SECRET_KEY'),
    hermes: getProviderState('HERMES_AGENT_URL', ['HERMES_GATEWAY_URL', 'HERMES_WEBHOOK_URL']),
    nemoclaw: getProviderState('NEMOCLAW_PROXY_URL', ['OPENSHELL_COMMAND', 'NEMOCLAW_POLICY_MODE']),
  };
}
