#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const VIDEO = 'demo-out/agent-ic-demo-final-winning-v3.mp4';
const VIDEO_SHA256 = '5da9da4f9b200fe4f304698d8325d225f5965119d5e98c9682c3c82e0fa14726';
const VIDEO_QA = 'demo-out/video-qa-report-winning-v3.json';
const FRAME_QA = 'demo-out/frame-review-winning-v3.json';
const SIDECAR = 'demo-out/stage-events-winning-v3.json';
const CONTACT_SHEET = 'demo-out/video-qa-contact-sheet-winning-v3.jpg';
const REQUIRED_DOCS = ['SUBMISSION.md', 'FINAL_SUBMISSION_PACKET.md', 'VALIDATION.md', 'README.md', 'JUDGE_QUICKSTART.md'];
const PUBLIC_REPO_URL = 'https://github.com/vladdiethecoder/agent-ic';

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
  const passed = (videoQa.checks || []).filter((item) => item.pass).length;
  check('video QA passed every check', videoQa.overall === 'PASS' && passed === (videoQa.checks || []).length && passed >= 60, `${passed}/${(videoQa.checks || []).length}`);
  check('video QA points at primary video', videoQa.video === VIDEO, videoQa.video);
  check('video QA uses stable v3 sidecar', checkDetail(videoQa, 'Stage provenance exists') === SIDECAR, checkDetail(videoQa, 'Stage provenance exists'));
  check('video QA generated contact sheet', videoQa.contactSheet === CONTACT_SHEET && existsSync(CONTACT_SHEET), videoQa.contactSheet);
  check('video QA treats OCR as diagnostic', /not a pass\/fail signal/i.test(checkDetail(videoQa, 'OCR diagnostic captured')), checkDetail(videoQa, 'OCR diagnostic captured'));
}

const frameQa = readJson(FRAME_QA);
check('frame QA report exists', Boolean(frameQa), FRAME_QA);
if (frameQa) {
  const passed = (frameQa.checks || []).filter((item) => item.pass).length;
  check('frame QA passed every check', frameQa.overall === 'PASS' && passed === (frameQa.checks || []).length, `${passed}/${(frameQa.checks || []).length}`);
  check('frame QA extracted every frame', frameQa.metadata?.expectedFrames === frameQa.metadata?.extractedFrames && frameQa.metadata?.extractedFrames > 2500, JSON.stringify(frameQa.metadata));
  check('frame QA points at primary video', frameQa.video === VIDEO, frameQa.video);
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
const finalPacket = readText('FINAL_SUBMISSION_PACKET.md');
const judgeQuickstart = readText('JUDGE_QUICKSTART.md');
for (const doc of REQUIRED_DOCS) check(`${doc} exists`, existsSync(doc), doc);
if (submission) {
  const tweet = extractFirstCodeBlockAfter(submission, '## Judge-Facing Tweet Copy');
  check('tweet copy exists', Boolean(tweet), 'SUBMISSION.md');
  check('tweet copy tags Nous Research', /@NousResearch/.test(tweet), tweet);
  check('tweet copy includes public repo', tweet.includes(PUBLIC_REPO_URL), PUBLIC_REPO_URL);
  check('tweet copy fits X character limit', tweet.length > 0 && tweet.length <= 280, `${tweet.length} chars`);
  check('Typeform copy exists', /## Typeform Copy/.test(submission) && /Why it is useful:/.test(submission) && /Why it is viable:/.test(submission), 'SUBMISSION.md');
}

if (finalPacket) {
  check('final packet references stable sidecar', finalPacket.includes(SIDECAR), SIDECAR);
  check('final packet names current judging criteria', /usefulness, viability, and presentation/i.test(finalPacket), 'judging criteria');
}

if (judgeQuickstart) {
  check('judge quickstart names primary video', judgeQuickstart.includes(VIDEO), VIDEO);
  check('judge quickstart names public repo', judgeQuickstart.includes(PUBLIC_REPO_URL), PUBLIC_REPO_URL);
  check('judge quickstart explains public repo media exclusion', /does not include generated videos/i.test(judgeQuickstart), 'public repo media exclusion');
  check('judge quickstart maps judging criteria', /Usefulness:[\s\S]*Viability:[\s\S]*Presentation:/i.test(judgeQuickstart), 'criteria map');
}

const docsText = REQUIRED_DOCS.map((file) => readText(file)).join('\n');
check('public docs avoid stale v2 artifact references', !/(winning-v2|f3c6ce8a|2931\/2931)/.test(docsText), 'stale artifact scan');
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
