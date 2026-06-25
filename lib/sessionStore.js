import { createHash, randomBytes } from 'node:crypto';
import { readRootCollection, writeRootCollection } from './tenantStore.js';

export const SESSION_COOKIE_NAME = 'agent_ic_session';
export const CSRF_COOKIE_NAME = 'agent_ic_csrf';
const COLLECTION = 'browser-sessions';
const EMPTY_STATE = { sessions: [] };
const DEFAULT_MAX_AGE_SECONDS = 8 * 60 * 60;

export function createSession({ userId, tenantId, role, source = 'session', provider = 'oidc', displayName = '', expiresInSeconds, createdBy } = {}) {
  if (!userId) throw new Error('userId is required');
  if (!tenantId) throw new Error('tenantId is required');
  if (!role) throw new Error('role is required');
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const now = new Date();
  const maxAge = normalizeMaxAge(expiresInSeconds);
  const session = {
    sessionId: `sess_${randomBytes(12).toString('base64url')}`,
    tokenHash: hashToken(token),
    csrfTokenHash: hashToken(csrfToken),
    userId: String(userId),
    tenantId: String(tenantId),
    role: String(role),
    source: String(source || 'session'),
    provider: String(provider || 'oidc'),
    displayName: String(displayName || userId).slice(0, 200),
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + maxAge * 1000).toISOString(),
    createdBy: String(createdBy || userId),
  };
  const state = readState();
  state.sessions.push(session);
  writeState(state);
  return { token, csrfToken, session: publicSession(session) };
}

export function getSessionByToken(token, { touch = false } = {}) {
  if (!token) return { ok: false, code: 'session_missing', message: 'Session cookie is missing' };
  const state = readState();
  const tokenHash = hashToken(token);
  const session = state.sessions.find((item) => item.tokenHash === tokenHash);
  if (!session) return { ok: false, code: 'session_not_found', message: 'Browser session was not found' };
  if (session.status !== 'active') return { ok: false, code: 'session_revoked', message: 'Browser session is not active' };
  if (Date.parse(session.expiresAt) <= Date.now()) return { ok: false, code: 'session_expired', message: 'Browser session is expired' };
  if (touch) {
    session.lastSeenAt = new Date().toISOString();
    session.updatedAt = session.lastSeenAt;
    writeState(state);
  }
  return { ok: true, session: publicSession(session), principal: sessionPrincipal(session) };
}

export function principalFromSessionToken(token) {
  return getSessionByToken(token, { touch: true });
}

export function revokeSessionByToken(token, { revokedBy = 'system' } = {}) {
  if (!token) return { ok: false, code: 'session_missing', message: 'Session cookie is missing' };
  const state = readState();
  const tokenHash = hashToken(token);
  const session = state.sessions.find((item) => item.tokenHash === tokenHash);
  if (!session) return { ok: false, code: 'session_not_found', message: 'Browser session was not found' };
  session.status = 'revoked';
  session.revokedAt = new Date().toISOString();
  session.revokedBy = String(revokedBy || 'system');
  session.updatedAt = session.revokedAt;
  writeState(state);
  return { ok: true, session: publicSession(session) };
}

export function listSessions({ tenantId, userId, status } = {}) {
  return readState().sessions
    .filter((session) => !tenantId || session.tenantId === tenantId)
    .filter((session) => !userId || session.userId === userId)
    .filter((session) => !status || session.status === status)
    .map(publicSession)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function sessionTokenFromRequest(request) {
  return cookieValue(request?.headers?.get?.('cookie') || '', SESSION_COOKIE_NAME);
}

export function csrfTokenFromRequest(request) {
  return request?.headers?.get?.('x-agent-ic-csrf') || request?.headers?.get?.('x-csrf-token') || '';
}

export function csrfCookieFromRequest(request) {
  return cookieValue(request?.headers?.get?.('cookie') || '', CSRF_COOKIE_NAME);
}

export function verifyCsrfForSession(request) {
  const sessionToken = sessionTokenFromRequest(request);
  if (!sessionToken) return { ok: true, required: false };
  const csrfHeader = csrfTokenFromRequest(request);
  const csrfCookie = csrfCookieFromRequest(request);
  if (!csrfHeader || !csrfCookie) return { ok: false, required: true, code: 'csrf_required', message: 'Session-authenticated mutations require a CSRF token' };
  if (csrfHeader !== csrfCookie) return { ok: false, required: true, code: 'csrf_mismatch', message: 'CSRF token does not match the browser session' };
  const state = readState();
  const tokenHash = hashToken(sessionToken);
  const session = state.sessions.find((item) => item.tokenHash === tokenHash);
  if (!session || session.status !== 'active' || Date.parse(session.expiresAt) <= Date.now()) {
    return { ok: false, required: true, code: 'csrf_session_invalid', message: 'Session is not active for CSRF validation' };
  }
  if (session.csrfTokenHash !== hashToken(csrfHeader)) return { ok: false, required: true, code: 'csrf_mismatch', message: 'CSRF token does not match the browser session' };
  return { ok: true, required: true };
}

export function sessionCookieHeader(token, { env = process.env, maxAgeSeconds } = {}) {
  const maxAge = normalizeMaxAge(maxAgeSeconds || env.AGENT_IC_SESSION_MAX_AGE_SECONDS);
  return serializeCookie(SESSION_COOKIE_NAME, token, { maxAge, secure: isSecureCookie(env) });
}

export function csrfCookieHeader(csrfToken, { env = process.env, maxAgeSeconds } = {}) {
  const maxAge = normalizeMaxAge(maxAgeSeconds || env.AGENT_IC_SESSION_MAX_AGE_SECONDS);
  return serializeCookie(CSRF_COOKIE_NAME, csrfToken, { maxAge, secure: isSecureCookie(env), httpOnly: false });
}

export function clearSessionCookieHeader({ env = process.env } = {}) {
  return serializeCookie(SESSION_COOKIE_NAME, '', { maxAge: 0, secure: isSecureCookie(env) });
}

export function clearCsrfCookieHeader({ env = process.env } = {}) {
  return serializeCookie(CSRF_COOKIE_NAME, '', { maxAge: 0, secure: isSecureCookie(env), httpOnly: false });
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function readState() {
  const state = readRootCollection(COLLECTION, EMPTY_STATE);
  return { sessions: Array.isArray(state.sessions) ? state.sessions : [] };
}

function writeState(state) {
  return writeRootCollection(COLLECTION, { sessions: state.sessions || [] });
}

function publicSession(session) {
  const { tokenHash, csrfTokenHash, ...safe } = session;
  return { ...safe };
}

function sessionPrincipal(session) {
  return {
    userId: session.userId,
    tenantId: session.tenantId,
    role: session.role,
    source: 'session',
    sessionId: session.sessionId,
  };
}

function normalizeMaxAge(value) {
  const parsed = Number(value || DEFAULT_MAX_AGE_SECONDS);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 7 * 24 * 60 * 60) : DEFAULT_MAX_AGE_SECONDS;
}

function cookieValue(header, name) {
  const parts = String(header || '').split(';');
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (key === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return '';
}

function serializeCookie(name, value, { maxAge, secure, httpOnly = true }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function isSecureCookie(env) {
  return env.AGENT_IC_DEPLOYMENT_MODE === 'production' || String(env.NEXT_PUBLIC_APP_URL || env.AGENT_IC_PUBLIC_APP_URL || '').startsWith('https://');
}
