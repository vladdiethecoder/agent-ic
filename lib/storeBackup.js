import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { storeRoot } from './tenantStore.js';

const BACKUP_VERSION = 1;

export function createStoreBackup({ outFile, root = storeRoot() }) {
  if (!outFile) throw new Error('outFile is required');
  const files = listFiles(root).map((path) => {
    const raw = readFileSync(path);
    return {
      path: normalizePath(relative(root, path)),
      bytes: raw.length,
      sha256: sha256(raw),
      contentBase64: raw.toString('base64'),
    };
  });
  const manifest = {
    backupVersion: BACKUP_VERSION,
    product: 'Agent IC',
    createdAt: new Date().toISOString(),
    sourceRoot: root.replace(process.cwd(), '.'),
    fileCount: files.length,
    files,
  };
  manifest.sha256 = backupHash(manifest);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return summarizeBackup(manifest, outFile);
}

export function verifyStoreBackup({ backupFile }) {
  const manifest = readBackup(backupFile);
  const expected = backupHash(manifest);
  const failures = [];
  if (manifest.sha256 !== expected) failures.push({ code: 'manifest_hash_mismatch' });
  for (const file of manifest.files || []) {
    const raw = Buffer.from(file.contentBase64 || '', 'base64');
    if (sha256(raw) !== file.sha256) failures.push({ code: 'file_hash_mismatch', path: file.path });
    if (file.path.includes('..') || file.path.startsWith('/')) failures.push({ code: 'unsafe_path', path: file.path });
  }
  return { ok: failures.length === 0, failures, summary: summarizeBackup(manifest, backupFile) };
}

export function restoreStoreBackup({ backupFile, targetRoot, overwrite = false }) {
  if (!targetRoot) throw new Error('targetRoot is required');
  const verification = verifyStoreBackup({ backupFile });
  if (!verification.ok) return { ok: false, failures: verification.failures };
  if (existsSync(targetRoot)) {
    if (!overwrite) return { ok: false, failures: [{ code: 'target_exists', path: targetRoot }] };
    rmSync(targetRoot, { recursive: true, force: true });
  }
  const manifest = readBackup(backupFile);
  for (const file of manifest.files || []) {
    const dest = join(targetRoot, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(file.contentBase64, 'base64'));
  }
  return { ok: true, restoredFiles: manifest.files.length, targetRoot };
}

function readBackup(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  const out = [];
  walk(root, out);
  return out.sort();
}

function walk(path, out) {
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const entry of readdirSync(path)) walk(join(path, entry), out);
    return;
  }
  if (st.isFile()) out.push(path);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function backupHash(manifest) {
  const { sha256: _ignore, ...withoutHash } = manifest;
  return sha256(JSON.stringify(withoutHash));
}

function summarizeBackup(manifest, outFile) {
  return { ok: true, backupFile: outFile, backupVersion: manifest.backupVersion, fileCount: manifest.fileCount, sha256: manifest.sha256 };
}

function normalizePath(path) {
  return path.split('\\').join('/');
}
