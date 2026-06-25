#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const PUBLIC_REPO_URL = 'https://github.com/vladdiethecoder/agent-ic';
const PUBLIC_RELEASE_TAG = 'hackathon-submission-2026-06-25-final-v4';
const PUBLIC_RELEASE_URL = `${PUBLIC_REPO_URL}/tree/${PUBLIC_RELEASE_TAG}`;
const PUBLIC_RELEASE_PAGE_URL = `${PUBLIC_REPO_URL}/releases/tag/${PUBLIC_RELEASE_TAG}`;
const PUBLIC_RELEASE_DOWNLOAD_URL = `${PUBLIC_REPO_URL}/releases/download/${PUBLIC_RELEASE_TAG}`;
const VIDEO_JUDGE_GUIDE = 'VIDEO_JUDGE_GUIDE.md';
const POSTING_PACKET = 'POSTING_PACKET.md';
const VIDEO = 'demo-out/agent-ic-demo-final-winning-v3.mp4';
const VIDEO_SHA256 = '5da9da4f9b200fe4f304698d8325d225f5965119d5e98c9682c3c82e0fa14726';
const COVER_IMAGE = 'demo-out/agent-ic-x-cover-proof.jpg';
const COVER_SHA256 = 'd54a90f93ae9e11330cb0087df4633e70dbf284e32f6ed1e03c5b2fea0d48be1';
const VIDEO_QA_SHA256 = '1007217f8a8c045d20974e157e62ecfa7659dcda976b704189f4c43d481eb61a';
const FRAME_QA_SHA256 = '95a7a4e6257c7a05f17fbf19854095a426a604a674d7ba7548c4d2e2c54a862f';
const CONTACT_SHEET_SHA256 = '134f222729f72f74896c944e47bc250a9e591fe300d209ff7a854516afa5ea14';
const SIDECAR_SHA256 = 'cb69631f34890f634b11c7b2625808b4730e372502474ea3429dbdc40061bf34';
const VIDEO_RELEASE_ASSET_URL = `${PUBLIC_RELEASE_DOWNLOAD_URL}/agent-ic-demo-final-winning-v3.mp4`;
const COVER_RELEASE_ASSET_URL = `${PUBLIC_RELEASE_DOWNLOAD_URL}/agent-ic-x-cover-proof.jpg`;
const VIDEO_QA_RELEASE_ASSET_URL = `${PUBLIC_RELEASE_DOWNLOAD_URL}/video-qa-report-winning-v3.json`;
const FRAME_QA_RELEASE_ASSET_URL = `${PUBLIC_RELEASE_DOWNLOAD_URL}/frame-review-winning-v3.json`;
const CONTACT_SHEET_RELEASE_ASSET_URL = `${PUBLIC_RELEASE_DOWNLOAD_URL}/video-qa-contact-sheet-winning-v3.jpg`;
const SIDECAR_RELEASE_ASSET_URL = `${PUBLIC_RELEASE_DOWNLOAD_URL}/stage-events-winning-v3.json`;
const PUBLIC_TARBALL_RELEASE_ASSET_URL = `${PUBLIC_RELEASE_DOWNLOAD_URL}/agent-ic-public-submission.tar.gz`;
const EXPECTED_TEST_COUNT = 185;
const REQUIRED_FILES = [
  'README.md',
  'JUDGE_QUICKSTART.md',
  'JUDGE_SCORECARD.md',
  VIDEO_JUDGE_GUIDE,
  'SUBMISSION.md',
  'SUBMISSION_MANIFEST.json',
  'FINAL_SUBMISSION_PACKET.md',
  POSTING_PACKET,
  'PUBLIC_REPO_RELEASE.md',
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
  'VIDEO_JUDGE_GUIDE.md',
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
  const releaseAssets = new Map((manifest.releaseAssets?.assets || []).map((asset) => [asset.name, asset]));
  check('manifest names Agent IC', manifest.project?.name === 'Agent IC', manifest.project?.name);
  check('manifest names public repo', manifest.project?.publicRepo === PUBLIC_REPO_URL, manifest.project?.publicRepo);
  check('manifest names immutable public release tag', manifest.project?.publicReleaseTag === PUBLIC_RELEASE_TAG, manifest.project?.publicReleaseTag);
  check('manifest names immutable public release url', manifest.project?.publicReleaseUrl === PUBLIC_RELEASE_URL, manifest.project?.publicReleaseUrl);
  check('manifest names release asset bundle', manifest.project?.publicReleaseAssetsUrl === PUBLIC_RELEASE_PAGE_URL, manifest.project?.publicReleaseAssetsUrl);
  check('manifest names video judge guide', manifest.project?.videoJudgeGuide === VIDEO_JUDGE_GUIDE, manifest.project?.videoJudgeGuide);
  check('manifest names primary video', manifest.submissionVideo?.path === VIDEO, manifest.submissionVideo?.path);
  check('manifest names primary video hash', manifest.submissionVideo?.sha256 === VIDEO_SHA256, manifest.submissionVideo?.sha256);
  check('manifest names video release asset fallback', manifest.submissionVideo?.releaseAssetUrl === VIDEO_RELEASE_ASSET_URL, manifest.submissionVideo?.releaseAssetUrl);
  check('manifest names optional X cover', manifest.postingPacket?.xCoverImage === COVER_IMAGE, manifest.postingPacket?.xCoverImage);
  check('manifest names optional X cover hash', manifest.postingPacket?.xCoverImageSha256 === COVER_SHA256, manifest.postingPacket?.xCoverImageSha256);
  check('manifest explains public video delivery', /attach this mp4 to the x submission post/i.test(manifest.submissionVideo?.publicDelivery || ''), manifest.submissionVideo?.publicDelivery);
  check('manifest keeps release asset as fallback audit only', /fallback\/audit copy/i.test(manifest.submissionVideo?.publicDelivery || '') && /not a substitute/i.test(manifest.submissionVideo?.publicDelivery || ''), manifest.submissionVideo?.publicDelivery);
  check('manifest carries video QA hash', /^[a-f0-9]{64}$/.test(manifest.validation?.videoQa?.sha256 || ''), manifest.validation?.videoQa?.sha256);
  check('manifest carries frame QA hash', /^[a-f0-9]{64}$/.test(manifest.validation?.frameQa?.sha256 || ''), manifest.validation?.frameQa?.sha256);
  check('manifest keeps OCR diagnostic-only', /diagnostic only/i.test(manifest.validation?.videoQa?.ocrPolicy || ''), manifest.validation?.videoQa?.ocrPolicy);
  check('manifest maps all judging criteria', ['usefulness', 'viability', 'presentation'].every((key) => Boolean(manifest.judgeMap?.[key])), JSON.stringify(Object.keys(manifest.judgeMap || {})));
  check('manifest records public repo excludes generated video artifacts', (manifest.publicRepoPolicy?.excludes || []).some((item) => /generated videos/i.test(item)), JSON.stringify(manifest.publicRepoPolicy?.excludes || []));
  check('manifest names release asset page', manifest.releaseAssets?.githubRelease === PUBLIC_RELEASE_PAGE_URL, manifest.releaseAssets?.githubRelease);
  check('manifest release asset purpose is fallback audit only', /Fallback\/audit bundle/.test(manifest.releaseAssets?.purpose || '') && /X-attached MP4 remains the required primary/.test(manifest.releaseAssets?.purpose || ''), manifest.releaseAssets?.purpose);
  check('manifest release asset names primary MP4', releaseAssets.get('agent-ic-demo-final-winning-v3.mp4')?.url === VIDEO_RELEASE_ASSET_URL && releaseAssets.get('agent-ic-demo-final-winning-v3.mp4')?.sha256 === VIDEO_SHA256, JSON.stringify(releaseAssets.get('agent-ic-demo-final-winning-v3.mp4') || {}));
  check('manifest release asset names X cover', releaseAssets.get('agent-ic-x-cover-proof.jpg')?.url === COVER_RELEASE_ASSET_URL && releaseAssets.get('agent-ic-x-cover-proof.jpg')?.sha256 === COVER_SHA256, JSON.stringify(releaseAssets.get('agent-ic-x-cover-proof.jpg') || {}));
  check('manifest release asset names video QA report', releaseAssets.get('video-qa-report-winning-v3.json')?.url === VIDEO_QA_RELEASE_ASSET_URL && releaseAssets.get('video-qa-report-winning-v3.json')?.sha256 === VIDEO_QA_SHA256, JSON.stringify(releaseAssets.get('video-qa-report-winning-v3.json') || {}));
  check('manifest release asset names frame QA report', releaseAssets.get('frame-review-winning-v3.json')?.url === FRAME_QA_RELEASE_ASSET_URL && releaseAssets.get('frame-review-winning-v3.json')?.sha256 === FRAME_QA_SHA256, JSON.stringify(releaseAssets.get('frame-review-winning-v3.json') || {}));
  check('manifest release asset names contact sheet', releaseAssets.get('video-qa-contact-sheet-winning-v3.jpg')?.url === CONTACT_SHEET_RELEASE_ASSET_URL && releaseAssets.get('video-qa-contact-sheet-winning-v3.jpg')?.sha256 === CONTACT_SHEET_SHA256, JSON.stringify(releaseAssets.get('video-qa-contact-sheet-winning-v3.jpg') || {}));
  check('manifest release asset names sidecar', releaseAssets.get('stage-events-winning-v3.json')?.url === SIDECAR_RELEASE_ASSET_URL && releaseAssets.get('stage-events-winning-v3.json')?.sha256 === SIDECAR_SHA256, JSON.stringify(releaseAssets.get('stage-events-winning-v3.json') || {}));
  check('manifest release asset names public tarball URL', releaseAssets.get('agent-ic-public-submission.tar.gz')?.url === PUBLIC_TARBALL_RELEASE_ASSET_URL, JSON.stringify(releaseAssets.get('agent-ic-public-submission.tar.gz') || {}));
}

const readme = readText('README.md');
const quickstart = readText('JUDGE_QUICKSTART.md');
const scorecard = readText('JUDGE_SCORECARD.md');
const videoGuide = readText(VIDEO_JUDGE_GUIDE);
const submission = readText('SUBMISSION.md');
const packet = readText('FINAL_SUBMISSION_PACKET.md');
const posting = readText('POSTING_PACKET.md');
const releaseDoc = readText('PUBLIC_REPO_RELEASE.md');

check('README names public repo', readme.includes(PUBLIC_REPO_URL), 'README.md');
check('README names immutable public release tag', readme.includes(PUBLIC_RELEASE_TAG), 'README.md');
check('README names release asset bundle', readme.includes(PUBLIC_RELEASE_PAGE_URL), 'README.md');
check('README names video release asset fallback', readme.includes(VIDEO_RELEASE_ASSET_URL), 'README.md');
check('README keeps X as required primary video upload', /video must be attached to the public X submission post/i.test(readme), 'README.md');
check('README labels release assets as fallback audit copy', /fallback\/audit copy/i.test(readme), 'README.md');
check('README names primary video hash', readme.includes(VIDEO_SHA256), 'README.md');
check('README names video judge guide', readme.includes(VIDEO_JUDGE_GUIDE), 'README.md');
check('quickstart explains media exclusion', /does not include generated videos/i.test(quickstart), 'JUDGE_QUICKSTART.md');
check('quickstart names release asset bundle', quickstart.includes(PUBLIC_RELEASE_PAGE_URL), 'JUDGE_QUICKSTART.md');
check('quickstart names video release asset fallback', quickstart.includes(VIDEO_RELEASE_ASSET_URL), 'JUDGE_QUICKSTART.md');
check('quickstart keeps release asset as fallback audit only', /GitHub release asset is only a fallback\/audit copy/i.test(quickstart), 'JUDGE_QUICKSTART.md');
check('quickstart documents judge check', /npm run judge:check/.test(quickstart), 'JUDGE_QUICKSTART.md');
check('quickstart names posting packet', quickstart.includes('POSTING_PACKET.md'), 'JUDGE_QUICKSTART.md');
check('quickstart links judge scorecard', quickstart.includes('JUDGE_SCORECARD.md'), 'JUDGE_QUICKSTART.md');
check('quickstart names immutable public release tag', quickstart.includes(PUBLIC_RELEASE_TAG), 'JUDGE_QUICKSTART.md');
check('quickstart names video judge guide', quickstart.includes(VIDEO_JUDGE_GUIDE), 'JUDGE_QUICKSTART.md');
check('scorecard names public repo', scorecard.includes(PUBLIC_REPO_URL), 'JUDGE_SCORECARD.md');
check('scorecard names immutable public release tag', scorecard.includes(PUBLIC_RELEASE_TAG) && scorecard.includes(PUBLIC_RELEASE_URL), 'JUDGE_SCORECARD.md');
check('scorecard names release asset bundle', scorecard.includes(PUBLIC_RELEASE_PAGE_URL), 'JUDGE_SCORECARD.md');
check('scorecard names video release asset fallback', scorecard.includes(VIDEO_RELEASE_ASSET_URL), 'JUDGE_SCORECARD.md');
check('scorecard keeps release asset as fallback audit only', /fallback\/audit bundle/i.test(scorecard), 'JUDGE_SCORECARD.md');
check('scorecard names video judge guide', scorecard.includes(VIDEO_JUDGE_GUIDE), 'JUDGE_SCORECARD.md');
check('scorecard names primary video hash', scorecard.includes(VIDEO_SHA256), 'JUDGE_SCORECARD.md');
check('scorecard names optional X cover', scorecard.includes(COVER_IMAGE) && scorecard.includes(COVER_SHA256), 'JUDGE_SCORECARD.md');
check('scorecard maps all judging criteria', ['usefulness', 'viability', 'presentation'].every((key) => new RegExp(key, 'i').test(scorecard)), 'JUDGE_SCORECARD.md');
check('scorecard documents public clone check', /npm run judge:check/.test(scorecard), 'JUDGE_SCORECARD.md');
check('scorecard keeps Stripe wording in test mode', /Stripe test-mode/i.test(scorecard), 'JUDGE_SCORECARD.md');
check('scorecard keeps OCR diagnostic-only', /OCR is diagnostic only/i.test(scorecard), 'JUDGE_SCORECARD.md');
check('video judge guide names primary video hash', videoGuide.includes(VIDEO_SHA256), VIDEO_JUDGE_GUIDE);
check('video judge guide names immutable public release tag', videoGuide.includes(PUBLIC_RELEASE_TAG), VIDEO_JUDGE_GUIDE);
check('video judge guide avoids stale final release tags', !/hackathon-submission-2026-06-25-final-v[123]\b/.test(videoGuide), VIDEO_JUDGE_GUIDE);
check('video judge guide maps live criteria', ['Usefulness', 'Viability', 'Presentation'].every((key) => videoGuide.includes(key)), VIDEO_JUDGE_GUIDE);
check('video judge guide has timestamped watch map', /00:00-00:15[\s\S]*01:49-01:55/.test(videoGuide), VIDEO_JUDGE_GUIDE);
check('video judge guide has transcript', /## Voiceover Transcript/.test(videoGuide) && /Agent IC is the control plane/.test(videoGuide), VIDEO_JUDGE_GUIDE);
check('video judge guide keeps OCR diagnostic-only', /OCR is diagnostic only/i.test(videoGuide), VIDEO_JUDGE_GUIDE);
check('submission keeps external actions explicit', /Tweet demo video tagging @NousResearch/.test(submission) && /Complete Typeform/.test(submission), 'SUBMISSION.md');
check('submission names current test count', submission.includes(`${EXPECTED_TEST_COUNT} passing tests`) && !/\b(?:183|184) passing tests\b/.test(submission), 'SUBMISSION.md');
check('submission names posting packet', submission.includes('POSTING_PACKET.md'), 'SUBMISSION.md');
check('final packet names QA hashes', /1007217f8a8c045d20974e157e62ecfa7659dcda976b704189f4c43d481eb61a/.test(packet) && /95a7a4e6257c7a05f17fbf19854095a426a604a674d7ba7548c4d2e2c54a862f/.test(packet), 'FINAL_SUBMISSION_PACKET.md');
check('final packet names release asset bundle', packet.includes(PUBLIC_RELEASE_PAGE_URL), 'FINAL_SUBMISSION_PACKET.md');
check('final packet names video release asset fallback', packet.includes(VIDEO_RELEASE_ASSET_URL), 'FINAL_SUBMISSION_PACKET.md');
check('final packet keeps X as required primary upload', /X remains the required primary video upload/i.test(packet), 'FINAL_SUBMISSION_PACKET.md');
check('final packet names current test count', packet.includes(`${EXPECTED_TEST_COUNT}/${EXPECTED_TEST_COUNT} passing`) && !/\b(?:183|184)\/(?:183|184)\b/.test(packet), 'FINAL_SUBMISSION_PACKET.md');
check('final packet names posting packet', packet.includes('POSTING_PACKET.md'), 'FINAL_SUBMISSION_PACKET.md');
check('final packet names video judge guide', packet.includes(VIDEO_JUDGE_GUIDE), 'FINAL_SUBMISSION_PACKET.md');
check('public release doc names immutable release tag', releaseDoc.includes(PUBLIC_RELEASE_TAG), 'PUBLIC_REPO_RELEASE.md');
check('public release doc names release asset bundle', releaseDoc.includes(PUBLIC_RELEASE_PAGE_URL), 'PUBLIC_REPO_RELEASE.md');
check('public release doc keeps video out of git', /not committed into the public repo/i.test(releaseDoc), 'PUBLIC_REPO_RELEASE.md');
check('public release doc keeps release assets as fallback audit', /fallback\/audit assets/i.test(releaseDoc), 'PUBLIC_REPO_RELEASE.md');
check('public release doc names video judge guide', releaseDoc.includes(VIDEO_JUDGE_GUIDE), 'PUBLIC_REPO_RELEASE.md');
if (posting) {
  const xPost = extractFirstCodeBlockAfter(posting, '## X Post Copy');
  const altText = extractFirstCodeBlockAfter(posting, '## X Alt Text');
  const discord = extractFirstCodeBlockAfter(posting, '## Discord Submission Copy');
  check('posting packet names primary video', posting.includes(VIDEO), VIDEO);
  check('posting packet names primary video hash', posting.includes(VIDEO_SHA256), VIDEO_SHA256);
  check('posting packet names optional X cover', posting.includes(COVER_IMAGE) && posting.includes(COVER_SHA256), COVER_IMAGE);
  check('posting packet names immutable public release tag', posting.includes(PUBLIC_RELEASE_TAG), PUBLIC_RELEASE_TAG);
  check('posting packet names release asset bundle', posting.includes(PUBLIC_RELEASE_PAGE_URL), PUBLIC_RELEASE_PAGE_URL);
  check('posting packet names video release asset fallback', posting.includes(VIDEO_RELEASE_ASSET_URL), VIDEO_RELEASE_ASSET_URL);
  check('posting packet keeps release asset as fallback audit only', /does not replace the required X video upload/i.test(posting), POSTING_PACKET);
  check('posting packet names video judge guide', posting.includes(VIDEO_JUDGE_GUIDE), VIDEO_JUDGE_GUIDE);
  check('posting packet X copy is ready', xPost.length > 0 && xPost.length <= 260 && /@NousResearch/.test(xPost) && xPost.includes(PUBLIC_REPO_URL), `${xPost.length} chars`);
  check('posting packet alt text is ready', altText.length >= 120 && altText.length <= 1000 && /policy-gate 403/i.test(altText), `${altText.length} chars`);
  check('posting packet Discord copy is ready', discord.includes('X_POST_URL') && discord.includes(PUBLIC_REPO_URL) && /NemoHermes/i.test(discord), 'POSTING_PACKET.md');
  check('posting packet Typeform answers are ready', /## Typeform Answers/.test(posting) && /Why it is useful:/.test(posting) && /Why it is viable:/.test(posting) && /Integrations used:/.test(posting), 'POSTING_PACKET.md');
  check('posting packet names current test count', posting.includes(`${EXPECTED_TEST_COUNT} passing tests`) && !/\b(?:183|184) passing tests\b/.test(posting), 'POSTING_PACKET.md');
}

const trackedFiles = listTrackedFiles();
const publicTrackedFiles = trackedFiles.filter(isPublicExportPath);
const forbiddenTracked = publicTrackedFiles.filter((file) => /(^|\/)(\.env\.local|demo-out|\.agent-ic|node_modules|\.git|\.github\/workflows)(\/|$)/.test(file));
check('tracked files exclude local/generated artifacts', forbiddenTracked.length === 0, forbiddenTracked.join(', ') || 'clean');

const scanned = scanTrackedText(publicTrackedFiles);
check('tracked text avoids stale/private repo slugs', !staleRepoPattern().test(scanned), 'stale repo scan');
check('tracked text avoids stale test-count references', !/\b(?:183|184)(?:\/(?:183|184)| passing tests)\b/.test(scanned), 'stale test-count scan');
check('tracked text avoids raw provider secret shapes', !secretShapePattern().test(scanned), 'secret shape scan');
check('tracked text avoids private local paths', !privatePathPattern().test(scanned), 'local path scan');

const failures = checks.filter((item) => !item.ok);
const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  note: 'Public clone check intentionally does not require generated video artifacts; the MP4 must be attached to the X submission post, and the GitHub release asset is fallback/audit evidence.',
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
