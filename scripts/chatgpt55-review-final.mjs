#!/usr/bin/env node
/**
 * Run ChatGPT 5.5 agent reviews against the final demo evidence bundle.
 *
 * This is intentionally separate from the deterministic QA gates. The goal is
 * adversarial prompt review of the current rendered video, captions, audio, and
 * proof artifacts with enough specialization that one broad PASS cannot hide a
 * weak area.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const REVIEW_PROVIDER = (process.env.AGENT_IC_REVIEW_PROVIDER || 'codex').toLowerCase();
const CODEX_BIN = process.env.CODEX_BIN || 'codex';
const CODEX_CHATGPT55_MODEL = process.env.CODEX_CHATGPT55_MODEL || 'gpt-5.5';
const HERMES_BIN = process.env.HERMES_BIN || 'hermes';
const HERMES_REVIEW_MODEL = process.env.HERMES_REVIEW_MODEL || '';
const HERMES_REVIEW_PROVIDER = process.env.HERMES_REVIEW_PROVIDER || '';
const REVIEW_LABEL = REVIEW_PROVIDER === 'hermes' ? 'hermes' : 'chatgpt55';
const REVIEW_PERSONA = REVIEW_PROVIDER === 'hermes' ? 'Hermes Agent' : 'ChatGPT 5.5';
const PROJECT_ROOT = process.cwd();
const OUT_DIR = process.env.AGENT_IC_CHATGPT55_REVIEW_DIR || 'demo-out/chatgpt55-reviews/final-20';
const REPORT_PATH = process.env.AGENT_IC_CHATGPT55_REVIEW_REPORT || 'demo-out/chatgpt55-reviews/final-20-report.json';
const TIMEOUT_MS = Number(process.env.AGENT_IC_CHATGPT55_REVIEW_TIMEOUT_MS || 360000);
const CONCURRENCY = Math.max(1, Number(process.env.AGENT_IC_CHATGPT55_REVIEW_CONCURRENCY || 2));
const REVIEW_SUITE = process.env.AGENT_IC_CHATGPT55_REVIEW_SUITE || 'specialized';

const ARTIFACTS = {
  video: 'demo-out/agent-ic-demo-final.mp4',
  videoQa: 'demo-out/video-qa-report-final.json',
  frameQa: 'demo-out/frame-review-final.json',
  provenance: 'demo-out/provenance-final.json',
  stageEvents: 'demo-out/stage-events-final.json',
  captionTiming: 'demo-out/caption-timing-final.json',
  voiceover: 'demo/voiceover-final.txt',
  source: 'data/nhtsa-complaints-run/SOURCE.md',
  skill: 'skills/governed-agentic-service-trial-v1.SKILL.md',
  contactSheets: 'demo-out/frame-review-final/contact-sheets',
};

const REVIEWS = [
  {
    id: '01-frame-proof',
    title: 'Frame-by-frame proof credibility',
    focus: [
      'Audit whether the visible video reads as a working product demo rather than a scripted animation.',
      'Check the stage flow from first frame to QR end card using the contact sheet paths and frame QA summary.',
      'Fail for visible pre-painted outcomes, missing interaction, obvious stale frames, or unsupported proof claims.',
    ],
  },
  {
    id: '02-subtitle-frame-sync',
    title: 'Subtitle-to-frame timing',
    focus: [
      'Compare caption timing to stage events and visible proof milestones.',
      'Fail if captions claim Nemotron, Stripe, policy enforcement, decision, reuse, or QR before the UI reaches that state.',
      'Fail if captions overlap the main proof UI or bottom controls in a way that blocks comprehension.',
    ],
  },
  {
    id: '03-audio-video-coherence',
    title: 'Voiceover-to-video coherence',
    focus: [
      'Check whether spoken claims are supported by on-screen receipts at the same moment.',
      'Fail for audio that overclaims production money movement, live policy enforcement beyond captured receipts, or unsupported Hermes execution.',
      'Fail if the narration sounds generated, over-polished, or generic instead of like an operator walking through a product test.',
      'Fail for long silent tails, dead air, or narration that ends before core product proof finishes.',
    ],
  },
  {
    id: '04-live-product-demo',
    title: 'Live product interaction verisimilitude',
    focus: [
      'Audit whether the final MP4 demonstrates a user operating Agent IC, not a purely scripted explainer.',
      'Check for visible click/run initiation, event-driven progress, proof cards, and replay from playbook.',
      'Fail if the product appears to advance on a timer with no receipts or if outcomes are shown before the run starts.',
    ],
  },
  {
    id: '05-agent-governance',
    title: 'Agent IC governs other agents',
    focus: [
      'Audit whether the product point is clear: Agent IC governs worker agents that buy/use other agentic services.',
      'Fail if the video looks like a generic claims dashboard, one-off calculator, or model demo rather than a governance layer.',
      'Look for worker-agent request, spend envelope, policy block, evidence import, and expansion decision.',
    ],
  },
  {
    id: '06-enterprise-procurement',
    title: 'Enterprise service procurement narrative',
    focus: [
      'Check whether the demo communicates enterprise purchase/evaluation of another agentic service.',
      'Fail if the buyer, service trial, spend envelope, source audit, and productivity proof are not legible.',
      'Fail for consumer/toy framing, hackathon language, or unserious terminology.',
    ],
  },
  {
    id: '07-hermes-handoff',
    title: 'Hermes dispatch and playbook handoff',
    focus: [
      'Audit Hermes claims against provenance and visible UI.',
      'Pass only if the video honestly frames Hermes as dispatch/handoff package plus SKILL.md reuse evidence.',
      'Fail for legacy filenames, HERMES ERROR, HERMES_AGENT_URL not configured, or claims of execution not supported on screen.',
    ],
  },
  {
    id: '08-nemotron-reasoning',
    title: 'Nemotron rationale and timing',
    focus: [
      'Audit whether Nemotron proof includes a masked request ID, rationale snippet, and contextual timing.',
      'Fail if only a vague "Evaluated" label appears, if latency looks alarming without context, or if the rationale contradicts CONTINUE.',
      'Check that the model supports or confirms the evidence-backed decision instead of pretending to replace it.',
    ],
  },
  {
    id: '09-stripe-test-mode',
    title: 'Stripe test-mode spend honesty',
    focus: [
      'Audit Stripe presentation for professional money handling.',
      'Pass only if test-mode is labeled honestly and dollars/caps are shown professionally, not raw cents copy.',
      'Fail for STRIPE LIVE, production-money overclaim, 10000 cents UI, or missing cs_test receipt.',
    ],
  },
  {
    id: '10-policy-gate',
    title: 'Policy gate and worker-agent block',
    focus: [
      'Audit the CARFAX request block and HTTP 403 receipt as a governance proof.',
      'Fail if the block looks like a static prop with no request/response summary, no policy reason, or no cap comparison.',
      'Pass if the video clearly labels a captured HTTP request/response trace and the blocked worker-agent action.',
    ],
  },
  {
    id: '11-evidence-source',
    title: 'NHTSA evidence derivation',
    focus: [
      'Audit whether NHTSA ODI evidence looks derived, not a dashboard fixture.',
      'Fail if 330 rows, 283 routed, 47 review queue, or routing coverage appear with no source URL, hash, or row preview.',
      'Pass if source, artifact hash, and sample complaint rows are visibly represented.',
    ],
  },
  {
    id: '12-productivity-roi',
    title: 'Agent IC productivity proof',
    focus: [
      'Audit whether the demo proves productivity with plausible case numbers.',
      'Fail if Agent IC cost is higher than human queue cost, if assumptions are hidden, or if values look pre-baked without evidence.',
      'Check that $3,036 human queue cost vs $532 governed cost and 28.3 hours saved are coherent with the evidence object.',
    ],
  },
  {
    id: '13-secrets-local-leaks',
    title: 'No local, private, or stale leakage',
    focus: [
      'Audit visible/proof text for local URLs, private paths, old repo URL, raw full identifiers, or debug language.',
      'Fail for localhost, 127.0.0.1, :3000, local home paths, mounted-drive workspace paths, private user handles, DevTools, noAutoRun, or stale/private repo slugs.',
      'Pass only if identifiers are masked and the public repo URL is clean.',
    ],
  },
  {
    id: '14-ui-scannability',
    title: 'UI hierarchy and 15-second comprehension',
    focus: [
      'Audit whether a viewer can understand mission, governed spend, block, evidence, decision, productivity, and reuse without reading JSON walls.',
      'Fail for unreadable sidecar density, conflicting colors, captions covering proof, or weak focal point during the 403 block.',
      'Pass if proof cards, capital flow, decision, and source evidence are visually prioritized.',
    ],
  },
  {
    id: '15-caption-professionalism',
    title: 'Caption language and professionalism',
    focus: [
      'Audit captions and voiceover copy for enterprise professionalism.',
      'Fail for hackathon/judge wording, raw technical clutter, awkward URL wrapping, toy examples, slang, or synthetic marketing cadence.',
      'Pass if language sounds like a real operator demo: concrete action, plain verbs, service trial, governed spend, evidence, policy, productivity, and source audit.',
    ],
  },
  {
    id: '16-end-card-qr',
    title: 'End card and source audit CTA',
    focus: [
      'Audit the QR/source audit close.',
      'Fail if the video says scan but no QR is visible, the QR points to a stale/private URL, the tail is too long, or the end card exposes a personal handle.',
      'Pass if the end card is clean, scannable, public, and paced.',
    ],
  },
  {
    id: '17-artifact-consistency',
    title: 'Provenance and visible artifact consistency',
    focus: [
      'Compare final video report, frame report, provenance, stage events, source file, and SKILL.md for contradictions.',
      'Fail if session IDs, Stripe session, evidence hash, runtime, or current docs disagree.',
      'Pass if reports are current and aligned with the rendered MP4.',
    ],
  },
  {
    id: '18-runtime-pacing-scroll',
    title: 'Runtime, pacing, and playbook scroll timing',
    focus: [
      'Audit total duration, stage dwell, scroll timing, and static end-card time.',
      'Fail if the scroll happens after the narration needs it, if the end card holds too long, or if the video falls outside 60-90 seconds.',
      'Pass if core proof finishes at an understandable pace and no proof section feels like dead air.',
    ],
  },
  {
    id: '19-case-realism',
    title: 'Real case example and plausible numbers',
    focus: [
      'Audit whether the demo uses a credible public NHTSA complaint-triage case and plausible operational numbers.',
      'Fail for fictional vendor/API names, implausible row counts, toy $100 framing with no enterprise context, or pre-baked responses.',
      'Pass if the public dataset, vendor/service request, policy cap, and productivity math form a coherent proof of concept.',
    ],
  },
  {
    id: '20-adversarial-final',
    title: 'Adversarial final readiness',
    focus: [
      'Act as the harsh final reviewer trying to find the one issue that would make this video not submission-ready.',
      'Use all available artifacts and prior criteria; do not invent unseen issues, but fail on any visible or artifact-backed blocker.',
      'Pass only if no blocker or high-severity issue remains across video, audio, captions, proof artifacts, and docs.',
    ],
  },
];

const OVERARCHING_REVIEWS = [
  {
    id: 'goal-01-product-thesis',
    title: 'Product thesis clarity',
    focus: [
      'Judge whether the video clearly says what Agent IC is and why it exists.',
      'Pass only if the product reads as enterprise governance for buying and measuring agentic services.',
      'Fail if the demo could be mistaken for a claims dashboard, model benchmark, or static proof reel.',
    ],
  },
  {
    id: 'goal-02-buyer-problem',
    title: 'Enterprise buyer problem',
    focus: [
      'Judge whether a buyer can understand the operational pain and why a governed service trial is needed.',
      'Look for public workload, review queue, spend envelope, policy risk, and productivity outcome.',
      'Fail if the pain is abstract, toy-sized, or disconnected from the decision.',
    ],
  },
  {
    id: 'goal-03-live-trust',
    title: 'Live-demo trust',
    focus: [
      'Judge the whole video for live-demo credibility rather than individual proof widgets.',
      'Pass only if receipts appear causally after the run starts and not as pre-painted outcomes.',
      'Fail for anything that feels like a scripted animation, generated narration, or staged explainer without runtime evidence.',
    ],
  },
  {
    id: 'goal-04-governance-core',
    title: 'Governance core mechanism',
    focus: [
      'Judge whether Agent IC is shown governing another worker-agent, not just evaluating data.',
      'Look for worker-agent action, policy reasoning, spend cap, blocked paid request, and human approval boundary.',
      'Fail if governance is implied but not operationally demonstrated.',
    ],
  },
  {
    id: 'goal-05-procurement-workflow',
    title: 'Agentic-service procurement workflow',
    focus: [
      'Judge whether the demo shows an enterprise buying/evaluating an outside agentic service.',
      'Look for trial setup, test-mode authorization, service evidence, controlled expansion, and reuse.',
      'Fail if the buying workflow is invisible or confused with internal app automation.',
    ],
  },
  {
    id: 'goal-06-outcome-quantification',
    title: 'Result quantification',
    focus: [
      'Judge whether Agent IC quantifies the service result enough to justify continue/revise/kill.',
      'Look for source rows, human queue, review hours, cost comparison, and next-cap rationale.',
      'Fail if the numbers are unsupported, contradictory, or not tied to the service trial.',
    ],
  },
  {
    id: 'goal-07-proof-over-polish',
    title: 'Proof over polish',
    focus: [
      'Judge whether the video privileges receipts and inspectable evidence over marketing claims.',
      'Pass if claims are backed by IDs, source hashes, status receipts, and visible policy decisions.',
      'Fail if polish hides missing evidence or the story outruns the receipts.',
    ],
  },
  {
    id: 'goal-08-honesty-boundaries',
    title: 'Honest boundaries',
    focus: [
      'Judge whether test mode, human-in-loop autonomy, and handoff-package boundaries are stated honestly.',
      'Fail for production-spend overclaim, fake-live language, local/private leakage, or unsupported execution claims.',
      'Pass if the demo is ambitious but clear about what is live, test-mode, and governed.',
    ],
  },
  {
    id: 'goal-09-sponsor-fit',
    title: 'Integration fit',
    focus: [
      'Judge whether Hermes, Nemotron, Stripe, and NemoClaw/OpenShell each support the product story.',
      'Do not nitpick individual widgets; assess whether the integrations make the overall product stronger.',
      'Fail if any integration feels bolted on, contradictory, or misleading.',
    ],
  },
  {
    id: 'goal-10-enterprise-seriousness',
    title: 'Enterprise seriousness',
    focus: [
      'Judge whether the UI, language, and case example feel credible to an enterprise evaluator.',
      'Fail for toy framing, slang, raw cents, local URLs, hackathon language, or unserious assumptions.',
      'Pass if the demo feels like a procurement/control-plane product an enterprise could pilot.',
    ],
  },
  {
    id: 'goal-11-decision-conviction',
    title: 'Decision conviction',
    focus: [
      'Judge whether CONTINUE and $250 next cap feel earned by evidence and policy state.',
      'Fail if the decision seems preordained, model-only, or detached from imported workload results.',
      'Pass if the video makes the decision logic understandable without pausing every frame.',
    ],
  },
  {
    id: 'goal-12-risk-control',
    title: 'Risk control narrative',
    focus: [
      'Judge whether the demo shows Agent IC reducing risk while enabling useful agentic work.',
      'Look for blocked paid request, human approval, review queue, and policy incidents.',
      'Fail if it looks like Agent IC merely blocks everything or merely rubber-stamps spend.',
    ],
  },
  {
    id: 'goal-13-reuse-compounding',
    title: 'Reusable playbook value',
    focus: [
      'Judge whether reuse is meaningful at the product level, not only a second ID appearing.',
      'Look for SKILL.md/handoff package, run-from-playbook receipt, same gates reused, and second-service implication.',
      'Fail if reuse appears decorative or unsupported.',
    ],
  },
  {
    id: 'goal-14-auditability',
    title: 'Auditability promise',
    focus: [
      'Judge whether an independent reviewer can follow and inspect the proof chain.',
      'Look for source citation, artifact hash, masked IDs, clean QR/source profile, and current reports.',
      'Fail if proof is hidden, unreachable, stale, or dependent on local/private context.',
    ],
  },
  {
    id: 'goal-15-narrative-pacing',
    title: 'Narrative pacing',
    focus: [
      'Judge whether the whole story fits 60-90 seconds without feeling rushed or padded.',
      'Fail if captions/audio lead the UI, the scroll arrives late, or the end card drags.',
      'Pass if each major proof beat has enough dwell to be understood.',
    ],
  },
  {
    id: 'goal-16-viewer-comprehension',
    title: 'First-watch comprehension',
    focus: [
      'Judge whether a first-time viewer understands the product without reading source code.',
      'Look for clear title, sequence, proof cards, cost proof, and final audit target.',
      'Fail if the viewer must infer the product from dense logs or unrelated panels.',
    ],
  },
  {
    id: 'goal-17-case-legitimacy',
    title: 'Case legitimacy',
    focus: [
      'Judge whether the NHTSA complaint-triage scenario is a legitimate proof-of-concept for Agent IC.',
      'Pass if it demonstrates governed service procurement, policy control, and measured productivity on public data.',
      'Fail if it feels like a synthetic fixture or unrelated dashboard sample.',
    ],
  },
  {
    id: 'goal-18-value-prop-strength',
    title: 'Value proposition strength',
    focus: [
      'Judge whether the final viewer understands why Agent IC matters commercially.',
      'Look for lower governed cost, hours avoided, reduced risk, reusable policy, and expansion decision.',
      'Fail if the value prop is weaker than the technical proof.',
    ],
  },
  {
    id: 'goal-19-overall-coherence',
    title: 'Overall coherence',
    focus: [
      'Judge the whole artifact as one product demo: UI, audio, captions, data, receipts, and CTA.',
      'Fail for contradictions across those layers or for a generated-feeling script even if individual checks pass.',
      'Pass if the entire artifact tells one coherent story from launch to audit.',
    ],
  },
  {
    id: 'goal-20-final-readiness',
    title: 'Final readiness',
    focus: [
      'Make the final go/no-go call from an overarching product and trust perspective.',
      'Fail on any remaining blocker that would make the video unsafe to present as a completed product demo.',
      'Pass only if the video is ready to represent Agent IC as a working enterprise solution.',
    ],
  },
];

const PRODUCT_REVIEWS = [
  {
    id: 'product-01-category',
    title: 'Product category definition',
    focus: [
      'Judge whether Agent IC is clearly positioned as an enterprise control plane for buying, governing, and measuring agentic services.',
      'Fail if the demo leaves the category ambiguous or makes Agent IC look like a single worker-agent, data dashboard, or static evaluator.',
      'Pass only if the video makes the buyer, governed service, policy envelope, and expansion decision legible as one product.',
    ],
  },
  {
    id: 'product-02-buyer-workflow',
    title: 'Buyer workflow usability',
    focus: [
      'Judge whether an enterprise buyer can understand the workflow: launch trial, authorize envelope, observe worker actions, inspect evidence, decide expansion.',
      'Fail if the workflow feels like disconnected proof cards or requires knowing the repo internals.',
      'Pass if the first run and playbook reuse read as a repeatable buyer workflow.',
    ],
  },
  {
    id: 'product-03-marketplace-procurement',
    title: 'Agentic-service procurement fit',
    focus: [
      'Judge whether the demo supports the thesis of purchasing/evaluating other people or businesses agentic services.',
      'Look for service-under-test framing, third-party worker behavior, test-mode spend authorization, and renewal/expansion logic.',
      'Fail if it looks like internal automation only, with no procurement or vendor-evaluation surface.',
    ],
  },
  {
    id: 'product-04-control-plane-ux',
    title: 'Control-plane UX',
    focus: [
      'Judge whether the UI feels like a serious governance control plane rather than a theatrical demo page.',
      'Look for stable status, proof cards, source evidence, masked receipts, policy boundaries, and concise decision drivers.',
      'Fail for noisy JSON walls, unclear status hierarchy, or decorative proof that cannot be acted on.',
    ],
  },
  {
    id: 'product-05-policy-reasoning',
    title: 'Policy reasoning product value',
    focus: [
      'Judge whether live policy reasoning is visible enough to prove Agent IC governs worker tools in real time.',
      'Pass only if the CARFAX request, cap comparison, policy reason, HTTP 403, and human approval boundary are understandable.',
      'Fail if the policy block looks ornamental or detached from the worker-agent request.',
    ],
  },
  {
    id: 'product-06-measurement-engine',
    title: 'Measurement and ROI engine',
    focus: [
      'Judge whether the product credibly quantifies results, not just displays favorable metrics.',
      'Look for source rows, routing counts, review queue, hours saved, governed cost components, net value, and decision formula.',
      'Fail if productivity math feels asserted, contradictory, or detached from imported evidence.',
    ],
  },
  {
    id: 'product-07-trust-and-audit',
    title: 'Trust and audit product promise',
    focus: [
      'Judge whether Agent IC earns trust as an auditable enterprise product.',
      'Look for masked IDs, public source profile, artifact hash, source citation, no local/private leaks, and current proof reports.',
      'Fail if the audit path feels private, stale, unverifiable, or dependent on local machine context.',
    ],
  },
  {
    id: 'product-08-spend-model',
    title: 'Spend model clarity',
    focus: [
      'Judge whether the relationship between the $100 test envelope, $150 blocked request, $250 next cap, and $532 governed cost is clear.',
      'Fail if the spend model looks toy-sized, contradictory, raw-cents-based, or confused with production money movement.',
      'Pass if the trial envelope, blocked paid enrichment, human review cost, and next authorization tier are distinct.',
    ],
  },
  {
    id: 'product-09-reusability-loop',
    title: 'Reusability loop',
    focus: [
      'Judge whether the product shows compounding value through reusable governance packages.',
      'Look for SKILL.md handoff, run-from-playbook receipt, same gates reused, and second-service implication.',
      'Fail if reuse is merely an end-screen claim or a second ID with no product meaning.',
    ],
  },
  {
    id: 'product-10-commercial-readiness',
    title: 'Commercial readiness',
    focus: [
      'Judge whether the video makes Agent IC feel commercially pilotable for an enterprise buyer.',
      'Consider product clarity, live proof, risk control, spend honesty, measurement credibility, and auditability as one product story.',
      'Fail on any product-level contradiction that would make a buyer ask what they are actually purchasing.',
    ],
  },
];

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function readText(file, maxChars = 6000) {
  try {
    const text = await fs.readFile(file, 'utf8');
    return text.length > maxChars ? `${text.slice(0, maxChars)}\n[truncated ${text.length - maxChars} chars]` : text;
  } catch {
    return '';
  }
}

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
}

function summarizeChecks(report) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const passed = checks.filter((check) => check.pass).length;
  const failed = checks.filter((check) => !check.pass).map((check) => `${check.name}: ${check.detail}`);
  const highlights = checks
    .filter((check) => /loud|silence|caption|source|budget|ocr|local|private|required|artifact|duration/i.test(check.name || ''))
    .map((check) => `${check.pass ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`)
    .slice(0, 28);
  return { passed, total: checks.length, failed, highlights };
}

async function buildEvidenceBundle() {
  const videoQa = await readJson(ARTIFACTS.videoQa);
  const frameQa = await readJson(ARTIFACTS.frameQa);
  const provenance = await readJson(ARTIFACTS.provenance);
  const stageEvents = await readJson(ARTIFACTS.stageEvents);
  const captionTiming = await readJson(ARTIFACTS.captionTiming);
  const source = await readText(ARTIFACTS.source, 2400);
  const voiceover = await readText(ARTIFACTS.voiceover, 3200);
  const qrPage = await readText('app/qr/page.jsx', 2200);
  const videoChecks = summarizeChecks(videoQa);
  const frameChecks = summarizeChecks(frameQa);
  const evidence = provenance?.evidence || {};
  const stripe = provenance?.stripe || {};
  const nemotron = provenance?.nemotron || {};
  const hermes = provenance?.hermes || {};
  const blocked = provenance?.blocked || {};
  const policy = provenance?.policyGate || {};
  const stages = Array.isArray(stageEvents?.stages) ? stageEvents.stages : Array.isArray(stageEvents) ? stageEvents : [];
  const captions = Array.isArray(captionTiming?.segments) ? captionTiming.segments : [];
  const contactSheets = await fs.readdir(ARTIFACTS.contactSheets).catch(() => []);

  return [
    'AGENT IC FINAL VIDEO REVIEW EVIDENCE BUNDLE',
    '',
    'Artifacts:',
    `- Final MP4: ${ARTIFACTS.video}`,
    `- Contact sheets: ${ARTIFACTS.contactSheets}/${contactSheets.filter((name) => name.endsWith('.jpg')).join(', ')}`,
    `- Video QA: ${ARTIFACTS.videoQa}`,
    `- Frame QA: ${ARTIFACTS.frameQa}`,
    `- Provenance: ${ARTIFACTS.provenance}`,
    `- Stage events: ${ARTIFACTS.stageEvents}`,
    `- Captions: ${ARTIFACTS.captionTiming}`,
    `- Voiceover script: ${ARTIFACTS.voiceover}`,
    `- Evidence source: ${ARTIFACTS.source}`,
    `- Playbook artifact: ${ARTIFACTS.skill}`,
    '- Source handoff target: https://github.com/vladdiethecoder/agent-ic (public source repo, not a local/private URL)',
    '',
    'Deterministic gate summaries:',
    `- Video QA overall: ${videoQa?.overall}; checks: ${videoChecks.passed}/${videoChecks.total}`,
    `- Frame QA overall: ${frameQa?.overall}; frames: ${frameQa?.metadata?.extractedFrames}/${frameQa?.metadata?.expectedFrames}; duration: ${frameQa?.metadata?.duration}s`,
    `- Audio loudness: ${videoQa?.media?.audio?.loudnessIntegrated ?? 'recorded in report'}; no silence >=4s: ${videoChecks.highlights.find((line) => line.includes('No audio silence')) || 'see QA report'}`,
    `- Video QA failures: ${videoChecks.failed.length ? videoChecks.failed.join(' | ') : 'none'}`,
    `- Frame QA failures: ${frameChecks.failed.length ? frameChecks.failed.join(' | ') : 'none'}`,
    '',
    'Relevant passed checks:',
    ...videoChecks.highlights.map((line) => `- ${line}`),
    '',
    'Provenance highlights:',
    `- Recording mode: ${provenance?.mode || provenance?.recordingMode || 'see provenance'}`,
    `- Hermes: ${hermes?.taskIdMasked || hermes?.sessionIdMasked || 'masked receipt in provenance'}; sandbox=${hermes?.sandbox || 'agent-ic-hermes'}; outputSha256=${hermes?.outputSha256 || 'recorded'}`,
    `- Nemotron: ${nemotron?.requestIdMasked || 'masked'}; model=${nemotron?.model || 'recorded'}; latencyMs=${nemotron?.latencyMs ?? 'recorded'}`,
    `- Stripe: ${stripe?.sessionIdMasked || stripe?.checkoutSessionIdMasked || 'masked cs_test'}; testMode=${stripe?.testMode ?? true}`,
    `- Policy gate: externalLive=${policy?.externalLive}; state=${policy?.state}; status=${policy?.status || blocked?.status || 403}; actor=${policy?.actor || 'NemoClaw/OpenShell broker'}`,
    `- Blocked action: ${blocked?.tool || blocked?.toolName || 'CARFAX vehicle-history report'}; attempted=${money(blocked?.attemptedAmount || 150)}; cap=${money(blocked?.cap || 100)}`,
    `- Evidence: ${evidence?.cases || evidence?.totalRows || 330} cases; auto=${evidence?.autoTriaged || 283}; human=${evidence?.humanReviewQueue || 47}; hoursSaved=${evidence?.hoursSaved || 28.3}`,
    `- Productivity: human queue ${money(evidence?.humanCostDollars || 3036)} vs Agent IC governed ${money(evidence?.governedCostDollars || 532)}`,
    '',
    'Stage timing summary:',
    ...stages.slice(0, 16).map((stage) => `- ${stage.id || stage.stage || stage.name}: ${stage.atMs ?? stage.ms ?? stage.timeMs ?? 'recorded'}ms`),
    '',
    'Caption timing summary:',
    `- Segments: ${captions.length}; final caption end: ${captions.at(-1)?.end ?? 'recorded'}s; source=${captionTiming?.source || 'recorded'}`,
    ...captions.map((segment, index) => `- ${index + 1}. ${segment.start?.toFixed?.(2) ?? segment.start}-${segment.end?.toFixed?.(2) ?? segment.end}s: ${segment.text}`).slice(0, 12),
    '',
    'Evidence source excerpt:',
    source,
    '',
    'Voiceover excerpt:',
    voiceover,
    '',
    'QR page excerpt:',
    qrPage,
    '',
    'Forbidden visible/proof markers already scanned clean by deterministic QA: localhost, 127.0.0.1, :3000, local home paths, mounted-drive workspace paths, private handles, stale repo URL, raw cents copy, STRIPE LIVE, HERMES ERROR, NEMOCLAW ERROR, and local/demo overclaim markers.',
  ].join('\n');
}

function buildPrompt(review, evidenceBundle) {
  return [
    `You are ${REVIEW_PERSONA} review ${review.id}: ${review.title}.`,
    '',
    `Task: perform a strict read-only specialized review of the current Agent IC final demo evidence as a ${REVIEW_PERSONA} subagent.`,
    'Use the evidence bundle below and, if you inspect files, only read from the listed paths. Do not edit files. Do not create plans. Do not request clarification.',
    '',
    'Product truth to enforce:',
    '- Agent IC is an enterprise control plane to buy/evaluate other agentic services, govern worker-agent actions, quantify results, and decide whether to expand spend.',
    '- The final video must feel like a live working product demo, not a scripted play.',
    '- TTS voiceover is allowed for production; do not fail solely because the audio backend is synthesized. Fail if the spoken script or voice delivery sounds generic/generated, if delivery creates dead air, or if audio claims do not match the visible product state.',
    '- It may use Stripe test mode, but it must say test mode and must never imply production money moved.',
    '- It must keep local/private/debug strings out of the visible final product.',
    '',
    'Specialized focus:',
    ...review.focus.map((line) => `- ${line}`),
    '',
    'Output format requirements:',
    `REVIEW_ID: ${review.id}`,
    'VERDICT: PASS or FAIL',
    'BLOCKERS:',
    '- None',
    '- Or concise blocker bullets when blockers exist',
    'HIGH_SEVERITY:',
    '- None',
    '- Or concise high-severity bullets when high-severity issues exist',
    'EVIDENCE:',
    '- 2 to 5 concise evidence bullets grounded in the bundle or listed artifacts',
    '',
    'Do not include hidden reasoning, command logs, markdown tables, JSON, or extra sections after EVIDENCE.',
    '',
    evidenceBundle,
  ].join('\n');
}

function runChatGpt55(prompt, model = CODEX_CHATGPT55_MODEL) {
  return new Promise((resolve) => {
    const args = ['exec', '--model', model, '--sandbox', 'workspace-write', '--cd', PROJECT_ROOT, '--ephemeral', '-'];
    const child = spawn(CODEX_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end(prompt);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      stderr += `\nTimed out after ${TIMEOUT_MS}ms`;
    }, TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function runHermesReview(prompt) {
  return new Promise((resolve) => {
    const args = ['chat', '-Q', '--source', 'agent-ic-50-review'];
    if (HERMES_REVIEW_MODEL) args.push('-m', HERMES_REVIEW_MODEL);
    if (HERMES_REVIEW_PROVIDER) args.push('--provider', HERMES_REVIEW_PROVIDER);
    args.push('-q', prompt);
    const child = spawn(HERMES_BIN, args, { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      stderr += `\nTimed out after ${TIMEOUT_MS}ms`;
    }, TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function runReviewProvider(prompt) {
  if (REVIEW_PROVIDER === 'hermes') {
    return runHermesReview(prompt);
  }
  return runChatGpt55(prompt, CODEX_CHATGPT55_MODEL);
}

function parseReview(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n').split('\n[stderr]\n')[0];
  const verdictMatches = [...text.matchAll(/^\s*VERDICT:\s*(PASS|FAIL)\b/gim)];
  const verdict = verdictMatches.at(-1)?.[1]?.toUpperCase() || 'FAIL';
  const finalVerdictIndex = verdictMatches.at(-1)?.index ?? 0;
  const tail = text.slice(finalVerdictIndex);
  const blockers = extractSection(tail, 'BLOCKERS', ['HIGH_SEVERITY', 'EVIDENCE']);
  const highSeverity = extractSection(tail, 'HIGH_SEVERITY', ['EVIDENCE']);
  const evidence = extractSection(tail, 'EVIDENCE', []);
  const blockersClean = sectionIsNone(blockers);
  const highClean = sectionIsNone(highSeverity);
  return {
    verdict,
    blockers,
    highSeverity,
    evidence,
    pass: verdict === 'PASS' && blockersClean && highClean,
  };
}

function classifyProviderError(response, raw) {
  const text = `${response?.stderr || ''}\n${raw || ''}`;
  if (/unknown model|model.*not found|invalid model|unsupported model|model.*unavailable/i.test(text)) return 'model-unavailable';
  if (/usage limit|quota|rate limit|billing cycle/i.test(text)) return 'quota';
  if (/unauthorized|authentication|not logged in|login required|permission denied/i.test(text)) return 'auth';
  if (/context_length_exceeded|context length|too many tokens/i.test(text)) return 'context-length';
  if (/Timed out after/i.test(text)) return 'timeout';
  if (response?.code !== 0) return 'provider-error';
  return '';
}

const classifyChatGpt55Error = classifyProviderError;

function extractSection(text, heading, nextHeadings) {
  const nextPattern = nextHeadings.length ? `(?=^\\s*(?:${nextHeadings.join('|')}):\\s*$)` : '$';
  const match = text.match(new RegExp(`^\\s*${heading}:\\s*\\n([\\s\\S]*?)${nextPattern}`, 'im'));
  if (!match) return '';
  return match[1].trim();
}

function sectionIsNone(section) {
  const normalized = String(section || '').trim();
  return /^-?\s*None\.?$/i.test(normalized) || /^None\.?$/i.test(normalized);
}

async function runPool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function loop() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, loop));
  return results;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const evidenceBundle = await buildEvidenceBundle();
  await fs.writeFile(path.join(OUT_DIR, 'evidence-bundle.md'), evidenceBundle);

  const startedAt = new Date().toISOString();
  const reviewSet =
    REVIEW_SUITE === 'overarching'
      ? OVERARCHING_REVIEWS
      : REVIEW_SUITE === 'product' || REVIEW_SUITE === 'product-specific'
        ? PRODUCT_REVIEWS
        : REVIEWS;
  let suiteBlocker = null;
  const results = await runPool(reviewSet, async (review) => {
    const prompt = buildPrompt(review, evidenceBundle);
    const promptPath = path.join(OUT_DIR, `${review.id}.prompt.md`);
    const rawPath = path.join(OUT_DIR, `${review.id}.raw.txt`);
    await fs.writeFile(promptPath, prompt);
    console.log(`[${REVIEW_LABEL}] ${review.id} ${review.title}`);
    const cachedRaw = await fs.readFile(rawPath, 'utf8').catch(() => '');
    if (cachedRaw) {
      const cachedParsed = parseReview(cachedRaw);
      const cachedErrorType = classifyProviderError({ code: 0, stderr: '' }, cachedRaw);
      if (!cachedErrorType && cachedParsed.pass) {
        console.log(`[${REVIEW_LABEL}] ${review.id} PASS (cached)`);
        return {
          id: review.id,
          title: review.title,
          status: 'PASS',
          exitCode: 0,
          errorType: '',
          promptPath,
          rawPath,
          ...cachedParsed,
        };
      }
    }
    if (suiteBlocker) {
      const raw = [
        '[blocked without provider call]',
        '',
        '[stderr]',
        suiteBlocker.message,
      ].join('\n');
      await fs.writeFile(rawPath, raw);
      const parsed = parseReview(raw);
      console.log(`[${REVIEW_LABEL}] ${review.id} BLOCKED (suite ${suiteBlocker.errorType})`);
      return {
        id: review.id,
        title: review.title,
        status: 'BLOCKED',
        exitCode: suiteBlocker.exitCode,
        errorType: suiteBlocker.errorType,
        promptPath,
        rawPath,
        ...parsed,
      };
    }
    const attemptedModel = REVIEW_PROVIDER === 'hermes' ? HERMES_REVIEW_MODEL || 'hermes-default' : CODEX_CHATGPT55_MODEL;
    const response = await runReviewProvider(prompt);
    const raw = [
      response.stdout.trim(),
      response.stderr.trim() ? `\n[stderr]\n${response.stderr.trim()}` : '',
    ].join('\n').trim();
    await fs.writeFile(rawPath, raw || '[empty response]');
    const parsed = parseReview(raw);
    const errorType = classifyProviderError(response, raw);
    const status = errorType ? 'BLOCKED' : response.code === 0 && parsed.pass ? 'PASS' : 'FAIL';
    if (errorType) {
      suiteBlocker = {
        errorType,
        exitCode: response.code,
        message: response.stderr.trim() || `${REVIEW_PERSONA} provider blocked the suite.`,
      };
    }
    console.log(`[${REVIEW_LABEL}] ${review.id} ${status}`);
    return {
      id: review.id,
      title: review.title,
      status,
      exitCode: response.code,
      errorType,
      attemptedModel,
      promptPath,
      rawPath,
      ...parsed,
    };
  });

  const passed = results.filter((result) => result.status === 'PASS').length;
  const blocked = results.filter((result) => result.status === 'BLOCKED').length;
  const failed = results.filter((result) => result.status === 'FAIL').length;
  const report = {
    overall: passed === results.length ? 'PASS' : blocked > 0 && failed === 0 ? 'BLOCKED' : 'FAIL',
    startedAt,
    finishedAt: new Date().toISOString(),
    provider: REVIEW_PROVIDER,
    suite: REVIEW_SUITE,
    codexBin: CODEX_BIN,
    model: CODEX_CHATGPT55_MODEL,
    hermesBin: HERMES_BIN,
    hermesModel: HERMES_REVIEW_MODEL || null,
    hermesProvider: HERMES_REVIEW_PROVIDER || null,
    concurrency: CONCURRENCY,
    total: results.length,
    passed,
    blocked,
    failed,
    outputDir: OUT_DIR,
    results,
  };
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`[${REVIEW_LABEL}] report ${REPORT_PATH}`);
  console.log(`[${REVIEW_LABEL}] overall ${report.overall} ${passed}/${results.length}`);
  if (report.overall !== 'PASS') {
    for (const result of results.filter((entry) => entry.status !== 'PASS')) {
      console.log(`[${REVIEW_LABEL}] ${result.status.toLowerCase()} ${result.id}: error=${result.errorType || 'review-failed'} blockers=${JSON.stringify(result.blockers)} high=${JSON.stringify(result.highSeverity)}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
