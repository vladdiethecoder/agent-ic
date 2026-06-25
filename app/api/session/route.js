import { NextResponse } from 'next/server.js';
import { appendAudit } from '../../../lib/auditStore.js';
import { authContext, principalFromRequestAsync } from '../../../lib/authz.js';
import { clearCsrfCookieHeader, clearSessionCookieHeader, createSession, csrfCookieHeader, getSessionByToken, revokeSessionByToken, sessionCookieHeader, sessionTokenFromRequest } from '../../../lib/sessionStore.js';
import { jsonError, readJsonBody } from '../../../lib/validation.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const access = await principalFromRequestAsync(request, { allowDemo: false });
  if (!access.ok) return access.response;
  const token = sessionTokenFromRequest(request);
  const session = token ? getSessionByToken(token) : null;
  return NextResponse.json({
    authenticated: true,
    auth: authContext(access.principal),
    session: session?.ok ? session.session : null,
  });
}

export async function POST(request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const access = await principalFromRequestAsync(request, { allowDemo: false });
  if (!access.ok) return access.response;
  const body = parsed.body || {};
  const principal = access.principal;
  const maxAgeSeconds = body.maxAgeSeconds;
  try {
    const { token, csrfToken, session } = createSession({
      userId: principal.userId,
      tenantId: principal.tenantId,
      role: principal.role,
      source: principal.source,
      provider: body.provider || principal.source || 'oidc',
      displayName: body.displayName || principal.userId,
      expiresInSeconds: maxAgeSeconds,
      createdBy: principal.userId,
    });
    appendAudit({ ...authContext(principal), kind: 'auth', action: 'session_created', detail: `Browser session ${session.sessionId} created`, sessionId: session.sessionId });
    const response = NextResponse.json({ authenticated: true, auth: authContext({ ...principal, source: 'session' }), session });
    response.headers.append('set-cookie', sessionCookieHeader(token, { maxAgeSeconds }));
    response.headers.append('set-cookie', csrfCookieHeader(csrfToken, { maxAgeSeconds }));
    return response;
  } catch (error) {
    return jsonError(400, 'session_create_failed', error.message);
  }
}

export async function DELETE(request) {
  const token = sessionTokenFromRequest(request);
  let revoked = null;
  if (token) {
    const current = getSessionByToken(token);
    revoked = revokeSessionByToken(token, { revokedBy: current.ok ? current.session.userId : 'browser' });
    if (current.ok) {
      appendAudit({ ...authContext(current.principal), kind: 'auth', action: 'session_revoked', detail: `Browser session ${current.session.sessionId} revoked`, sessionId: current.session.sessionId });
    }
  }
  const response = NextResponse.json({ ok: true, loggedOut: true, revoked: revoked?.ok ? revoked.session : null });
  response.headers.append('set-cookie', clearSessionCookieHeader());
  response.headers.append('set-cookie', clearCsrfCookieHeader());
  return response;
}
