#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const VIDEO = 'demo-out/agent-ic-demo-final-winning-v3.mp4';
const VIDEO_SHA256 = '5da9da4f9b200fe4f304698d8325d225f5965119d5e98c9682c3c82e0fa14726';
const VIDEO_QA = 'demo-out/video-qa-report-winning-v3.json';
const VIDEO_QA_SHA256 = '1007217f8a8c045d20974e157e62ecfa7659dcda976b704189f4c43d481eb61a';
const FRAME_QA = 'demo-out/frame-review-winning-v3.json';
const FRAME_QA_SHA256 = '95a7a4e6257c7a05f17fbf19854095a426a604a674d7ba7548c4d2e2c54a862f';
const SIDECAR = 'demo-out/stage-events-winning-v3.json';
const CONTACT_SHEET = 'demo-out/video-qa-contact-sheet-winning-v3.jpg';
const CONTACT_SHEET_SHA256 = '134f222729f72f74896c944e47bc250a9e591fe300d209ff7a854516afa5ea14';
const COVER_IMAGE = 'demo-out/agent-ic-x-cover-proof.jpg';
const COVER_SHA256 = 'd54a90f93ae9e11330cb0087df4633e70dbf284e32f6ed1e03c5b2fea0d48be1';
const COVER_REPORT = 'demo-out/submission-cover-report.json';
const COVER_SELECTED_TIME_SECONDS = 99.3;
const SUBMISSION_MANIFEST = 'SUBMISSION_MANIFEST.json';
const POSTING_PACKET = 'POSTING_PACKET.md';
const PRIMARY_ANNOUNCEMENT = 'https://x.com/NousResearch/status/2066921443548348436';
const ANNOUNCEMENT_MIRROR = 'https://digg.com/tech/hz8d871s';
const JUDGE_SCORECARD = 'JUDGE_SCORECARD.md';
const VIDEO_JUDGE_GUIDE = 'VIDEO_JUDGE_GUIDE.md';
const PUBLIC_REPO_RELEASE = 'PUBLIC_REPO_RELEASE.md';
const REQUIRED_DOCS = ['SUBMISSION.md', POSTING_PACKET, 'FINAL_SUBMISSION_PACKET.md', 'VALIDATION.md', 'README.md', 'JUDGE_QUICKSTART.md', JUDGE_SCORECARD, VIDEO_JUDGE_GUIDE, PUBLIC_REPO_RELEASE, SUBMISSION_MANIFEST];
const PUBLIC_REPO_URL = 'https://github.com/vladdiethecoder/agent-ic';
const PUBLIC_RELEASE_TAG = 'hackathon-submission-2026-06-25-final-v2';
const PUBLIC_RELEASE_URL = `${PUBLIC_REPO_URL}/tree/${PUBLIC_RELEASE_TAG}`;
const EXPECTED_TEST_COUNT = 184;

const checks = [];

check('primary video exists', existsSync(VIDEO), VIDEO);
if (existsSync(VIDEO)) {
  check('primary video sha256 matches docs', sha256File(VIDEO) === VIDEO_SHA256, sha256File(VIDEO));
  const meta = ffprobe(VIDEO);
  check('primary video duration is 1-3 minutes', meta.duration >= 60 && meta.duration <= 180, `${meta.duration.toFixed(2)}s`);
  check('primary video is 1920x1080', meta.width === 1920 && meta.height === 1080, `${meta.width}x${meta.height}`);
  check('primary video has h264 video and aac audio', meta.videoCodec === 'h264' && meta.audioCodec === 'aac', `${meta.videoCodec}/${meta.audioCodec}`);
}

const videoQa = readJson(VIDEO_QA);
check('video QA report exists', Boolean(videoQa), VIDEO_QA);
if (videoQa) {
  check('video QA report sha256 matches manifest', sha256File(VIDEO_QA) === VIDEO_QA_SHA256, sha256File(VIDEO_QA));
  const passed = (videoQa.checks || []).filter((item) => item.pass).length;
  check('video QA passed every check', videoQa.overall === 'PASS' && passed === (videoQa.checks || []).length && passed >= 60, `${passed}/${(videoQa.checks || []).length}`);
  check('video QA points at primary video', videoQa.video === VIDEO, videoQa.video);
  check('video QA uses stable v3 sidecar', checkDetail(videoQa, 'Stage provenance exists') === SIDECAR, checkDetail(videoQa, 'Stage provenance exists'));
  check('video QA generated contact sheet', videoQa.contactSheet === CONTACT_SHEET && existsSync(CONTACT_SHEET), videoQa.contactSheet);
  check('video QA contact sheet sha256 matches manifest', existsSync(CONTACT_SHEET) && sha256File(CONTACT_SHEET) === CONTACT_SHEET_SHA256, existsSync(CONTACT_SHEET) ? sha256File(CONTACT_SHEET) : 'missing');
  check('video QA treats OCR as diagnostic', /not a pass\/fail signal/i.test(checkDetail(videoQa, 'OCR diagnostic captured')), checkDetail(videoQa, 'OCR diagnostic captured'));
}

const frameQa = readJson(FRAME_QA);
check('frame QA report exists', Boolean(frameQa), FRAME_QA);
if (frameQa) {
  check('frame QA report sha256 matches manifest', sha256File(FRAME_QA) === FRAME_QA_SHA256, sha256File(FRAME_QA));
  const passed = (frameQa.checks || []).filter((item) => item.pass).length;
  check('frame QA passed every check', frameQa.overall === 'PASS' && passed === (frameQa.checks || []).length, `${passed}/${(frameQa.checks || []).length}`);
  check('frame QA extracted every frame', frameQa.metadata?.expectedFrames === frameQa.metadata?.extractedFrames && frameQa.metadata?.extractedFrames > 2500, JSON.stringify(frameQa.metadata));
  check('frame QA points at primary video', frameQa.video === VIDEO, frameQa.video);
}

const coverReport = readJson(COVER_REPORT);
check('X cover image exists', existsSync(COVER_IMAGE), COVER_IMAGE);
if (existsSync(COVER_IMAGE)) {
  check('X cover image sha256 matches manifest', sha256File(COVER_IMAGE) === COVER_SHA256, sha256File(COVER_IMAGE));
  const stats = imageStats(COVER_IMAGE);
  check('X cover image is 1920x1080', stats.width === 1920 && stats.height === 1080, `${stats.width}x${stats.height}`);
  check('X cover image is nonblank by image analysis', stats.mean > 0.04 && stats.stddev > 0.06, JSON.stringify(stats));
}
check('X cover report exists', Boolean(coverReport), COVER_REPORT);
if (coverReport) {
  check('X cover report points at primary video', coverReport.video === VIDEO, coverReport.video);
  check('X cover report points at cover image', coverReport.coverImage === COVER_IMAGE, coverReport.coverImage);
  check('X cover report records cover hash', coverReport.coverImageSha256 === COVER_SHA256, coverReport.coverImageSha256);
  check('X cover report records selected timestamp', coverReport.selectedTimeSeconds === COVER_SELECTED_TIME_SECONDS, coverReport.selectedTimeSeconds);
  check('X cover report records image/video tools', coverReport.tools?.ffmpeg === true && coverReport.tools?.imageMagick === true, JSON.stringify(coverReport.tools || {}));
}

const sidecar = readJson(SIDECAR);
check('stable sidecar exists', Boolean(sidecar), SIDECAR);
if (sidecar) {
  check('sidecar points at clean product URL', sidecar.browserUrl === 'http://app.agenticontrolplane.com/trial', sidecar.browserUrl);
  check('sidecar has sequential visible beats', orderedNumbers(Object.values(sidecar.beats || {}).map(Number)), JSON.stringify(sidecar.beats || {}));
  check('sidecar records live Nemotron request', /^chatcmpl-/i.test(sidecar.trialResponse?.evidence?.classificationMethod?.nemotronRequestId || ''), sidecar.trialResponse?.evidence?.classificationMethod?.nemotronRequestId);
  check('sidecar records Stripe test-mode envelope', sidecar.trialResponse?.stripe?.testMode === true && Number(sidecar.trialResponse?.stripe?.amountDollars) === 100, JSON.stringify(sidecar.trialResponse?.stripe || {}));
  check('sidecar records policy block', sidecar.trialResponse?.policyBlock?.blocked === true && Number(sidecar.trialResponse?.policyBlock?.status) === 403, JSON.stringify(sidecar.trialResponse?.policyBlock || {}));
  check('sidecar records live NemoHermes receipt', sidecar.trialResponse?.hermesExecutionReceipt?.skillSource === 'nemohermes-sandbox' && sidecar.trialResponse?.hermesExecutionReceipt?.state === 'recorded', JSON.stringify(sidecar.trialResponse?.hermesExecutionReceipt || {}));
  check('sidecar records NHTSA workload evidence', Number(sidecar.trialResponse?.evidence?.casesProcessed) === 330 && Number(sidecar.trialResponse?.evidence?.riskAdjustedROI) >= 4, JSON.stringify(sidecar.trialResponse?.evidence || {}));
}

const submission = readText('SUBMISSION.md');
const postingPacket = readText(POSTING_PACKET);
const finalPacket = readText('FINAL_SUBMISSION_PACKET.md');
const judgeQuickstart = readText('JUDGE_QUICKSTART.md');
const judgeScorecard = readText(JUDGE_SCORECARD);
const videoJudgeGuide = readText(VIDEO_JUDGE_GUIDE);
const publicRepoRelease = readText(PUBLIC_REPO_RELEASE);
const pkg = readJson('package.json');
const submissionManifest = readJson(SUBMISSION_MANIFEST);
for (const doc of REQUIRED_DOCS) check(`${doc} exists`, existsSync(doc), doc);
check('package has public judge check script', pkg?.scripts?.['judge:check'] === 'npm test && npm run build && node scripts/judge-public-check.mjs', pkg?.scripts?.['judge:check']);
check('package has submission cover script', pkg?.scripts?.['submission:cover'] === 'node scripts/prepare-submission-cover.mjs', pkg?.scripts?.['submission:cover']);
let tweet = '';
if (submission) {
  tweet = extractFirstCodeBlockAfter(submission, '## Judge-Facing Tweet Copy');
  check('tweet copy exists', Boolean(tweet), 'SUBMISSION.md');
  check('tweet copy tags Nous Research', /@NousResearch/.test(tweet), tweet);
  check('tweet copy includes public repo', tweet.includes(PUBLIC_REPO_URL), PUBLIC_REPO_URL);
  check('tweet copy fits X character limit with posting margin', tweet.length > 0 && tweet.length <= 260, `${tweet.length} chars`);
  check('Typeform copy exists', /## Typeform Copy/.test(submission) && /Why it is useful:/.test(submission) && /Why it is viable:/.test(submission), 'SUBMISSION.md');
  check('submission Typeform copy names current test count', submission.includes(`${EXPECTED_TEST_COUNT} passing tests`) && !/\b183 passing tests\b/.test(submission), `${EXPECTED_TEST_COUNT} passing tests`);
  check('submission docs mention public judge check', /npm run judge:check/.test(submission), 'SUBMISSION.md');
  check('submission docs mention posting packet', submission.includes(POSTING_PACKET), POSTING_PACKET);
}

if (postingPacket) {
  const postingTweet = extractFirstCodeBlockAfter(postingPacket, '## X Post Copy');
  const altText = extractFirstCodeBlockAfter(postingPacket, '## X Alt Text');
  const discordCopy = extractFirstCodeBlockAfter(postingPacket, '## Discord Submission Copy');
  check('posting packet names primary video', postingPacket.includes(VIDEO), VIDEO);
  check('posting packet names primary video hash', postingPacket.includes(VIDEO_SHA256), VIDEO_SHA256);
  check('posting packet names optional X cover', postingPacket.includes(COVER_IMAGE), COVER_IMAGE);
  check('posting packet names optional X cover hash', postingPacket.includes(COVER_SHA256), COVER_SHA256);
  check('posting packet names immutable public release tag', postingPacket.includes(PUBLIC_RELEASE_TAG), PUBLIC_RELEASE_TAG);
  check('posting packet names video judge guide', postingPacket.includes(VIDEO_JUDGE_GUIDE), VIDEO_JUDGE_GUIDE);
  check('posting packet names primary announcement', postingPacket.includes(PRIMARY_ANNOUNCEMENT), PRIMARY_ANNOUNCEMENT);
  check('posting packet X copy exists', Boolean(postingTweet), POSTING_PACKET);
  check('posting packet X copy matches submission docs', Boolean(postingTweet) && postingTweet === tweet, `${postingTweet.length} chars`);
  check('posting packet X copy tags Nous Research', /@NousResearch/.test(postingTweet), postingTweet);
  check('posting packet X copy includes public repo', postingTweet.includes(PUBLIC_REPO_URL), PUBLIC_REPO_URL);
  check('posting packet X copy keeps posting margin', postingTweet.length > 0 && postingTweet.length <= 260, `${postingTweet.length} chars`);
  check('posting packet alt text exists', altText.length >= 120 && altText.length <= 1000, `${altText.length} chars`);
  check('posting packet alt text covers proof arc', /Stripe test-mode/i.test(altText) && /NHTSA/i.test(altText) && /policy-gate 403/i.test(altText) && /NemoHermes/i.test(altText), 'alt proof arc');
  check('posting packet Discord copy has replaceable X URL', discordCopy.includes('X_POST_URL'), discordCopy);
  check('posting packet Discord copy includes public repo', discordCopy.includes(PUBLIC_REPO_URL), PUBLIC_REPO_URL);
  check('posting packet Discord copy covers proof claims', /Stripe test-mode/i.test(discordCopy) && /NHTSA/i.test(discordCopy) && /OpenShell/i.test(discordCopy) && /NemoHermes/i.test(discordCopy), 'Discord proof claims');
  check('posting packet Typeform answers exist', /## Typeform Answers/.test(postingPacket) && /Why it is useful:/.test(postingPacket) && /Why it is viable:/.test(postingPacket) && /Integrations used:/.test(postingPacket), POSTING_PACKET);
  check('posting packet Typeform copy names current test count', postingPacket.includes(`${EXPECTED_TEST_COUNT} passing tests`) && !/\b183 passing tests\b/.test(postingPacket), `${EXPECTED_TEST_COUNT} passing tests`);
  check('posting packet final account checklist exists', /## Final Account Checklist/.test(postingPacket) && /Complete the Typeform/i.test(postingPacket), POSTING_PACKET);
}

if (finalPacket) {
  check('final packet references stable sidecar', finalPacket.includes(SIDECAR), SIDECAR);
  check('final packet names current test count', finalPacket.includes(`${EXPECTED_TEST_COUNT}/${EXPECTED_TEST_COUNT} passing`) && !/\b183\/183\b/.test(finalPacket), `${EXPECTED_TEST_COUNT}/${EXPECTED_TEST_COUNT}`);
  check('final packet names current judging criteria', /usefulness, viability, and presentation/i.test(finalPacket), 'judging criteria');
  check('final packet names video judge guide', finalPacket.includes(VIDEO_JUDGE_GUIDE), VIDEO_JUDGE_GUIDE);
}

if (publicRepoRelease) {
  check('public repo release doc names immutable public release tag', publicRepoRelease.includes(PUBLIC_RELEASE_TAG), PUBLIC_RELEASE_TAG);
  check('public repo release doc names video judge guide', publicRepoRelease.includes(VIDEO_JUDGE_GUIDE), VIDEO_JUDGE_GUIDE);
}

if (judgeQuickstart) {
  check('judge quickstart names primary video', judgeQuickstart.includes(VIDEO), VIDEO);
  check('judge quickstart names public repo', judgeQuickstart.includes(PUBLIC_REPO_URL), PUBLIC_REPO_URL);
  check('judge quickstart names immutable public release tag', judgeQuickstart.includes(PUBLIC_RELEASE_TAG), PUBLIC_RELEASE_TAG);
  check('judge quickstart names video judge guide', judgeQuickstart.includes(VIDEO_JUDGE_GUIDE), VIDEO_JUDGE_GUIDE);
  check('judge quickstart explains public repo media exclusion', /does not include generated videos/i.test(judgeQuickstart), 'public repo media exclusion');
  check('judge quickstart maps judging criteria', /Usefulness:[\s\S]*Viability:[\s\S]*Presentation:/i.test(judgeQuickstart), 'criteria map');
  check('judge quickstart documents public clone check', /npm run judge:check/.test(judgeQuickstart), 'JUDGE_QUICKSTART.md');
  check('judge quickstart links judge scorecard', judgeQuickstart.includes(JUDGE_SCORECARD), JUDGE_SCORECARD);
}

if (judgeScorecard) {
  check('judge scorecard names public repo', judgeScorecard.includes(PUBLIC_REPO_URL), PUBLIC_REPO_URL);
  check('judge scorecard names immutable public release tag', judgeScorecard.includes(PUBLIC_RELEASE_TAG) && judgeScorecard.includes(PUBLIC_RELEASE_URL), PUBLIC_RELEASE_TAG);
  check('judge scorecard names video judge guide', judgeScorecard.includes(VIDEO_JUDGE_GUIDE), VIDEO_JUDGE_GUIDE);
  check('judge scorecard names primary video', judgeScorecard.includes(VIDEO), VIDEO);
  check('judge scorecard names primary video hash', judgeScorecard.includes(VIDEO_SHA256), VIDEO_SHA256);
  check('judge scorecard names optional X cover', judgeScorecard.includes(COVER_IMAGE) && judgeScorecard.includes(COVER_SHA256), COVER_IMAGE);
  check('judge scorecard maps live criteria', ['usefulness', 'viability', 'presentation'].every((key) => new RegExp(key, 'i').test(judgeScorecard)), JUDGE_SCORECARD);
  check('judge scorecard documents public clone check', /npm run judge:check/.test(judgeScorecard), JUDGE_SCORECARD);
  check('judge scorecard keeps Stripe wording in test mode', /Stripe test-mode/i.test(judgeScorecard), JUDGE_SCORECARD);
  check('judge scorecard keeps OCR diagnostic-only', /OCR is diagnostic only/i.test(judgeScorecard), JUDGE_SCORECARD);
}

if (videoJudgeGuide) {
  check('video judge guide names primary video', videoJudgeGuide.includes(VIDEO), VIDEO);
  check('video judge guide names primary video hash', videoJudgeGuide.includes(VIDEO_SHA256), VIDEO_SHA256);
  check('video judge guide maps live criteria', ['Usefulness', 'Viability', 'Presentation'].every((key) => videoJudgeGuide.includes(key)), VIDEO_JUDGE_GUIDE);
  check('video judge guide has timestamped watch map', /00:00-00:15[\s\S]*01:49-01:55/.test(videoJudgeGuide), VIDEO_JUDGE_GUIDE);
  check('video judge guide records proof receipts', /Stripe[\s\S]*NHTSA[\s\S]*Nemotron[\s\S]*Policy[\s\S]*Hermes/.test(videoJudgeGuide), VIDEO_JUDGE_GUIDE);
  check('video judge guide keeps OCR diagnostic-only', /OCR is diagnostic only/i.test(videoJudgeGuide), VIDEO_JUDGE_GUIDE);
}

check('submission manifest parses', Boolean(submissionManifest), SUBMISSION_MANIFEST);
if (submissionManifest) {
  check('submission manifest names public repo', submissionManifest.project?.publicRepo === PUBLIC_REPO_URL, submissionManifest.project?.publicRepo);
  check('submission manifest names immutable public release tag', submissionManifest.project?.publicReleaseTag === PUBLIC_RELEASE_TAG, submissionManifest.project?.publicReleaseTag);
  check('submission manifest names immutable public release url', submissionManifest.project?.publicReleaseUrl === PUBLIC_RELEASE_URL, submissionManifest.project?.publicReleaseUrl);
  check('submission manifest names judge scorecard', submissionManifest.project?.judgeScorecard === JUDGE_SCORECARD, submissionManifest.project?.judgeScorecard);
  check('submission manifest names video judge guide', submissionManifest.project?.videoJudgeGuide === VIDEO_JUDGE_GUIDE, submissionManifest.project?.videoJudgeGuide);
  check('submission manifest names primary announcement', submissionManifest.hackathon?.primaryAnnouncement === PRIMARY_ANNOUNCEMENT, submissionManifest.hackathon?.primaryAnnouncement);
  check('submission manifest names announcement mirror', submissionManifest.hackathon?.announcementMirror === ANNOUNCEMENT_MIRROR, submissionManifest.hackathon?.announcementMirror);
  check('submission manifest names primary video', submissionManifest.submissionVideo?.path === VIDEO, submissionManifest.submissionVideo?.path);
  check('submission manifest names primary video hash', submissionManifest.submissionVideo?.sha256 === VIDEO_SHA256, submissionManifest.submissionVideo?.sha256);
  check('submission manifest names posting packet', submissionManifest.postingPacket?.path === POSTING_PACKET, submissionManifest.postingPacket?.path);
  check('submission manifest names X post length', submissionManifest.postingPacket?.xPostRawCharacters === 255, submissionManifest.postingPacket?.xPostRawCharacters);
  check('submission manifest names X cover image', submissionManifest.postingPacket?.xCoverImage === COVER_IMAGE, submissionManifest.postingPacket?.xCoverImage);
  check('submission manifest names X cover hash', submissionManifest.postingPacket?.xCoverImageSha256 === COVER_SHA256, submissionManifest.postingPacket?.xCoverImageSha256);
  check('submission manifest names X cover timestamp', submissionManifest.postingPacket?.xCoverSelectedTimeSeconds === COVER_SELECTED_TIME_SECONDS, submissionManifest.postingPacket?.xCoverSelectedTimeSeconds);
  check('submission manifest requires X video attachment', submissionManifest.postingPacket?.requiresXPostVideoAttachment === true, submissionManifest.postingPacket?.requiresXPostVideoAttachment);
  check('submission manifest requires Discord X URL replacement', submissionManifest.postingPacket?.requiresDiscordLinkReplacement === 'X_POST_URL', submissionManifest.postingPacket?.requiresDiscordLinkReplacement);
  check('submission manifest names video QA report hash', submissionManifest.validation?.videoQa?.sha256 === VIDEO_QA_SHA256, submissionManifest.validation?.videoQa?.sha256);
  check('submission manifest names contact sheet hash', submissionManifest.validation?.videoQa?.contactSheetSha256 === CONTACT_SHEET_SHA256, submissionManifest.validation?.videoQa?.contactSheetSha256);
  check('submission manifest names frame QA report hash', submissionManifest.validation?.frameQa?.sha256 === FRAME_QA_SHA256, submissionManifest.validation?.frameQa?.sha256);
  check('submission manifest keeps OCR diagnostic-only', /diagnostic only/i.test(submissionManifest.validation?.videoQa?.ocrPolicy || ''), submissionManifest.validation?.videoQa?.ocrPolicy);
  check('submission manifest maps judging criteria', ['usefulness', 'viability', 'presentation'].every((key) => Boolean(submissionManifest.judgeMap?.[key])), JSON.stringify(Object.keys(submissionManifest.judgeMap || {})));
}

const docsText = REQUIRED_DOCS.map((file) => readText(file)).join('\n');
check('public docs avoid stale v2 artifact references', !/(winning-v2|f3c6ce8a|2931\/2931)/.test(docsText), 'stale artifact scan');
check('public docs avoid stale test-count references', !/\b183(?:\/183| passing tests)\b/.test(docsText), 'stale test-count scan');
check('public docs avoid raw provider secrets', !/(sk_(live|test)_[A-Za-z0-9]{16,}|nvapi-[A-Za-z0-9_-]{16,}|whsec_[A-Za-z0-9]{16,})/.test(docsText), 'secret scan');
check('public docs keep Stripe wording in test mode', /Stripe test-mode/i.test(docsText) && !/production money movement/i.test(submission), 'Stripe wording');

const failures = checks.filter((item) => !item.ok);
const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  primaryVideo: { path: VIDEO, sha256: VIDEO_SHA256 },
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

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function ffprobe(file) {
  const raw = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height',
    '-of', 'json',
    file,
  ], { encoding: 'utf8' });
  const data = JSON.parse(raw);
  const video = data.streams.find((stream) => stream.codec_type === 'video') || {};
  const audio = data.streams.find((stream) => stream.codec_type === 'audio') || {};
  return {
    duration: Number(data.format?.duration || 0),
    width: Number(video.width || 0),
    height: Number(video.height || 0),
    videoCodec: video.codec_name || '',
    audioCodec: audio.codec_name || '',
  };
}

function imageStats(file) {
  const raw = execFileSync('magick', [
    'identify',
    '-format',
    '%w %h %[fx:mean] %[fx:standard_deviation]',
    file,
  ], { encoding: 'utf8' }).trim();
  const [width, height, mean, stddev] = raw.split(/\s+/);
  return {
    width: Number(width),
    height: Number(height),
    mean: Number(mean),
    stddev: Number(stddev),
  };
}

function checkDetail(report, name) {
  return String((report.checks || []).find((item) => item.name === name)?.detail || '');
}

function orderedNumbers(values) {
  const filtered = values.filter(Number.isFinite);
  if (filtered.length < 8) return false;
  return filtered.every((value, index) => index === 0 || value >= filtered[index - 1]);
}

function extractFirstCodeBlockAfter(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const rest = text.slice(start);
  const match = rest.match(/```text\n([\s\S]*?)\n```/);
  return match?.[1]?.trim() || '';
}
