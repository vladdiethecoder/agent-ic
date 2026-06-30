const LOCAL_URL_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?/i;
const SECRET_PLACEHOLDER_RE = /(\.\.\.|changeme|replace-me|example|dummy|placeholder)/i;

export function deploymentMode(env = process.env) {
  return env.AGENT_IC_DEPLOYMENT_MODE || (env.NODE_ENV === 'production' ? 'production' : 'development');
}

export function isProductionMode(env = process.env) {
  return deploymentMode(env) === 'production';
}

export function publicAppUrl(env = process.env) {
  return env.NEXT_PUBLIC_APP_URL || env.AGENT_IC_PUBLIC_APP_URL || '';
}

export function validateProductionConfig(env = process.env) {
  const mode = deploymentMode(env);
  const production = mode === 'production';
  const checks = [];

  addCheck(checks, 'node_env', Boolean(env.NODE_ENV), 'NODE_ENV is set', production);
  addCheck(checks, 'public_app_url_present', Boolean(publicAppUrl(env)), 'Public app URL is configured', production);
  addCheck(
    checks,
    'public_app_url_not_local_in_production',
    !production || !LOCAL_URL_RE.test(publicAppUrl(env)),
    'Production public app URL is not localhost'
  );
  addCheck(
    checks,
    'public_app_url_https_in_production',
    !production || publicAppUrl(env).startsWith('https://'),
    'Production public app URL uses HTTPS'
  );

  addSecretCheck(checks, 'nemotron_api_key', env.NEMOTRON_API_KEY, production, 'NEMOTRON_API_KEY');
  addSecretCheck(checks, 'stripe_secret_key', env.STRIPE_SECRET_KEY, production, 'STRIPE_SECRET_KEY');
  addSecretCheck(checks, 'stripe_webhook_secret', env.STRIPE_WEBHOOK_SECRET, production, 'STRIPE_WEBHOOK_SECRET');
  addCheck(
    checks,
    'strict_live_proof_required_in_production',
    !production || env.AGENT_IC_REQUIRE_LIVE_PROOF === 'true',
    'Production trial execution requires strict live/provider proof mode'
  );
  addCheck(
    checks,
    'local_provider_mode_disabled_in_production',
    !production || env.AGENT_IC_LOCAL_MODE !== 'true',
    'Production provider calls are not disabled by local mode'
  );
  addCheck(
    checks,
    'stripe_secret_is_live_in_production',
    !production || !env.STRIPE_SECRET_KEY || /^sk_live_/.test(env.STRIPE_SECRET_KEY),
    'Production Stripe secret uses live-mode prefix'
  );
  addCheck(
    checks,
    'stripe_webhook_secret_format',
    !env.STRIPE_WEBHOOK_SECRET || /^whsec_/.test(env.STRIPE_WEBHOOK_SECRET),
    'Stripe webhook secret has expected whsec_ prefix'
  );
  addCheck(
    checks,
    'stripe_webhook_secret_live_in_production',
    !production || /^whsec_/.test(env.STRIPE_WEBHOOK_SECRET || ''),
    'Production Stripe webhook secret is configured with whsec_ prefix'
  );
  addCheck(
    checks,
    'stripe_publishable_key_live_in_production',
    !production || !env.STRIPE_PUBLISHABLE_KEY || /^pk_live_/.test(env.STRIPE_PUBLISHABLE_KEY),
    'Production Stripe publishable key uses live-mode prefix when configured'
  );
  addCheck(
    checks,
    'stripe_secret_is_test_or_live',
    !env.STRIPE_SECRET_KEY || /^sk_(test|live)_/.test(env.STRIPE_SECRET_KEY),
    'Stripe secret has expected sk_test/sk_live prefix'
  );

  addCheck(
    checks,
    'auth_config_present_in_production',
    !production || Boolean(env.AGENT_IC_AUTH_ISSUER && env.AGENT_IC_AUTH_AUDIENCE && env.AGENT_IC_AUTH_JWKS_URL),
    'Production auth issuer/audience/JWKS are configured'
  );
  addCheck(
    checks,
    'membership_enforcement_enabled_in_production',
    !production || env.AGENT_IC_AUTH_REQUIRE_MEMBERSHIP === 'true',
    'Production auth requires durable membership enforcement'
  );
  addSecretCheck(checks, 'scim_bearer_token', env.AGENT_IC_SCIM_BEARER_TOKEN, production, 'AGENT_IC_SCIM_BEARER_TOKEN');
  addCheck(
    checks,
    'scim_tenant_configured_in_production',
    !production || Boolean(env.AGENT_IC_SCIM_TENANT_ID),
    'Production SCIM tenant binding is configured'
  );
  addCheck(
    checks,
    'browser_session_max_age_valid',
    validPositiveInt(env.AGENT_IC_SESSION_MAX_AGE_SECONDS || String(8 * 60 * 60)),
    'Browser session max age is valid'
  );
  addCheck(
    checks,
    'durable_store_present_in_production',
    !production || Boolean(env.AGENT_IC_DATA_STORE_URL || env.DATABASE_URL),
    'Production durable data store is configured'
  );
  addCheck(
    checks,
    'database_url_valid_format',
    !production || !env.DATABASE_URL || /^postgres(ql)?:\/\//.test(env.DATABASE_URL),
    'Production DATABASE_URL has valid PostgreSQL format'
  );
  addCheck(
    checks,
    'audit_signing_key_present_in_production',
    !production || validSecret(env.AGENT_IC_AUDIT_SIGNING_KEY, 24),
    'Production audit signing key is configured'
  );
  addSecretCheck(checks, 'export_signing_key', env.AGENT_IC_EXPORT_SIGNING_KEY || env.AGENT_IC_AUDIT_SIGNING_KEY, production, 'AGENT_IC_EXPORT_SIGNING_KEY');
  addCheck(
    checks,
    'export_signatures_required_in_production',
    !production || env.AGENT_IC_EXPORT_REQUIRE_SIGNATURES === 'true',
    'Production export bundle signatures are required'
  );
  addCheck(
    checks,
    'immutable_export_store_configured_in_production',
    !production || Boolean(env.AGENT_IC_EXPORT_ARCHIVE_URL),
    'Production immutable export archive store URL is configured'
  );
  addCheck(
    checks,
    'key_rotation_policy_configured_in_production',
    !production || Boolean(env.AGENT_IC_KEY_MAX_AGE_DAYS || env.AGENT_IC_KEY_EXPIRE_WARNING_DAYS || env.AGENT_IC_KEY_ROTATION_POLICY_REQUIRED),
    'Production key rotation policy is configured'
  );
  addCheck(
    checks,
    'kms_backend_configured_in_production',
    !production || !env.AGENT_IC_KMS_REQUIRED || Boolean(env.AGENT_IC_KMS_BACKEND),
    'Production KMS backend is configured when required'
  );
  addCheck(
    checks,
    'key_access_policy_configured_in_production',
    !production || Boolean(env.AGENT_IC_KEY_ACCESS_POLICY_REQUIRED),
    'Production key access policy is configured'
  );
  addCheck(
    checks,
    'key_approval_workflow_configured_in_production',
    !production || Boolean(env.AGENT_IC_KEY_APPROVAL_WORKFLOW_REQUIRED),
    'Production key approval workflow is configured'
  );

  addCheck(
    checks,
    'audit_signatures_required_in_production',
    !production || env.AGENT_IC_AUDIT_REQUIRE_SIGNATURES === 'true',
    'Production audit signature verification is required'
  );
  addCheck(
    checks,
    'telemetry_export_configured_in_production',
    !production || Boolean(env.AGENT_IC_TELEMETRY_EXPORT_URL || env.OTEL_EXPORTER_OTLP_ENDPOINT),
    'Production telemetry export endpoint is configured'
  );
  addCheck(
    checks,
    'telemetry_export_https_in_production',
    !production || telemetryEndpoint(env).startsWith('https://'),
    'Production telemetry export endpoint uses HTTPS'
  );

  addCheck(
    checks,
    'shared_rate_limiter_configured_in_production',
    !production || Boolean(env.AGENT_IC_RATE_LIMIT_BACKEND_URL || env.REDIS_URL || env.UPSTASH_REDIS_REST_URL),
    'Production shared rate-limit backend is configured'
  );

  addCheck(
    checks,
    'rate_limit_config_valid',
    validPositiveInt(env.AGENT_IC_RATE_LIMIT_MAX || '30') && validPositiveInt(env.AGENT_IC_RATE_LIMIT_WINDOW_MS || '60000'),
    'Rate limit config is valid'
  );

  const blockers = checks.filter((check) => check.required && !check.ok);
  return {
    ok: blockers.length === 0,
    mode,
    production,
    status: blockers.length === 0 ? 'ready' : 'not_ready',
    blockers: blockers.map(({ id, message }) => ({ id, message })),
    checks,
  };
}

function telemetryEndpoint(env) {
  return env.AGENT_IC_TELEMETRY_EXPORT_URL || env.OTEL_EXPORTER_OTLP_ENDPOINT || '';
}

function addSecretCheck(checks, id, value, required, label) {
  addCheck(checks, `${id}_present`, !required || Boolean(value), `${label} is configured`, required);
  addCheck(checks, `${id}_not_placeholder`, !value || validSecret(value, 12), `${label} is not a placeholder`, Boolean(value));
}

function addCheck(checks, id, ok, message, required = true) {
  checks.push({ id, ok: Boolean(ok), required, message });
}

function validSecret(value, minLength) {
  return typeof value === 'string' && value.length >= minLength && !SECRET_PLACEHOLDER_RE.test(value);
}

function validPositiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}
