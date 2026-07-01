export function rateLimitIdentity(request) {
  const bearer = bearerToken(request.headers.get('authorization'));
  const jwt = bearer ? parseJwtPayload(bearer) : null;
  const tenantId = safePart(jwt?.tenantId || jwt?.tid || jwt?.org_id || request.headers.get('x-agent-ic-tenant') || request.headers.get('x-tenant-id') || 'unknown-tenant');
  const userId = safePart(jwt?.sub || jwt?.userId || request.headers.get('x-agent-ic-user') || request.headers.get('x-user-id') || clientIp(request));
  const role = safePart(jwt?.role || jwt?.agent_ic_role || request.headers.get('x-agent-ic-role') || 'unknown-role');
  return { tenantId, userId, role, ip: clientIp(request) };
}

export function rateLimitKey(request) {
  const identity = rateLimitIdentity(request);
  return `${identity.tenantId}:${identity.userId}:${identity.role}:${request.method}:${request.nextUrl.pathname}`;
}

export function hasSharedRateLimitBackend(env = process.env) {
  return Boolean(env.AGENT_IC_RATE_LIMIT_BACKEND_URL || env.REDIS_URL || env.UPSTASH_REDIS_REST_URL);
}

function bearerToken(header) {
  const match = String(header || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function parseJwtPayload(token) {
  try {
    const [, payload] = String(token).split('.');
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function clientIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
}

function safePart(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9_.@:-]/g, '_').slice(0, 120);
}
