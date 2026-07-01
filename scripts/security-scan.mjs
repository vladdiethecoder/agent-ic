#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_ROOTS = ['app', 'components', 'lib', 'scripts', 'tests', 'PRODUCTION_THREAT_MODEL.md', 'README.md', 'Dockerfile', 'package.json'];
const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.next', 'demo-out', '.agent-ic', '.venv', '.playwright-mcp', 'coverage']);
const TEXT_EXT = /\.(js|jsx|mjs|ts|tsx|json|md|css|html|yml|yaml|dockerfile)$/i;

const findings = [];

const secretPatterns = [
  { name: 'stripe secret key', re: /sk_(live|test)_[A-Za-z0-9]{16,}/g },
  { name: 'stripe webhook secret', re: /whsec_[A-Za-z0-9]{16,}/g },
  { name: 'nvidia api key', re: /nvapi-[A-Za-z0-9_-]{16,}/g },
  { name: 'slack webhook url', re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/g },
  { name: 'generic bearer token', re: /Bearer\s+[A-Za-z0-9._-]{32,}/g },
];
const dangerousPatterns = [
  { name: 'dangerouslySetInnerHTML', re: /dangerouslySetInnerHTML/g },
  { name: 'eval(', re: /\beval\s*\(/g },
  { name: 'Function constructor', re: /new\s+Function\s*\(/g },
  { name: 'shell exec string', re: /exec\s*\(\s*[`'"]/g },
];

for (const root of SCAN_ROOTS) {
  const path = join(ROOT, root);
  if (!existsSync(path)) continue;
  scanPath(path);
}

checkDockerfile();
checkPackageScripts();

if (findings.length > 0) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, scannedRoots: SCAN_ROOTS, checks: ['secrets', 'dangerous-patterns', 'dockerfile', 'package-scripts'] }, null, 2));

function scanPath(path) {
  const st = statSync(path);
  if (st.isDirectory()) {
    if (EXCLUDED_DIRS.has(path.split('/').at(-1))) return;
    for (const entry of readdirSync(path)) scanPath(join(path, entry));
    return;
  }
  const rel = relative(ROOT, path);
  if (!isTextFile(path, rel)) return;
  const text = readFileSync(path, 'utf8');
  for (const pattern of secretPatterns) recordMatches(rel, text, pattern, allowSecretFinding);
  for (const pattern of dangerousPatterns) recordMatches(rel, text, pattern, allowDangerousFinding);
}

function recordMatches(file, text, pattern, allowFn) {
  for (const match of text.matchAll(pattern.re)) {
    const line = 1 + text.slice(0, match.index).split('\n').length - 1;
    const excerpt = match[0].slice(0, 80);
    if (allowFn(file, pattern.name, excerpt)) continue;
    findings.push({ file, line, type: pattern.name, excerpt });
  }
}

function allowSecretFinding(file, _name, excerpt) {
  if (file === '.env.example') return true;
  if (file.includes('security-scan.mjs')) return true;
  if (file.includes('stripe-webhook.test.mjs') && /whsec_|sk_test_/.test(excerpt)) return true;
  if (file.includes('production-readiness.test.mjs') && /whsec_|sk_test_|nvapi-/.test(excerpt)) return true;
  return false;
}

function allowDangerousFinding(file, name) {
  if (file.includes('security-scan.mjs')) return true;
  if (name === 'shell exec string' && file === 'scripts/record-live-media.mjs') return true; // media recorder only; QA forbids visible local commands.
  return false;
}

function isTextFile(path, rel) {
  if (rel === 'Dockerfile' || rel === 'package.json') return true;
  return TEXT_EXT.test(path);
}

function checkDockerfile() {
  if (!existsSync('Dockerfile')) return findings.push({ file: 'Dockerfile', line: 0, type: 'missing', excerpt: 'Dockerfile missing' });
  const text = readFileSync('Dockerfile', 'utf8');
  if (!/USER\s+agentic/i.test(text)) findings.push({ file: 'Dockerfile', line: 0, type: 'dockerfile', excerpt: 'runtime must use USER agentic' });
  if (/COPY\s+--from=builder\s+\/app\/(\.env|demo-out|\.agent-ic)/.test(text)) findings.push({ file: 'Dockerfile', line: 0, type: 'dockerfile', excerpt: 'Dockerfile copies local generated artifacts' });
  if (!/HEALTHCHECK/.test(text)) findings.push({ file: 'Dockerfile', line: 0, type: 'dockerfile', excerpt: 'Dockerfile healthcheck missing' });
}

function checkPackageScripts() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const script of ['lint', 'test', 'build', 'prod:check', 'security:scan', 'security:audit', 'store:backup', 'migrate:apply', 'migrate:check', 'openapi:check', 'container:check', 'release:check']) {
    if (!pkg.scripts?.[script]) findings.push({ file: 'package.json', line: 0, type: 'package-script', excerpt: `${script} missing` });
  }
}
