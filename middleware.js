import { NextResponse } from 'next/server.js';
import { rateLimitIdentity, rateLimitKey } from './lib/rateLimitPolicy.js';

export const AGENT_IC_API_VERSION = '2026-06-23.foundation-v1';

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://integrate.api.nvidia.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
].join('; ');

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=() ',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const buckets = new Map();

export function middleware(request) {
  const version = apiVersionCheck(request);
  if (!version.ok) return withSecurityHeaders(NextResponse.json({ error: 'Unsupported Agent IC API version', code: 'unsupported_api_version', supportedVersion: AGENT_IC_API_VERSION }, { status: 400 }), request);

  if (request.method === 'OPTIONS' && request.nextUrl.pathname.startsWith('/api/')) {
    return withSecurityHeaders(new NextResponse(null, { status: 204 }), request);
  }

  if (request.nextUrl.pathname.startsWith('/api/') && MUTATION_METHODS.has(request.method)) {
    const limit = rateLimit(request);
    if (!limit.ok) {
      return withSecurityHeaders(
        NextResponse.json(
          { error: 'Too many requests', code: 'rate_limited', retryAfterSeconds: limit.retryAfterSeconds },
          { status: 429 }
        ),
        request,
        limit
      );
    }
    return withSecurityHeaders(NextResponse.next(), request, limit);
  }

  return withSecurityHeaders(NextResponse.next(), request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.svg).*)'],
};

function withSecurityHeaders(response, request, rateLimitState = null) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value.trim());
  }
  response.headers.set('content-security-policy-report-only', CSP_REPORT_ONLY);
  response.headers.set('x-agent-ic-csp-mode', 'report-only');
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('x-agent-ic-api-version', AGENT_IC_API_VERSION);
    response.headers.set('x-agent-ic-api-deprecation-policy', 'no-removal-without-documented-successor');
  }
  if (process.env.AGENT_IC_DEPLOYMENT_MODE === 'production' || request.nextUrl.protocol === 'https:') {
    response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin') || '';
    const allowed = allowedOrigin(origin, request);
    response.headers.set('vary', 'Origin');
    response.headers.set('access-control-allow-origin', allowed);
    response.headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
    response.headers.set('access-control-allow-headers', 'content-type,authorization,x-agent-ic-tenant,x-requested-with,x-agent-ic-csrf');
    response.headers.set('access-control-max-age', '600');
  }

  if (rateLimitState) {
    response.headers.set('x-ratelimit-limit', String(rateLimitState.limit));
    if (rateLimitState.identity) response.headers.set('x-ratelimit-scope', `${rateLimitState.identity.tenantId}:${rateLimitState.identity.role}`);
    response.headers.set('x-ratelimit-remaining', String(Math.max(0, rateLimitState.remaining)));
    response.headers.set('x-ratelimit-reset', String(rateLimitState.resetAt));
    if (!rateLimitState.ok) response.headers.set('retry-after', String(rateLimitState.retryAfterSeconds));
  }

  return response;
}

function apiVersionCheck(request) {
  if (!request.nextUrl.pathname.startsWith('/api/')) return { ok: true };
  const requested = request.headers.get('x-agent-ic-api-version') || '';
  if (!requested) return { ok: true };
  return { ok: requested === AGENT_IC_API_VERSION };
}

function allowedOrigin(origin, request) {
  const configured = (process.env.AGENT_IC_ALLOWED_ORIGINS || process.env.NEXT_PUBLIC_APP_URL || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const self = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const allowed = new Set([self, ...configured]);
  if (origin && allowed.has(origin)) return origin;
  return self;
}

function rateLimit(request) {
  const limit = Number(process.env.AGENT_IC_RATE_LIMIT_MAX || 30);
  const windowMs = Number(process.env.AGENT_IC_RATE_LIMIT_WINDOW_MS || 60_000);
  const now = Date.now();
  const key = rateLimitKey(request);
  const existing = buckets.get(key);
  const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);
  cleanupBuckets(now);

  const remaining = limit - bucket.count;
  const ok = bucket.count <= limit;
  return {
    ok,
    limit,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    identity: rateLimitIdentity(request),
  };
}

function clientId(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
}

function cleanupBuckets(now) {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
