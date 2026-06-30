import { readRootCollection, writeRootCollection } from './tenantStore.js';

const COLLECTION = 'tenant-registry';
const EMPTY_STATE = { tenants: [] };

export function upsertTenant({ tenantId, name, status = 'active', updatedBy = 'system' }) {
  if (!tenantId) throw new Error('tenantId is required');
  const state = readState();
  const existing = state.tenants.find((tenant) => tenant.tenantId === tenantId);
  const now = new Date().toISOString();
  const tenant = existing || { tenantId, createdAt: now, createdBy: updatedBy };
  tenant.name = String(name || tenant.name || tenantId).slice(0, 200);
  tenant.status = status === 'inactive' ? 'inactive' : 'active';
  tenant.updatedAt = now;
  tenant.updatedBy = updatedBy;
  if (!existing) state.tenants.push(tenant);
  writeState(state);
  return tenant;
}

export function listTenants({ status } = {}) {
  return readState().tenants
    .filter((tenant) => !status || tenant.status === status)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getTenant({ tenantId }) {
  if (!tenantId) return null;
  return readState().tenants.find((tenant) => tenant.tenantId === tenantId) || null;
}

export function deactivateTenant({ tenantId, updatedBy = 'system' }) {
  const existing = getTenant({ tenantId });
  if (!existing) return { ok: false, code: 'tenant_not_found', message: `Tenant not found: ${tenantId}` };
  return { ok: true, tenant: upsertTenant({ tenantId, name: existing.name, status: 'inactive', updatedBy }) };
}

export function ensureDefaultTenant() {
  if (!getTenant({ tenantId: 'local-tenant' })) {
    upsertTenant({ tenantId: 'local-tenant', name: 'Local Tenant', updatedBy: 'system' });
  }
}

function readState() {
  const state = readRootCollection(COLLECTION, EMPTY_STATE);
  return { tenants: Array.isArray(state.tenants) ? state.tenants : [] };
}

function writeState(state) {
  return writeRootCollection(COLLECTION, { tenants: state.tenants || [] });
}
