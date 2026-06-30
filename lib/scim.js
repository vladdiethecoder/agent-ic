import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { appendAudit } from './auditStore.js';
import { deactivateMembership, getMembership, listMemberships, upsertMembership } from './membershipStore.js';
import { knownRole, ROLES } from './rbac.js';
import { readJsonBody } from './validation.js';

export const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';
export const AGENT_IC_SCIM_EXTENSION = 'urn:agentic:params:scim:schemas:extension:membership:2.0:User';

export function requireScimAccess(request, env = process.env) {
  const configuredToken = env.AGENT_IC_SCIM_BEARER_TOKEN;
  const tenantId = env.AGENT_IC_SCIM_TENANT_ID;
  if (!configuredToken || !tenantId) {
    return { ok: false, response: scimError(503, 'invalidValue', 'SCIM provisioning is not configured') };
  }
  const token = bearerToken(request.headers.get('authorization'));
  if (!token || !safeEqual(token, configuredToken)) {
    return { ok: false, response: scimError(401, 'invalidValue', 'Valid SCIM bearer token is required') };
  }
  return { ok: true, tenantId, actor: 'scim-idp' };
}

export async function createScimUser(request) {
  const access = requireScimAccess(request);
  if (!access.ok) return access.response;
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const result = upsertFromScimBody({ tenantId: access.tenantId, body: parsed.body, actor: access.actor });
  if (!result.ok) return scimError(400, 'invalidValue', result.message);
  appendScimAudit(access, 'scim_user_upserted', `SCIM provisioned ${result.membership.userId}`, result.membership);
  return scimJson(scimUser(result.membership), 201);
}

export function listScimUsers(request) {
  const access = requireScimAccess(request);
  if (!access.ok) return access.response;
  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') || '';
  let memberships = listMemberships({ tenantId: access.tenantId });
  const username = parseUserNameFilter(filter);
  if (username) memberships = memberships.filter((membership) => membership.userId === username);
  const startIndex = Math.max(1, Number(url.searchParams.get('startIndex') || 1));
  const count = Math.max(1, Math.min(200, Number(url.searchParams.get('count') || 100)));
  const page = memberships.slice(startIndex - 1, startIndex - 1 + count);
  return scimJson({
    schemas: [SCIM_LIST_SCHEMA],
    totalResults: memberships.length,
    startIndex,
    itemsPerPage: page.length,
    Resources: page.map(scimUser),
  });
}

export function getScimUser(request, userId) {
  const access = requireScimAccess(request);
  if (!access.ok) return access.response;
  const membership = getMembership({ tenantId: access.tenantId, userId });
  if (!membership) return scimError(404, 'notFound', `SCIM user not found: ${userId}`);
  return scimJson(scimUser(membership));
}

export async function replaceScimUser(request, userId) {
  const access = requireScimAccess(request);
  if (!access.ok) return access.response;
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const result = upsertFromScimBody({ tenantId: access.tenantId, body: { ...parsed.body, userName: parsed.body.userName || userId }, actor: access.actor });
  if (!result.ok) return scimError(400, 'invalidValue', result.message);
  appendScimAudit(access, 'scim_user_replaced', `SCIM replaced ${result.membership.userId}`, result.membership);
  return scimJson(scimUser(result.membership));
}

export async function patchScimUser(request, userId) {
  const access = requireScimAccess(request);
  if (!access.ok) return access.response;
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const existing = getMembership({ tenantId: access.tenantId, userId });
  if (!existing) return scimError(404, 'notFound', `SCIM user not found: ${userId}`);
  const patch = patchFields(parsed.body);
  const membership = upsertMembership({
    tenantId: access.tenantId,
    userId,
    role: patch.role || existing.role,
    status: patch.active === false ? 'inactive' : 'active',
    displayName: patch.displayName ?? existing.displayName,
    emails: patch.emails ?? existing.emails,
    externalId: patch.externalId ?? existing.externalId,
    scimSyncedAt: new Date().toISOString(),
    scimSource: 'scim',
    updatedBy: access.actor,
  });
  appendScimAudit(access, 'scim_user_patched', `SCIM patched ${membership.userId}`, membership);
  return scimJson(scimUser(membership));
}

export function deleteScimUser(request, userId) {
  const access = requireScimAccess(request);
  if (!access.ok) return access.response;
  const result = deactivateMembership({ tenantId: access.tenantId, userId, updatedBy: access.actor });
  if (!result.ok) return scimError(404, 'notFound', result.message);
  appendScimAudit(access, 'scim_user_deactivated', `SCIM deactivated ${userId}`, result.membership);
  return new NextResponse(null, { status: 204 });
}

export function scimUser(membership) {
  return {
    schemas: [SCIM_USER_SCHEMA, AGENT_IC_SCIM_EXTENSION],
    id: membership.userId,
    externalId: membership.externalId || membership.userId,
    userName: membership.userId,
    displayName: membership.displayName || membership.userId,
    active: membership.status === 'active',
    emails: Array.isArray(membership.emails) ? membership.emails : [],
    [AGENT_IC_SCIM_EXTENSION]: {
      tenantId: membership.tenantId,
      role: membership.role,
      roleLabel: ROLES[membership.role]?.name || membership.role,
      status: membership.status,
    },
    meta: {
      resourceType: 'User',
      created: membership.createdAt,
      lastModified: membership.updatedAt,
    },
  };
}

function upsertFromScimBody({ tenantId, body, actor }) {
  const userId = String(body.userName || body.id || '').trim();
  if (!userId) return { ok: false, message: 'SCIM userName is required' };
  const role = roleFromScim(body);
  if (!knownRole(role)) return { ok: false, message: `Unknown Agent IC role: ${role}` };
  const membership = upsertMembership({
    tenantId,
    userId,
    role,
    status: body.active === false ? 'inactive' : 'active',
    displayName: body.displayName || body.name?.formatted || userId,
    externalId: body.externalId || userId,
    emails: body.emails || [],
    scimSyncedAt: new Date().toISOString(),
    scimSource: 'scim',
    updatedBy: actor,
  });
  return { ok: true, membership };
}

function roleFromScim(body, fallback = 'operator') {
  const extension = body[AGENT_IC_SCIM_EXTENSION] || {};
  const explicit = body.role || extension.role;
  if (explicit) return String(explicit);
  const group = Array.isArray(body.groups) ? body.groups.find((item) => knownRole(String(item.value || item.display || ''))) : null;
  return group ? String(group.value || group.display) : fallback;
}

function patchFields(body) {
  const fields = {};
  for (const op of Array.isArray(body.Operations) ? body.Operations : []) {
    const path = String(op.path || '').toLowerCase();
    const value = op.value;
    if (!path && value && typeof value === 'object') Object.assign(fields, normalizePatchObject(value));
    else if (path === 'active') fields.active = value !== false;
    else if (path === 'displayname') fields.displayName = String(value || '');
    else if (path === 'externalid') fields.externalId = String(value || '');
    else if (path === 'emails') fields.emails = Array.isArray(value) ? value : [];
    else if (path.endsWith(':role') || path === 'role') fields.role = String(value || '');
  }
  return fields;
}

function normalizePatchObject(value) {
  return {
    ...(value.active !== undefined ? { active: value.active !== false } : {}),
    ...(value.displayName !== undefined ? { displayName: String(value.displayName || '') } : {}),
    ...(value.externalId !== undefined ? { externalId: String(value.externalId || '') } : {}),
    ...(value.emails !== undefined ? { emails: Array.isArray(value.emails) ? value.emails : [] } : {}),
    ...(value.role || value[AGENT_IC_SCIM_EXTENSION]?.role ? { role: String(value.role || value[AGENT_IC_SCIM_EXTENSION].role) } : {}),
  };
}

function appendScimAudit(access, action, detail, membership) {
  appendAudit({ tenantId: access.tenantId, userId: access.actor, role: 'owner', authSource: 'scim', kind: 'membership', action, detail, targetUserId: membership.userId, targetRole: membership.role });
}

function parseUserNameFilter(filter) {
  const match = String(filter || '').match(/^userName\s+eq\s+"([^"]+)"$/i);
  return match ? match[1] : '';
}

function bearerToken(header) {
  const match = String(header || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function scimJson(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'content-type': 'application/scim+json' } });
}

function scimError(status, scimType, detail) {
  return scimJson({ schemas: [SCIM_ERROR_SCHEMA], status: String(status), scimType, detail }, status);
}
