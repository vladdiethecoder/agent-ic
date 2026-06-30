import { createHmac, createPublicKey, createSign, createVerify, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NextResponse } from 'next/server.js';
import { isProductionMode } from './productionConfig.js';
import { assertActiveMembership } from './membershipStore.js';
import { principalFromSessionToken, sessionTokenFromRequest } from './sessionStore.js';
import { hasPermission, knownRole } from './rbac.js';

const DEMO_PRINCIPAL = Object.freeze({
  userId: 'demo-user',
  tenantId: 'demo-tenant',
  role: 'owner',
  source: 'demo',
});

const globalForJwks = globalThis;
if (!globalForJwks.__agentIcJwksCache) globalForJwks.__agentIcJwksCache = new Map();

export function principalFromRequest(request, { allowDemo = true, env = process.env } = {}) {
  const bearer = bearerToken(request.headers.get('authorization'));
  if (bearer) {
    const verified = verifyJwtPrincipal(bearer, env);
    if (!verified.ok) return { ok: false, response: authError(401, verified.code, verified.message) };
    return validatePrincipal(verified.principal, env);
  }

  const sessionToken = sessionTokenFromRequest(request);
  if (sessionToken) {
    const session = principalFromSessionToken(sessionToken);
    if (!session.ok) return { ok: false, response: authError(401, session.code, session.message) };
    return validatePrincipal(session.principal, env);
  }

  const headerPrincipal = principalFromTrustedHeaders(request);
  if (headerPrincipal && (!isProductionMode(env) || env.AGENT_IC_AUTH_ALLOW_TRUSTED_HEADERS === 'true')) {
    return validatePrincipal(headerPrincipal, env);
  }

  if (!isProductionMode(env) && allowDemo) {
    return { ok: true, principal: DEMO_PRINCIPAL };
  }

  return {
    ok: false,
    response: authError(401, 'authentication_required', 'Valid bearer token or browser session with tenant, user, and role claims is required'),
  };
}

export function requireApiAccess(request, permission, options = {}) {
  const principalResult = principalFromRequest(request, options);
  if (!principalResult.ok) return principalResult;

  const principal = principalResult.principal;
  if (!hasPermission(principal.role, permission)) {
    return {
      ok: false,
      response: authError(403, 'permission_denied', `Role '${principal.role}' lacks '${permission}'`, {
        requiredPermission: permission,
      }),
      principal,
    };
  }

  return { ok: true, principal };
}
export async function principalFromRequestAsync(request, { allowDemo = true, env = process.env } = {}) {
  const bearer = bearerToken(request.headers.get('authorization'));
  if (bearer) {
    const verified = await verifyJwtPrincipalAsync(bearer, env);
    if (!verified.ok) return { ok: false, response: authError(401, verified.code, verified.message) };
    return validatePrincipal(verified.principal, env);
  }
  return principalFromRequest(request, { allowDemo, env });
}

export async function requireApiAccessAsync(request, permission, options = {}) {
  const principalResult = await principalFromRequestAsync(request, options);
  if (!principalResult.ok) return principalResult;

  const principal = principalResult.principal;
  if (!hasPermission(principal.role, permission)) {
    return {
      ok: false,
      response: authError(403, 'permission_denied', `Role '${principal.role}' lacks '${permission}'`, {
        requiredPermission: permission,
      }),
      principal,
    };
  }

  return { ok: true, principal };
}


export function requireTenantScope(principal, candidateTenantId) {
  if (!candidateTenantId) return { ok: true };
  if (candidateTenantId === principal.tenantId) return { ok: true };
  return {
    ok: false,
    response: authError(403, 'tenant_scope_violation', 'Request tenant does not match authenticated tenant'),
  };
}

export function tenantFromBody(body = {}) {
  const value = body.tenantId || body.organizationId || body.orgId;
  return typeof value === 'string' ? value.trim() : '';
}

export function tenantFromUrl(request) {
  const value = new URL(request.url).searchParams.get('tenantId');
  return typeof value === 'string' ? value.trim() : '';
}

export function authContext(principal) {
  return {
    tenantId: principal.tenantId,
    userId: principal.userId,
    role: principal.role,
    authSource: principal.source,
  };
}

export function signTestJwt(payload, secret, { expiresInSeconds = 3600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { iat: now, exp: now + expiresInSeconds, ...payload };
  const unsigned = `${base64urlJson(header)}.${base64urlJson(body)}`;
  const signature = hmacSha256(unsigned, secret);
  return `${unsigned}.${signature}`;
}

export function signTestRs256Jwt(payload, privateKey, { kid = 'test-key', expiresInSeconds = 3600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const body = { iat: now, exp: now + expiresInSeconds, ...payload };
  const unsigned = `${base64urlJson(header)}.${base64urlJson(body)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey).toString('base64url');
  return `${unsigned}.${signature}`;
}

function verifyJwtPrincipal(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, code: 'invalid_token', message: 'Bearer token must be a JWT' };
  const [headerPart, payloadPart, signature] = parts;
  const header = parseBase64Json(headerPart);
  const payload = parseBase64Json(payloadPart);
  if (!header || !payload) return { ok: false, code: 'invalid_token', message: 'Bearer token has invalid JSON' };
  const signedInput = `${headerPart}.${payloadPart}`;
  const signatureCheck = verifyJwtSignature({ alg: header.alg, kid: header.kid, signedInput, signature, env });
  if (!signatureCheck.ok) return signatureCheck;
  return validateJwtPayload(payload, env);
}

async function verifyJwtPrincipalAsync(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, code: 'invalid_token', message: 'Bearer token must be a JWT' };
  const [headerPart, payloadPart, signature] = parts;
  const header = parseBase64Json(headerPart);
  const payload = parseBase64Json(payloadPart);
  if (!header || !payload) return { ok: false, code: 'invalid_token', message: 'Bearer token has invalid JSON' };
  const signedInput = `${headerPart}.${payloadPart}`;
  const signatureCheck = await verifyJwtSignatureAsync({ alg: header.alg, kid: header.kid, signedInput, signature, env });
  if (!signatureCheck.ok) return signatureCheck;
  return validateJwtPayload(payload, env);
}

function validateJwtPayload(payload, env) {
  const now = Math.floor(Date.now() / 1000);
  if (Number.isFinite(Number(payload.exp)) && Number(payload.exp) <= now) {
    return { ok: false, code: 'token_expired', message: 'Bearer token is expired' };
  }
  if (env.AGENT_IC_AUTH_ISSUER && payload.iss !== env.AGENT_IC_AUTH_ISSUER) {
    return { ok: false, code: 'issuer_mismatch', message: 'Bearer token issuer does not match' };
  }
  if (env.AGENT_IC_AUTH_AUDIENCE) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.AGENT_IC_AUTH_AUDIENCE)) {
      return { ok: false, code: 'audience_mismatch', message: 'Bearer token audience does not match' };
    }
  }
  return {
    ok: true,
    principal: {
      userId: String(payload.sub || payload.userId || ''),
      tenantId: String(payload.tenantId || payload.tid || payload.org_id || ''),
      role: String(payload.role || payload.agent_ic_role || ''),
      source: 'jwt',
    },
  };
}

function validatePrincipal(principal, env = process.env) {
  if (!principal?.userId || !principal?.tenantId || !principal?.role) {
    return { ok: false, response: authError(401, 'principal_claims_missing', 'Principal must include user, tenant, and role') };
  }
  if (!knownRole(principal.role)) {
    return { ok: false, response: authError(403, 'unknown_role', `Unknown role: ${principal.role}`) };
  }
  if (env.AGENT_IC_AUTH_REQUIRE_MEMBERSHIP === 'true') {
    const membership = assertActiveMembership(principal);
    if (!membership.ok) {
      return { ok: false, response: authError(403, membership.code, membership.message) };
    }
    principal.membership = { status: membership.membership.status, role: membership.membership.role };
  }
  return { ok: true, principal };
}

function principalFromTrustedHeaders(request) {
  const headers = request.headers;
  const userId = firstHeader(headers, ['x-agent-ic-user', 'x-user-id']);
  const tenantId = firstHeader(headers, ['x-agent-ic-tenant', 'x-tenant-id']);
  const role = firstHeader(headers, ['x-agent-ic-role', 'x-role']);
  if (!userId || !tenantId || !role) return null;
  return { userId, tenantId, role, source: 'trusted-headers' };
}

function firstHeader(headers, names) {
  for (const name of names) {
    const value = headers.get(name);
    if (value && value.trim()) return value.trim();
  }
  return '';
}

function bearerToken(header) {
  const match = String(header || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function authError(status, code, message, extra = {}) {
  return NextResponse.json({ error: message, code, ...extra }, { status });
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function parseBase64Json(value) {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}


async function verifyJwtSignatureAsync({ alg, kid, signedInput, signature, env }) {
  if (alg === 'RS256' && env.AGENT_IC_AUTH_JWKS_URL && !env.AGENT_IC_AUTH_JWKS_JSON && !env.AGENT_IC_AUTH_JWKS_FILE) {
    const jwks = await fetchJwks(env);
    const jwk = selectJwk(jwks, kid);
    if (!jwk) return { ok: false, code: 'jwks_key_not_found', message: 'No matching JWKS key found for bearer token' };
    return verifyRs256Signature({ jwk, signedInput, signature });
  }
  return verifyJwtSignature({ alg, kid, signedInput, signature, env });
}

async function fetchJwks(env) {
  const url = env.AGENT_IC_AUTH_JWKS_URL;
  if (!url) return null;
  if (env.AGENT_IC_DEPLOYMENT_MODE === 'production' && !String(url).startsWith('https://')) {
    return null;
  }
  const ttlMs = Number(env.AGENT_IC_AUTH_JWKS_CACHE_MS || 300000);
  const cache = globalForJwks.__agentIcJwksCache;
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.jwks;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.AGENT_IC_AUTH_JWKS_TIMEOUT_MS || 5000));
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const jwks = await res.json();
    cache.set(url, { jwks, expiresAt: Date.now() + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 300000) });
    return jwks;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function verifyJwtSignature({ alg, kid, signedInput, signature, env }) {
  if (alg === 'HS256') {
    const secret = env.AGENT_IC_AUTH_HS256_SECRET || env.AGENT_IC_AUDIT_SIGNING_KEY;
    if (!secret) return { ok: false, code: 'auth_secret_missing', message: 'Auth verification secret is not configured' };
    const expected = hmacSha256(signedInput, secret);
    if (!safeEqual(signature, expected)) return { ok: false, code: 'invalid_token_signature', message: 'Bearer token signature is invalid' };
    return { ok: true };
  }

  if (alg === 'RS256') {
    const jwk = selectJwk(loadJwks(env), kid);
    if (!jwk) return { ok: false, code: 'jwks_key_not_found', message: 'No matching JWKS key found for bearer token' };
    return verifyRs256Signature({ jwk, signedInput, signature });
  }

  return { ok: false, code: 'unsupported_token_alg', message: 'Only HS256 and RS256 auth tokens are supported by this adapter' };
}

function verifyRs256Signature({ jwk, signedInput, signature }) {
  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signedInput);
    verifier.end();
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    const valid = verifier.verify(publicKey, Buffer.from(signature, 'base64url'));
    return valid ? { ok: true } : { ok: false, code: 'invalid_token_signature', message: 'Bearer token signature is invalid' };
  } catch {
    return { ok: false, code: 'jwks_verification_failed', message: 'JWKS signature verification failed' };
  }
}

function loadJwks(env) {
  if (env.AGENT_IC_AUTH_JWKS_JSON) {
    try { return JSON.parse(env.AGENT_IC_AUTH_JWKS_JSON); } catch { return null; }
  }
  if (env.AGENT_IC_AUTH_JWKS_FILE) {
    try { return JSON.parse(readFileSync(env.AGENT_IC_AUTH_JWKS_FILE, 'utf8')); } catch { return null; }
  }
  return null;
}

function selectJwk(jwks, kid) {
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  if (kid) return keys.find((key) => key.kid === kid) || null;
  return keys.find((key) => key.kty === 'RSA') || null;
}

function hmacSha256(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
