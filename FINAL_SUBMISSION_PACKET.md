# Agent IC Final Submission Packet

## One-Line Pitch

Agent IC helps enterprise buyers fund the right AI pilots, stop the wrong ones, and prove every dollar with evidence before expanding vendor-agent access.

## Category-Defining Thesis

Enterprises do not need another isolated AI agent. They need a governed investment committee for agentic services: a control plane that decides which agents deserve budget, tools, and production access.

## Primary Demo Route

- Product route: `/trial`
- Judge audit route: `/api/proof-report`
- Primary workload: `data/nhtsa-complaints-run/complaints.json`
- Workload evidence: 330 NHTSA ODI complaint rows, SHA-256 surfaced by `/api/proof-report`

## What Judges Should See In The Primary 1-3 Minute Video

1. A buyer evaluates RouteGuard AI before signing a vendor contract.
2. Agent IC creates a $100 Stripe test-mode spend envelope.
3. The governed worker processes 330 public NHTSA complaint rows.
4. Nemotron classifies a sample and the worker pattern-extends the rest with method counts shown honestly.
5. The worker attempts a $150 paid enrichment action.
6. OpenShell or the local deny-by-default policy gate blocks it with HTTP `403`.
7. Agent IC computes procurement metrics, validates vendor claims, and issues `CONTINUE`, `REVISE`, or `KILL`.
8. A live NemoHermes sandbox receipt, governed playbook, and renewal ledger show how the evaluation can repeat monthly.

## Live Judging Criteria Alignment

The current hackathon entry requirements were checked on June 25, 2026 (`https://x.com/NousResearch/status/2066921443548348436`, mirrored at `https://digg.com/tech/hz8d871s`): tweet a 1-3 minute demo video tagging `@NousResearch`, drop the link in the Discord submissions channel (`https://discord.gg/nousresearch/PFbQZMesC`), complete the Typeform (`https://form.typeform.com/to/hpEifIK4`), and optimize for usefulness, viability, and presentation.

Public code repo for the X post: `https://github.com/vladdiethecoder/agent-ic`.

- Usefulness: Agent IC governs an enterprise buying decision for vendor agents, not a toy workflow. The demo shows budget, tool access, policy enforcement, measurable ROI, claim validation, and renewal evidence.
- Viability: The submission carries live Nemotron/NemoHermes receipts, Stripe test-mode evidence, public NHTSA workload hashes, policy-block receipts, a passing release gate, and honest production-readiness boundaries.
- Presentation: The v3 cut fits the 1-3 minute window, uses a clean browser surface, shows the proof arc in-frame, and passes deterministic video/frame QA using image and video analysis tools.

## Production-readiness note

The hackathon submission should describe Agent IC as an enterprise-grade prototype/control-plane framework. Current P1 safety controls are implemented, but the product must not be marketed as fully production-ready until auth/SSO, tenant isolation, durable storage, tamper-evident audit, approval workflows, observability, and deployment operations are complete.

## Honest Provider Claims

- Stripe: test-mode Checkout Session only unless production money movement is separately proven.
- Nemotron: live when request IDs are present from the current run; otherwise strict live-proof claims must fail closed.
- OpenShell: external sandbox proof only when the run records an OpenShell/sandbox receipt; otherwise label the enforcement as policy-gate proof.
- Hermes: claimed as live only with gateway/sandbox task receipts; otherwise present the generated playbook as a Hermes-compatible handoff artifact.

## Required Verification Before Submission

```bash
npm test
npm run build
# with the app running:
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:api
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:browser
# primary v3 submission video
npm run demo:qa:v18
npm run demo:frame-qa:v18
npm run submission:preflight
npm run judge:check
npm run public:export
# optional supporting strict-proof walkthrough
npm run demo:qa
AGENT_IC_DEMO_VIDEO=demo-out/agent-ic-demo-final-winning.mp4 AGENT_IC_FRAME_REVIEW_DIR=demo-out/frame-review-winning AGENT_IC_FRAME_REVIEW_REPORT=demo-out/frame-review-winning.json npm run demo:frame-qa
```


## Final Winning Video

- Primary submission video: `demo-out/agent-ic-demo-final-winning-v3.mp4`
- SHA-256: `5da9da4f9b200fe4f304698d8325d225f5965119d5e98c9682c3c82e0fa14726`
- Duration: 114.84 seconds
- Resolution: 1920x1080
- Video/audio: H.264 + AAC, audio normalized to `-16.5 LUFS`
- Final account posting packet: `POSTING_PACKET.md` with exact X copy, X alt text, Discord copy, and Typeform answers.
- Optional X custom cover: `demo-out/agent-ic-x-cover-proof.jpg`, extracted from 99.3 seconds to show the continue decision, metrics, and policy block. SHA-256: `d54a90f93ae9e11330cb0087df4633e70dbf284e32f6ed1e03c5b2fea0d48be1`.
- The v3 cut preserves headed-browser chrome and a clean visible product host (`app.agenticontrolplane.com`, initially `/trial`; later in-page navigation may show `#trial`) while showing the actual `/trial` proof arc: typed buyer mission -> governed run -> NHTSA progress counters -> Stripe $100 test-mode envelope -> Nemotron sample classification -> OpenShell policy block of a $150 CARFAX request -> live NemoHermes sandbox receipt -> CONTINUE decision -> evidence formulas -> renewal ledger.
- Video QA: `demo-out/video-qa-report-winning-v3.json` - PASS, 65/65 checks using `ffprobe`/`ffmpeg` video analysis plus ImageMagick contact-sheet and frame-difference analysis. SHA-256: `1007217f8a8c045d20974e157e62ecfa7659dcda976b704189f4c43d481eb61a`. OCR is skipped by default and recorded only as a diagnostic when explicitly enabled.
- Frame QA: `demo-out/frame-review-winning-v3.json` - PASS, 16/16 checks, 2871/2871 frames extracted, no black-frame intervals, 12 contact sheets generated, 24/24 sampled frame hashes unique, 23/23 sampled frame transitions with meaningful image differences. SHA-256: `95a7a4e6257c7a05f17fbf19854095a426a604a674d7ba7548c4d2e2c54a862f`.
- Contact sheets: `demo-out/video-qa-contact-sheet-winning-v3.jpg` and `demo-out/frame-review-winning-v3/contact-sheets/`
- Supporting strict-proof walkthrough: `demo-out/agent-ic-demo-final-winning.mp4` remains available at 89.00 seconds with strict sidecar evidence in `demo-out/stage-events-final.json`, but it is no longer the primary judge-facing cut.

### Honesty note
- Treat the v3 MP4 as the primary browser-chrome product demo. Its stable sidecar (`demo-out/stage-events-winning-v3.json`) records live Nemotron, Stripe test-mode, OpenShell availability/policy block, public NHTSA workload evidence, and a live NemoHermes sandbox execution receipt. `demo-out/stage-events-v18-latest-attempt.json` is retained only as a later non-promoted recording attempt.
- The v3 sidecar records `skillSource: nemohermes-sandbox`, sandbox `agent-ic-hermes`, masked session id `20260625_032…9172`, and output SHA-256 `52919f00f4a99d7e2db94864649c1b6a1817f41b97bcc4096f1b272c960d8d2a`.
- Submission copy should keep the exact language used in this packet: Stripe test-mode Checkout Session, public NHTSA snapshot, OpenShell policy block, and live NemoHermes sandbox execution receipt.

## Latest Local Evidence

- `npm run lint`: passing.
- `npm test`: 183/183 passing.
- `npm run build`: production build passing.
- `AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke`: passing when run against the local Next server, with Nemotron, Stripe, OpenShell, evidence storage, and renewal relationships verified.
- `AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:api`: passing contract/edge checks, including OpenAPI, version headers, proof report, audit chain, evidence export, readiness, CORS, and security headers.
- `AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:browser`: passing with Chrome artifacts under `.agent-ic/qa/`.
- `npm run release:check`: passing, including OpenAPI, migrations, build, production-readiness, security scan, dependency audit, container preflight, and release manifest.
- Browser proof artifacts: `.agent-ic/qa/trial-top-fold.png`, `.agent-ic/qa/trial-full-page.png`, `.agent-ic/qa/trial-mobile.png`, `.agent-ic/qa/admin-top-fold.png`.
- `npm run demo:qa:v18`: passing against `demo-out/agent-ic-demo-final-winning-v3.mp4`, 65/65 image/video-analysis checks.
- `npm run demo:frame-qa:v18`: passing, 2871/2871 frames extracted and 12 contact sheets generated.
- `npm run submission:preflight`: passing against the v3 video, stable sidecar, QA reports, tweet copy, Typeform copy, and public-doc stale/secret scans.
- `npm run judge:check`: passing from a clean public clone without private video artifacts; composes tests, build, proof-map checks, export-policy checks, and public-doc stale/secret scans.
- `npm run public:export`: passing, wrote `.agent-ic/agent-ic-public-submission.tar.gz` and `.agent-ic/public-submission-export-manifest.json` without `.env.local`, `demo-out`, `.agent-ic`, `.git`, or `node_modules`.
- Public repo: `https://github.com/vladdiethecoder/agent-ic`, populated from the stripped public export only.
- Machine-readable judge proof map: `SUBMISSION_MANIFEST.json`.
- Manual image review with full-resolution frames confirms the visible address bar uses the clean product host `app.agenticontrolplane.com` rather than localhost, ports, private workspace paths, or DevTools. The stable v3 sidecar records `browserUrl: http://app.agenticontrolplane.com/trial`.

Refresh this packet after a final recording pass if the video, route, or proof artifacts change.
