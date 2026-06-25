import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const STORE_VERSION = 1;
const INITIAL_MIGRATION = '001_initial_tenant_store';

export function storeRoot() {
  return process.env.AGENT_IC_STORE_ROOT || join(process.cwd(), '.agent-ic', 'store');
}

export function ensureStore() {
  const root = storeRoot();
  mkdirSync(root, { recursive: true });
  const manifestPath = join(root, 'manifest.json');
  let manifest = null;
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      manifest = null;
    }
  }
  if (!manifest || typeof manifest !== 'object') {
    manifest = {
      schemaVersion: STORE_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      migrations: [],
    };
  }
  if (!Array.isArray(manifest.migrations)) manifest.migrations = [];
  if (!manifest.migrations.some((migration) => migration.id === INITIAL_MIGRATION)) {
    manifest.migrations.push({ id: INITIAL_MIGRATION, appliedAt: new Date().toISOString() });
  }
  manifest.schemaVersion = STORE_VERSION;
  manifest.updatedAt = new Date().toISOString();
  atomicWriteJson(manifestPath, manifest);
  mkdirSync(join(root, 'tenants'), { recursive: true });
  return manifest;
}

export function readManifest() {
  ensureStore();
  return JSON.parse(readFileSync(join(storeRoot(), 'manifest.json'), 'utf8'));
}

export function writeManifest(manifest) {
  const root = storeRoot();
  mkdirSync(root, { recursive: true });
  atomicWriteJson(join(root, 'manifest.json'), manifest);
  return manifest;
}

export function tenantDirectory(tenantId) {
  return join(storeRoot(), 'tenants', sanitizeTenantId(tenantId));
}


export function readRootCollection(collection, fallback = {}) {
  const file = rootCollectionFile(collection);
  if (!existsSync(file)) return clone(fallback);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return clone(fallback);
  }
}

export function writeRootCollection(collection, value) {
  const file = rootCollectionFile(collection);
  atomicWriteJson(file, value);
  return value;
}

export function readTenantCollection(tenantId, collection, fallback = {}) {
  const file = collectionFile(tenantId, collection);
  if (!existsSync(file)) return clone(fallback);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return clone(fallback);
  }
}

export function writeTenantCollection(tenantId, collection, value) {
  const file = collectionFile(tenantId, collection);
  atomicWriteJson(file, value);
  return value;
}

export function listTenantIds() {
  ensureStore();
  const tenantsRoot = join(storeRoot(), 'tenants');
  if (!existsSync(tenantsRoot)) return [];
  return readdirSync(tenantsRoot).filter((name) => statSync(join(tenantsRoot, name)).isDirectory());
}

export function clearTenantStore({ tenantId } = {}) {
  if (tenantId) {
    rmSync(tenantDirectory(tenantId), { recursive: true, force: true });
    return;
  }
  rmSync(storeRoot(), { recursive: true, force: true });
}

export function storeHealth() {
  const manifest = readManifest();
  return {
    ok: manifest.schemaVersion === STORE_VERSION,
    root: storeRoot().replace(process.cwd(), '.'),
    schemaVersion: manifest.schemaVersion,
    migrations: manifest.migrations.map((migration) => migration.id),
    tenantCount: listTenantIds().length,
  };
}

export function sanitizeTenantId(value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('tenantId is required');
  return text.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/\.\.+/g, '_').replace(/^\.+|\.+$/g, '_').slice(0, 120);
}


function rootCollectionFile(collection) {
  ensureStore();
  const safeCollection = String(collection || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
  if (!safeCollection) throw new Error('collection is required');
  return join(storeRoot(), `${safeCollection}.json`);
}

function collectionFile(tenantId, collection) {
  ensureStore();
  const dir = tenantDirectory(tenantId);
  mkdirSync(dir, { recursive: true });
  const safeCollection = String(collection || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
  if (!safeCollection) throw new Error('collection is required');
  return join(dir, `${safeCollection}.json`);
}

function atomicWriteJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

