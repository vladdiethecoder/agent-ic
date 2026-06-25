#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const PUBLIC_REPO_URL = 'https://github.com/vladdiethecoder/agent-ic';
const VIDEO = 'demo-out/agent-ic-demo-final-winning-v3.mp4';
const VIDEO_SHA256 = '5da9da4f9b200fe4f304698d8325d225f5965119d5e98c9682c3c82e0fa14726';
const COVER_IMAGE = 'demo-out/agent-ic-x-cover-proof.jpg';
const COVER_SHA256 = 'd54a90f93ae9e11330cb0087df4633e70dbf284e32f6ed1e03c5b2fea0d48be1';
const REQUIRED_FILES = [
  'README.md',
  'JUDGE_QUICKSTART.md',
  'JUDGE_SCORECARD.md',
  'SUBMISSION.md',
  'SUBMISSION_MANIFEST.json',
  'FINAL_SUBMISSION_PACKET.md',
  'POSTING_PACKET.md',
  'VALIDATION.md',
  'package.json',
];
const PUBLIC_TOP_LEVEL_FILES = new Set([
  '.dockerignore',
  '.env.example',
  'Dockerfile',
  'FINAL_SUBMISSION_PACKET.md',
  'JUDGE_QUICKSTART.md',
  'JUDGE_SCORECARD.md',
  'POSTING_PACKET.md',
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
]);
const PUBLIC_DIRECTORIES = new Set([
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
]);
const DENY_NAMES = new Set([
  '.agent-ic',
  '.cache',
  '.codex',
  '.env',
  '.env.local',
  '.git',
  '.github',
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

const checks = [];

for (const file of REQUIRED_FILES) check(`${file} exists`, existsSync(file), file);

const pkg = readJson('package.json');
if (pkg) {
  check('judge check script exists', pkg.scripts?.['judge:check'] === 'npm test && npm run build && node scripts/judge-public-check.mjs', pkg.scripts?.['judge:check']);
  check('test script exists', Boolean(pkg.scripts?.test), pkg.scripts?.test);
  check('build script uses safe-next wrapper', pkg.scripts?.build === 'node scripts/safe-next.mjs build', pkg.scripts?.build);
  check('submission cover script exists', pkg.scripts?.['submission:cover'] === 'node scripts/prepare-submission-cover.mjs', pkg.scripts?.['submission:cover']);
}

const manifest = readJson('SUBMISSION_MANIFEST.json');
check('submission manifest parses', Boolean(manifest), 'SUBMISSION_MANIFEST.json');
if (manifest) {
  check('manifest names Agent IC', manifest.project?.name === 'Agent IC', manifest.project?.name);
  check('manifest names public repo', manifest.project?.publicRepo === PUBLIC_REPO_URL, manifest.project?.publicRepo);
  check('manifest names primary video', manifest.submissionVideo?.path === VIDEO, manifest.submissionVideo?.path);
  check('manifest names primary video hash', manifest.submissionVideo?.sha256 === VIDEO_SHA256, manifest.submissionVideo?.sha256);
  check('manifest names optional X cover', manifest.postingPacket?.xCoverImage === COVER_IMAGE, manifest.postingPacket?.xCoverImage);
  check('manifest names optional X cover hash', manifest.postingPacket?.xCoverImageSha256 === COVER_SHA256, manifest.postingPacket?.xCoverImageSha256);
  check('manifest explains public video delivery', /attach this mp4 to the x submission post/i.test(manifest.submissionVideo?.publicDelivery || ''), manifest.submissionVideo?.publicDelivery);
  check('manifest carries video QA hash', /^[a-f0-9]{64}$/.test(manifest.validation?.videoQa?.sha256 || ''), manifest.validation?.videoQa?.sha256);
  check('manifest carries frame QA hash', /^[a-f0-9]{64}$/.test(manifest.validation?.frameQa?.sha256 || ''), manifest.validation?.frameQa?.sha256);
  check('manifest keeps OCR diagnostic-only', /diagnostic only/i.test(manifest.validation?.videoQa?.ocrPolicy || ''), manifest.validation?.videoQa?.ocrPolicy);
  check('manifest maps all judging criteria', ['usefulness', 'viability', 'presentation'].every((key) => Boolean(manifest.judgeMap?.[key])), JSON.stringify(Object.keys(manifest.judgeMap || {})));
  check('manifest records public repo excludes generated video artifacts', (manifest.publicRepoPolicy?.excludes || []).some((item) => /generated videos/i.test(item)), JSON.stringify(manifest.publicRepoPolicy?.excludes || []));
}

const readme = readText('README.md');
const quickstart = readText('JUDGE_QUICKSTART.md');
const scorecard = readText('JUDGE_SCORECARD.md');
const submission = readText('SUBMISSION.md');
const packet = readText('FINAL_SUBMISSION_PACKET.md');
const posting = readText('POSTING_PACKET.md');

check('README names public repo', readme.includes(PUBLIC_REPO_URL), 'README.md');
check('README names primary video hash', readme.includes(VIDEO_SHA256), 'README.md');
check('quickstart explains media exclusion', /does not include generated videos/i.test(quickstart), 'JUDGE_QUICKSTART.md');
check('quickstart documents judge check', /npm run judge:check/.test(quickstart), 'JUDGE_QUICKSTART.md');
check('quickstart names posting packet', quickstart.includes('POSTING_PACKET.md'), 'JUDGE_QUICKSTART.md');
check('quickstart links judge scorecard', quickstart.includes('JUDGE_SCORECARD.md'), 'JUDGE_QUICKSTART.md');
check('scorecard names public repo', scorecard.includes(PUBLIC_REPO_URL), 'JUDGE_SCORECARD.md');
check('scorecard names primary video hash', scorecard.includes(VIDEO_SHA256), 'JUDGE_SCORECARD.md');
check('scorecard names optional X cover', scorecard.includes(COVER_IMAGE) && scorecard.includes(COVER_SHA256), 'JUDGE_SCORECARD.md');
check('scorecard maps all judging criteria', ['usefulness', 'viability', 'presentation'].every((key) => new RegExp(key, 'i').test(scorecard)), 'JUDGE_SCORECARD.md');
check('scorecard documents public clone check', /npm run judge:check/.test(scorecard), 'JUDGE_SCORECARD.md');
check('scorecard keeps Stripe wording in test mode', /Stripe test-mode/i.test(scorecard), 'JUDGE_SCORECARD.md');
check('scorecard keeps OCR diagnostic-only', /OCR is diagnostic only/i.test(scorecard), 'JUDGE_SCORECARD.md');
check('submission keeps external actions explicit', /Tweet demo video tagging @NousResearch/.test(submission) && /Complete Typeform/.test(submission), 'SUBMISSION.md');
check('submission names posting packet', submission.includes('POSTING_PACKET.md'), 'SUBMISSION.md');
check('final packet names QA hashes', /1007217f8a8c045d20974e157e62ecfa7659dcda976b704189f4c43d481eb61a/.test(packet) && /95a7a4e6257c7a05f17fbf19854095a426a604a674d7ba7548c4d2e2c54a862f/.test(packet), 'FINAL_SUBMISSION_PACKET.md');
check('final packet names posting packet', packet.includes('POSTING_PACKET.md'), 'FINAL_SUBMISSION_PACKET.md');
if (posting) {
  const xPost = extractFirstCodeBlockAfter(posting, '## X Post Copy');
  const altText = extractFirstCodeBlockAfter(posting, '## X Alt Text');
  const discord = extractFirstCodeBlockAfter(posting, '## Discord Submission Copy');
  check('posting packet names primary video', posting.includes(VIDEO), VIDEO);
  check('posting packet names primary video hash', posting.includes(VIDEO_SHA256), VIDEO_SHA256);
  check('posting packet names optional X cover', posting.includes(COVER_IMAGE) && posting.includes(COVER_SHA256), COVER_IMAGE);
  check('posting packet X copy is ready', xPost.length > 0 && xPost.length <= 260 && /@NousResearch/.test(xPost) && xPost.includes(PUBLIC_REPO_URL), `${xPost.length} chars`);
  check('posting packet alt text is ready', altText.length >= 120 && altText.length <= 1000 && /policy-gate 403/i.test(altText), `${altText.length} chars`);
  check('posting packet Discord copy is ready', discord.includes('X_POST_URL') && discord.includes(PUBLIC_REPO_URL) && /NemoHermes/i.test(discord), 'POSTING_PACKET.md');
  check('posting packet Typeform answers are ready', /## Typeform Answers/.test(posting) && /Why it is useful:/.test(posting) && /Why it is viable:/.test(posting) && /Integrations used:/.test(posting), 'POSTING_PACKET.md');
}

const trackedFiles = listTrackedFiles();
const publicTrackedFiles = trackedFiles.filter(isPublicExportPath);
const forbiddenTracked = publicTrackedFiles.filter((file) => /(^|\/)(\.env\.local|demo-out|\.agent-ic|node_modules|\.git|\.github\/workflows)(\/|$)/.test(file));
check('tracked files exclude local/generated artifacts', forbiddenTracked.length === 0, forbiddenTracked.join(', ') || 'clean');

const scanned = scanTrackedText(publicTrackedFiles);
check('tracked text avoids stale/private repo slugs', !staleRepoPattern().test(scanned), 'stale repo scan');
check('tracked text avoids raw provider secret shapes', !secretShapePattern().test(scanned), 'secret shape scan');
check('tracked text avoids private local paths', !privatePathPattern().test(scanned), 'local path scan');

const failures = checks.filter((item) => !item.ok);
const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  note: 'Public clone check intentionally does not require generated video artifacts; the MP4 is attached to the X submission post.',
  trackedFiles: trackedFiles.length,
  publicTrackedFiles: publicTrackedFiles.length,
  checks,
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exit(1);

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail: String(detail ?? '') });
}

function readText(file) {
  if (!existsSync(file)) return '';
  return readFileSync(file, 'utf8');
}

function readJson(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function listTrackedFiles() {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return REQUIRED_FILES.filter((file) => existsSync(file));
  }
}

function scanTrackedText(files) {
  return files
    .filter((file) => /\.(css|dockerfile|html|js|jsx|json|md|mjs|svg|txt|yml|yaml)$/i.test(file) || file === 'Dockerfile')
    .filter((file) => existsSync(file))
    .filter((file) => !/scripts\/(security-scan|public-submission-export|submission-preflight|judge-public-check)\.mjs$/.test(file))
    .map((file) => readText(file))
    .join('\n');
}

function isPublicExportPath(file) {
  const parts = file.split('/');
  if (parts.some((part) => DENY_NAMES.has(part))) return false;
  if (PUBLIC_TOP_LEVEL_FILES.has(file)) return true;
  if (!PUBLIC_DIRECTORIES.has(parts[0])) return false;
  if (file.startsWith('docs/') && !(file.startsWith('docs/runbooks/') || file === 'docs/COMPLIANCE.md')) return false;
  return true;
}

function staleRepoPattern() {
  return new RegExp(`github\\.com\\/${'agent-ic'}|agent-ic-${'hermes-hackathon'}`);
}

function secretShapePattern() {
  const slackHost = `hooks.${'slack'}.com`;
  return new RegExp(`sk_(live|test)_[A-Za-z0-9]{16,}|nvapi-[A-Za-z0-9_-]{16,}|whsec_[A-Za-z0-9]{16,}|https:\\/\\/${slackHost}\\/services\\/[A-Za-z0-9/_-]+`);
}

function privatePathPattern() {
  return new RegExp(`\\/${'run'}\\/${'media'}\\/${'vdubrov'}|\\/${'home'}\\/${'vdubrov'}`);
}

function extractFirstCodeBlockAfter(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const rest = text.slice(start);
  const match = rest.match(/```text\n([\s\S]*?)\n```/);
  return match?.[1]?.trim() || '';
}
