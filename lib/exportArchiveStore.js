import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hashBundle, verifyExportBundleSignature } from './exportBundle.js';
import { readTenantCollection, sanitizeTenantId, storeRoot, writeTenantCollection } from './tenantStore.js';

const COLLECTION = 'export-archive-index';
const EMPTY_STATE = { archives: [] };

export function archiveExportBundle({ tenantId, bundle, archivedBy = 'system' }) {
  if (!tenantId) throw new Error('tenantId is required');
  if (!bundle?.sha256) throw new Error('signed export bundle with sha256 is required');
  const computed = hashBundle(bundle);
  if (computed !== bundle.sha256) return { ok: false, code: 'export_hash_mismatch', message: 'Export bundle hash does not match content' };
  const signature = verifyExportBundleSignature(bundle);
  if (!signature.ok) return { ok: false, code: signature.code, message: 'Export bundle signature verification failed' };
  const path = archiveFile(tenantId, bundle.sha256);
  const content = `${JSON.stringify(bundle, null, 2)}\n`;
  let replay = false;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    replay = true;
    const existing = readFileSync(path, 'utf8');
    if (existing !== content) return { ok: false, code: 'immutable_archive_conflict', message: 'Existing export archive content differs' };
  }
  const state = readState(tenantId);
  const existingRecord = state.archives.find((record) => record.sha256 === bundle.sha256);
  const record = existingRecord || {
    recordType: 'agent-ic-export-archive-v1',
    tenantId,
    sha256: bundle.sha256,
    signature: bundle.signature || null,
    signatureAlg: bundle.signatureAlg || null,
    signatureKeyId: bundle.signatureKeyId || null,
    path: safeDisplayPath(path),
    archivedAt: new Date().toISOString(),
    archivedBy,
    bundleType: bundle.bundleType,
    summary: bundle.summary,
  };
  if (!existingRecord) {
    state.archives.push(record);
    writeState(tenantId, state);
  }
  return { ok: true, replay, record };
}

export function listExportArchives({ tenantId, limit = 50 } = {}) {
  if (!tenantId) return [];
  return readState(tenantId).archives
    .slice()
    .sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)))
    .slice(0, Math.max(0, Number(limit) || 50));
}

export function getArchivedExport({ tenantId, sha256, includeBundle = false }) {
  if (!tenantId || !sha256) return null;
  const record = readState(tenantId).archives.find((item) => item.sha256 === sha256);
  if (!record) return null;
  if (!includeBundle) return { record };
  const path = archiveFile(tenantId, sha256);
  if (!existsSync(path)) return { record, verification: { ok: false, code: 'archive_file_missing' } };
  const bundle = JSON.parse(readFileSync(path, 'utf8'));
  return { record, bundle, verification: verifyArchivedBundle(bundle) };
}

export function verifyArchivedBundle(bundle) {
  const hashOk = hashBundle(bundle) === bundle.sha256;
  const signature = verifyExportBundleSignature(bundle);
  return { ok: hashOk && signature.ok, hashOk, signature };
}

function readState(tenantId) {
  const state = readTenantCollection(tenantId, COLLECTION, EMPTY_STATE);
  return { archives: Array.isArray(state.archives) ? state.archives : [] };
}

function writeState(tenantId, state) {
  return writeTenantCollection(tenantId, COLLECTION, { archives: state.archives || [] });
}

function archiveFile(tenantId, sha256) {
  return join(storeRoot(), 'export-archives', sanitizeTenantId(tenantId), `${String(sha256).replace(/[^a-f0-9]/g, '')}.json`);
}

function safeDisplayPath(path) {
  return path.replace(process.cwd(), '.');
}
