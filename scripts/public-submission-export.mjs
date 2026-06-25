#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

const EXPORT_ROOT = process.env.AGENT_IC_PUBLIC_EXPORT_DIR || '.agent-ic/public-submission-export';
const EXPORT_APP = join(EXPORT_ROOT, 'agent-ic');
const MANIFEST = process.env.AGENT_IC_PUBLIC_EXPORT_MANIFEST || '.agent-ic/public-submission-export-manifest.json';
const TARBALL = process.env.AGENT_IC_PUBLIC_EXPORT_TARBALL || '.agent-ic/agent-ic-public-submission.tar.gz';

const TOP_LEVEL_FILES = [
  '.dockerignore',
  '.env.example',
  'Dockerfile',
  'FINAL_SUBMISSION_PACKET.md',
  'JUDGE_QUICKSTART.md',
  'PRD.md',
  'PRODUCT_CONTRACT.md',
  'PRODUCTION_GAP_AUDIT.md',
  'PRODUCTION_READINESS.md',
  'PRODUCTION_THREAT_MODEL.md',
  'PROOF.md',
  'PUBLIC_REPO_RELEASE.md',
  'README.md',
  'STORYBOARD.md',
  'SUBMISSION.md',
  'SUBMISSION_MANIFEST.json',
  'VALIDATION.md',
  'eslint.config.mjs',
  'middleware.js',
  'next.config.mjs',
  'package-lock.json',
  'package.json',
];

const DIRECTORIES = [
  'app',
  'components',
  'data',
  'deploy',
  'docs',
  'lib',
  'prds',
  'public',
  'scripts',
  'security',
  'skills',
  'tests',
];

const DENY_NAMES = new Set([
  '.agent-ic',
  '.cache',
  '.codex',
  '.env',
  '.env.local',
  '.git',
  '.hermes',
  '.next',
  '.playwright-mcp',
  '.review',
  '.venv',
  'coverage',
  'demo-out',
  'models',
  'node_modules',
]);

const DENY_EXTENSIONS = new Set([
  '.bin',
  '.jpg',
  '.jpeg',
  '.onnx',
  '.png',
  '.traineddata',
  '.wav',
  '.webm',
  '.mp4',
]);

const ALLOW_BINARY = new Set([
  'public/favicon.svg',
]);

const SECRET_PATTERNS = [
  { name: 'stripe secret key', re: /sk_(live|test)_[A-Za-z0-9]{16,}/g },
  { name: 'stripe webhook secret', re: /whsec_[A-Za-z0-9]{16,}/g },
  { name: 'nvidia api key', re: /nvapi-[A-Za-z0-9_-]{16,}/g },
  { name: 'slack webhook url', re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/g },
  { name: 'bearer token', re: /Bearer\s+[A-Za-z0-9._-]{32,}/g },
  { name: 'private local path', re: /\/run\/media\/vdubrov|\/home\/vdubrov/g },
];

const copied = [];
const skipped = [];
const findings = [];

rmSync(EXPORT_ROOT, { recursive: true, force: true });
mkdirSync(EXPORT_APP, { recursive: true });

for (const file of TOP_LEVEL_FILES) copyFileIfAllowed(file);
for (const dir of DIRECTORIES) copyDirectoryIfAllowed(dir);

scanExport();
writePublicGitignore();
writeManifest();
createTarball();

if (findings.length > 0) {
  console.error(JSON.stringify({ ok: false, findings, exportDir: EXPORT_APP }, null, 2));
  process.exit(1);
}

const tarballInfo = fileInfo(TARBALL);
console.log(JSON.stringify({
  ok: true,
  exportDir: EXPORT_APP,
  manifest: MANIFEST,
  tarball: TARBALL,
  tarballSha256: tarballInfo.sha256,
  files: copied.length,
  skipped: skipped.length,
}, null, 2));

function copyFileIfAllowed(file) {
  if (!existsSync(file)) return;
  if (!isAllowedPath(file)) {
    skipped.push({ path: file, reason: 'not allowed' });
    return;
  }
  const target = join(EXPORT_APP, file);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(file, target);
  copied.push(file);
}

function copyDirectoryIfAllowed(dir) {
  if (!existsSync(dir)) return;
  walk(dir, (file) => copyFileIfAllowed(file));
}

function walk(root, visitor) {
  const st = statSync(root);
  if (st.isDirectory()) {
    if (DENY_NAMES.has(basename(root))) return;
    for (const entry of readdirSync(root)) walk(join(root, entry), visitor);
    return;
  }
  if (st.isFile()) visitor(root);
}

function isAllowedPath(file) {
  const parts = file.split(/[\\/]/);
  if (parts.some((part) => DENY_NAMES.has(part))) return false;
  if (file.startsWith('docs/') && !(file.startsWith('docs/runbooks/') || file === 'docs/COMPLIANCE.md')) return false;
  if (basename(file).startsWith('.env') && file !== '.env.example') return false;
  if (ALLOW_BINARY.has(file)) return true;
  const ext = file.includes('.') ? file.slice(file.lastIndexOf('.')).toLowerCase() : '';
  if (DENY_EXTENSIONS.has(ext)) return false;
  return true;
}

function scanExport() {
  walk(EXPORT_APP, (file) => {
    const rel = relative(EXPORT_APP, file);
    if (!isTextFile(file)) return;
    const text = readFileSync(file, 'utf8');
    for (const pattern of SECRET_PATTERNS) {
      for (const match of text.matchAll(pattern.re)) {
        if (allowSecretFinding(rel, pattern.name, match[0])) continue;
        findings.push({ file: rel, type: pattern.name, excerpt: match[0].slice(0, 80) });
      }
    }
    if (/winning-v2|f3c6ce8a|2931\/2931/.test(text) && rel !== 'scripts/public-submission-export.mjs' && rel !== 'scripts/submission-preflight.mjs') {
      findings.push({ file: rel, type: 'stale submission artifact', excerpt: 'v2/stale artifact reference' });
    }
  });

  for (const forbidden of ['.env.local', 'demo-out', '.agent-ic', '.git', 'node_modules']) {
    if (existsSync(join(EXPORT_APP, forbidden))) findings.push({ file: forbidden, type: 'forbidden export path', excerpt: forbidden });
  }
}

function writePublicGitignore() {
  const text = [
    'node_modules/',
    '.next/',
    '.agent-ic/',
    '.env',
    '.env.*',
    '!.env.example',
    'demo-out/',
    'coverage/',
    '*.log',
    '',
  ].join('\n');
  writeFileSync(join(EXPORT_APP, '.gitignore'), text);
  copied.push('.gitignore');
}

function writeManifest() {
  const files = copied
    .filter((file, index, arr) => arr.indexOf(file) === index)
    .filter((file) => existsSync(join(EXPORT_APP, file)))
    .sort();
  const manifest = {
    product: 'Agent IC',
    generatedAt: new Date().toISOString(),
    exportDir: EXPORT_APP,
    tarball: TARBALL,
    files: Object.fromEntries(files.map((file) => [file, fileInfo(join(EXPORT_APP, file))])),
    skipped,
    policy: {
      excludes: ['.env.local', '.agent-ic', 'demo-out', '.git', '.next', 'node_modules', 'local media artifacts'],
      requiredBeforePush: ['npm run submission:preflight', 'npm run public:export'],
    },
  };
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

function createTarball() {
  rmSync(TARBALL, { force: true });
  mkdirSync(dirname(TARBALL), { recursive: true });
  execFileSync('tar', ['-czf', TARBALL, '-C', EXPORT_ROOT, 'agent-ic'], { stdio: 'pipe' });
}

function fileInfo(file) {
  const raw = readFileSync(file);
  return { bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex') };
}

function isTextFile(file) {
  return /\.(css|dockerfile|html|js|jsx|json|md|mjs|svg|txt|yml|yaml)$/i.test(file) || basename(file) === 'Dockerfile';
}

function allowSecretFinding(file, _name, excerpt) {
  if (file === '.env.example' && /\\.\\.\\.|example|replace|your_/i.test(excerpt)) return true;
  if (file.includes('security-scan.mjs')) return true;
  if (file.includes('submission-preflight.mjs')) return true;
  if (file.includes('production-readiness.test.mjs')) return true;
  if (file.includes('stripe-webhook.test.mjs')) return true;
  return false;
}
