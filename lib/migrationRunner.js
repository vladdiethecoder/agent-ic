import { createHash } from 'node:crypto';
import { ensureStore, readManifest, writeManifest, writeRootCollection } from './tenantStore.js';

const DOMAIN_SCHEMAS = Object.freeze([
  { domain: 'tenants', scope: 'root', collection: 'tenant-registry', version: 1, owner: 'identity' },
  { domain: 'browserSessions', scope: 'root', collection: 'browser-sessions', version: 1, owner: 'identity' },
  { domain: 'memberships', scope: 'tenant', collection: 'memberships', version: 1, owner: 'identity' },
  { domain: 'approvals', scope: 'tenant', collection: 'approvals', version: 1, owner: 'procurement' },
  { domain: 'policies', scope: 'tenant', collection: 'policies', version: 1, owner: 'security' },
  { domain: 'trials', scope: 'tenant', collection: 'trials', version: 1, owner: 'procurement' },
  { domain: 'evidence', scope: 'tenant', collection: 'evidence-artifacts', version: 1, owner: 'compliance' },
  { domain: 'payments', scope: 'tenant', collection: 'payment-events', version: 1, owner: 'finance' },
  { domain: 'retention', scope: 'tenant', collection: 'retention-policy', version: 1, owner: 'compliance' },
  { domain: 'exports', scope: 'tenant', collection: 'export-bundles', version: 1, owner: 'compliance' },
  { domain: 'idempotency', scope: 'tenant', collection: 'idempotency', version: 1, owner: 'platform' },
  { domain: 'audit', scope: 'tenant-jsonl', collection: 'audit-log', version: 1, owner: 'compliance' },
]);

const MIGRATIONS = Object.freeze([
  {
    id: '001_initial_tenant_store',
    description: 'Initialize versioned tenant-store manifest and tenant directory root.',
    apply() { ensureStore(); },
  },
  {
    id: '002_domain_schema_registry',
    description: 'Record current Agent IC domain collection schema registry.',
    apply() {
      writeRootCollection('schema-registry', { generatedAt: new Date().toISOString(), schemas: DOMAIN_SCHEMAS });
    },
  },
  {
    id: '003_release_migration_gate',
    description: 'Record migration gate metadata required by release checks.',
    apply() {
      writeRootCollection('migration-gate', {
        requiredForRelease: true,
        command: 'npm run migrate:check',
        updatedAt: new Date().toISOString(),
      });
    },
  },
]);

export function knownMigrations() {
  return MIGRATIONS.map(publicMigration);
}

export function migrationStatus() {
  ensureStore();
  const manifest = normalizeManifest(readManifest());
  const applied = new Map(manifest.migrations.map((migration) => [migration.id, migration]));
  const migrations = MIGRATIONS.map((migration) => {
    const checksum = migrationChecksum(migration);
    const record = applied.get(migration.id);
    const appliedOk = Boolean(record?.checksum && record.checksum === checksum);
    const checksumMismatch = Boolean(record?.checksum && record.checksum !== checksum);
    const legacyRecord = Boolean(record && !record.checksum);
    return {
      ...publicMigration(migration),
      checksum,
      applied: appliedOk,
      pending: !appliedOk,
      legacyRecord,
      checksumMismatch,
      appliedAt: record?.appliedAt || null,
    };
  });
  return {
    ok: migrations.every((migration) => migration.applied && !migration.checksumMismatch),
    schemaVersion: manifest.schemaVersion,
    migrations,
    pending: migrations.filter((migration) => migration.pending),
    checksumMismatches: migrations.filter((migration) => migration.checksumMismatch),
  };
}

export function applyMigrations({ dryRun = false } = {}) {
  ensureStore();
  const before = migrationStatus();
  if (before.checksumMismatches.length > 0) {
    return { ok: false, code: 'migration_checksum_mismatch', status: before, applied: [] };
  }
  const applied = [];
  if (!dryRun) {
    for (const migration of MIGRATIONS) {
      const current = migrationStatus();
      const state = current.migrations.find((item) => item.id === migration.id);
      if (state?.applied) continue;
      migration.apply();
      recordAppliedMigration(migration);
      applied.push({ id: migration.id, checksum: migrationChecksum(migration) });
    }
  }
  const after = dryRun ? before : migrationStatus();
  return { ok: after.ok, applied, status: after };
}

export function assertMigrationsCurrent() {
  const status = migrationStatus();
  if (status.checksumMismatches.length > 0) {
    return { ok: false, code: 'migration_checksum_mismatch', status };
  }
  if (status.pending.length > 0) {
    return { ok: false, code: 'migration_pending', status };
  }
  return { ok: true, status };
}

function recordAppliedMigration(migration) {
  const manifest = normalizeManifest(readManifest());
  const checksum = migrationChecksum(migration);
  const now = new Date().toISOString();
  const existing = manifest.migrations.find((item) => item.id === migration.id);
  if (existing) {
    existing.checksum = checksum;
    existing.description = migration.description;
    existing.appliedAt = existing.appliedAt || now;
    existing.verifiedAt = now;
  } else {
    manifest.migrations.push({ id: migration.id, description: migration.description, checksum, appliedAt: now, verifiedAt: now });
  }
  manifest.updatedAt = now;
  manifest.schemaVersion = Math.max(Number(manifest.schemaVersion || 1), 1);
  writeManifest(manifest);
}

function normalizeManifest(manifest) {
  return {
    schemaVersion: Number(manifest?.schemaVersion || 1),
    createdAt: manifest?.createdAt || new Date().toISOString(),
    updatedAt: manifest?.updatedAt || new Date().toISOString(),
    migrations: Array.isArray(manifest?.migrations) ? manifest.migrations : [],
  };
}

function migrationChecksum(migration) {
  return createHash('sha256')
    .update(JSON.stringify({ id: migration.id, description: migration.description, domainSchemas: migration.id === '002_domain_schema_registry' ? DOMAIN_SCHEMAS : [] }))
    .digest('hex');
}

function publicMigration(migration) {
  return { id: migration.id, description: migration.description };
}
