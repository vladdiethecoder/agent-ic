#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = process.env.AGENT_IC_RELEASE_MANIFEST || '.agent-ic/release-manifest.json';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const files = [
  'package.json',
  'package-lock.json',
  'security/dependency-audit-policy.json',
  'docs/runbooks/audit-restore.md',
  'docs/runbooks/telemetry-export.md',
  'docs/runbooks/slo-review.md',
  'docs/runbooks/incident-review.md',
  'docs/runbooks/container-release.md',
  'docs/runbooks/api-contract.md',
  'docs/runbooks/api-pagination.md',
  'docs/runbooks/api-versioning.md',
  'docs/runbooks/security-headers.md',
  'docs/runbooks/rate-limiting.md',
  'docs/runbooks/signed-export.md',
  'scripts/migrate-store.mjs',
  'scripts/container-release-check.mjs',
  'scripts/openapi-check.mjs',
  'lib/migrationRunner.js',
  'lib/openapiSpec.js',
  'Dockerfile',
  '.dockerignore',
  '.github/workflows/production-readiness.yml',
  'PRODUCTION_READINESS.md',
  'PRODUCTION_GAP_AUDIT.md',
  'PRODUCTION_THREAT_MODEL.md',
];

const manifest = {
  product: 'Agent IC',
  version: pkg.version,
  generatedAt: new Date().toISOString(),
  git: gitInfo(),
  scripts: {
    releaseCheck: pkg.scripts['release:check'],
    securityScan: pkg.scripts['security:scan'],
    dependencyAudit: pkg.scripts['security:audit'],
    storeBackup: pkg.scripts['store:backup'],
    migrateApply: pkg.scripts['migrate:apply'],
    migrateCheck: pkg.scripts['migrate:check'],
    containerCheck: pkg.scripts['container:check'],
    openapiCheck: pkg.scripts['openapi:check'],
    productionCheck: pkg.scripts['prod:check'],
    publicExport: pkg.scripts['public:export'],
  },
  gates: {
    lint: 'npm run lint',
    test: 'npm test',
    build: 'npm run build',
    migrateApply: 'npm run migrate:apply',
    migrateCheck: 'npm run migrate:check',
    containerCheck: 'npm run container:check',
    openapiCheck: 'npm run openapi:check',
    prodCheck: 'npm run prod:check',
    securityScan: 'npm run security:scan',
    dependencyAudit: 'npm run security:audit',
    releaseCheck: 'npm run release:check',
    publicExport: 'npm run public:export',
  },
  artifacts: Object.fromEntries(files.filter(existsSync).map((file) => [file, fileInfo(file)])),
  productionReadiness: {
    status: 'foundation-in-progress',
    fullProductionReady: false,
    reason: 'Release gates and deployment hygiene exist, but full production readiness still requires enterprise SSO, production DB/WORM storage, deployment manifests, rollback automation, observability backends, and compliance evidence.',
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, manifest: OUT, files: Object.keys(manifest.artifacts).length }, null, 2));

function fileInfo(file) {
  const raw = readFileSync(file);
  return { bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex') };
}

function gitInfo() {
  try {
    return {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim().length > 0,
    };
  } catch {
    return { commit: null, dirty: null };
  }
}
