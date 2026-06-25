import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readTenantCollection, tenantDirectory, writeTenantCollection } from './tenantStore.js';

const COLLECTION = 'evidence-artifacts';
const EMPTY_STATE = { artifacts: [] };

export function recordEvidenceArtifact({ tenantId, runId, kind, content, contentType = 'application/json', createdBy = 'system' }) {
  if (!tenantId) throw new Error('tenantId is required');
  if (!runId) throw new Error('runId is required');
  if (!kind) throw new Error('kind is required');
  const bytes = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const artifactId = `evid_${kind}_${sha256.slice(0, 16)}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const relPath = join('evidence-blobs', runId, `${artifactId}.json`);
  const absPath = join(tenantDirectory(tenantId), relPath);
  atomicWrite(absPath, bytes);

  const state = readState(tenantId);
  const metadata = {
    artifactId,
    tenantId,
    runId,
    kind,
    contentType,
    sha256,
    bytes: bytes.length,
    path: relPath,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  const index = state.artifacts.findIndex((item) => item.artifactId === artifactId && item.runId === runId);
  if (index >= 0) state.artifacts[index] = metadata;
  else state.artifacts.push(metadata);
  writeState(tenantId, state);
  return metadata;
}

export function listEvidenceArtifacts({ tenantId, runId, kind } = {}) {
  if (!tenantId) return [];
  let artifacts = readState(tenantId).artifacts;
  if (runId) artifacts = artifacts.filter((item) => item.runId === runId);
  if (kind) artifacts = artifacts.filter((item) => item.kind === kind);
  return artifacts.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getEvidenceArtifact({ tenantId, artifactId, includeContent = false }) {
  if (!tenantId || !artifactId) return null;
  const metadata = readState(tenantId).artifacts.find((item) => item.artifactId === artifactId);
  if (!metadata) return null;
  if (!includeContent) return metadata;
  const absPath = join(tenantDirectory(tenantId), metadata.path);
  if (!existsSync(absPath)) return { ...metadata, missing: true, content: null };
  const raw = readFileSync(absPath);
  const sha256 = createHash('sha256').update(raw).digest('hex');
  return {
    ...metadata,
    verified: sha256 === metadata.sha256,
    content: metadata.contentType === 'application/json' ? JSON.parse(raw.toString('utf8')) : raw.toString('utf8'),
  };
}

function readState(tenantId) {
  const state = readTenantCollection(tenantId, COLLECTION, EMPTY_STATE);
  return { artifacts: Array.isArray(state.artifacts) ? state.artifacts : [] };
}

function writeState(tenantId, state) {
  return writeTenantCollection(tenantId, COLLECTION, { artifacts: state.artifacts || [] });
}

function atomicWrite(file, bytes) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, file);
}
