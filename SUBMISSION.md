# Submission Notes

Final artifact: `demo-out/agent-ic-demo-final-winning-v3.mp4`

SHA-256: `5da9da4f9b200fe4f304698d8325d225f5965119d5e98c9682c3c82e0fa14726`

## One-Line Pitch

Agent IC helps CFOs and enterprise operators fund the right AI pilots, stop the wrong ones, and prove every dollar with evidence.

## Core Thesis

Enterprises do not need another isolated AI agent — they need a governed function that decides which agents deserve budget, tools, and production access. Agent IC is that function.

## What The Demo Shows

1. A buyer submits a business problem (evaluate RouteGuard AI for complaint triage before signing a $14,400 contract)
2. Agent IC generates a governed trial plan with a $100 Stripe test-mode Checkout envelope
3. The vendor service processes 330 public NHTSA ODI complaints with Nemotron classification
4. The OpenShell/policy gate blocks a $150 CARFAX enrichment attempt — spend cap exceeded, `403` recorded
5. Enterprise metrics computed: $2,504 net value, 5% waste, 4x risk-adjusted ROI, 7x throughput
6. Vendor claims validated against measured results (85% claimed, 91.2% measured)
7. Procurement decision: CONTINUE — the service generates more than twice its annual cost in value
8. Renewal ledger shows accumulated evidence across monthly cycles

## Sponsor Integrations

- NVIDIA Nemotron (NIM): classification + procurement decision synthesis
- NVIDIA OpenShell: agent sandbox policy enforcement (blocked action)
- Stripe: Checkout Sessions for governed spend envelopes
- Hermes Agent: live NemoHermes sandbox execution receipt plus governed playbook generation and governed trial workflow.

## Submission Checklist

- [x] `npm test` — Node test suite passes
- [x] `npm run build` — passes
- [x] `npm run smoke` — passes
- [x] `npm run release:check` — passes
- [x] `npm run submission:preflight` — passes against the v3 video, stable sidecar, QA reports, tweet copy, and public docs
- [x] `npm run judge:check` — passes from a clean public clone without private video artifacts
- [x] `/api/proof-report` — masked judge audit surface
- [x] Record browser-chrome demo video from `/trial`
- [x] Run image/video-analysis QA: `demo-out/video-qa-report-winning-v3.json` and `demo-out/frame-review-winning-v3.json`
- [x] Prepare stripped public repo export: `.agent-ic/agent-ic-public-submission.tar.gz`
- [x] Add machine-readable judge proof map: `SUBMISSION_MANIFEST.json`
- [x] Push stripped public repo to `https://github.com/vladdiethecoder/agent-ic`
- [x] Confirm v3 video has no QR end card; public repo is carried in tweet copy and judge docs
- [ ] Tweet demo video tagging @NousResearch
- [ ] Drop tweet link in Discord submissions channel: `https://discord.gg/nousresearch/PFbQZMesC`
- [ ] Complete Typeform submission: `https://form.typeform.com/to/hpEifIK4`

## Submission Steps

1. Tweet a 1-3 minute demo video tagging @NousResearch with a short writeup and the public repo link: `https://github.com/vladdiethecoder/agent-ic`
2. Drop the tweet link in the submissions channel via Discord: `https://discord.gg/nousresearch/PFbQZMesC`
3. Complete the official submission form on Typeform: `https://form.typeform.com/to/hpEifIK4`

## Final Preflight Command

Run this immediately before posting:

```bash
npm run submission:preflight
npm run judge:check
npm run public:export
```

The preflight verifies the primary video hash, duration, codecs, v3 sidecar, video/frame QA reports, live proof receipts, tweet length, Typeform copy, stale artifact references, and public-doc secret patterns. The export command writes `.agent-ic/public-submission-export/agent-ic` and `.agent-ic/agent-ic-public-submission.tar.gz`, excluding local credentials, generated videos/frames, browser profiles, and local state.

## Current Hackathon Requirements

Source checked June 25, 2026: Hermes Agent Accelerated Business Hackathon, presented by NVIDIA, Stripe, and Nous Research (`https://x.com/NousResearch/status/2069150335386456283`, mirrored at `https://digg.com/tech/hz8d871s`).

- Required public artifact: tweet a 1-3 minute demo video tagging `@NousResearch` with a short writeup.
- Required follow-through: drop the tweet link in the Discord submissions channel and fill out the Typeform.
- Discord submission invite: `https://discord.gg/nousresearch/PFbQZMesC`
- Typeform: `https://form.typeform.com/to/hpEifIK4`
- Judging criteria: usefulness, viability, and presentation.
- Deadline: EOD Tuesday, June 30, 2026.

## Judge-Facing Tweet Copy

```text
Agent IC is an investment committee for enterprise AI agents: fund a bounded Stripe test-mode trial, run real NHTSA work, block unsafe spend/tool calls, and decide continue/revise/kill with Nemotron + NemoHermes receipts. @NousResearch
https://github.com/vladdiethecoder/agent-ic
```

Use the v3 MP4 as the attached demo video: `demo-out/agent-ic-demo-final-winning-v3.mp4`.

## Typeform Copy

Project name:

```text
Agent IC
```

Short description:

```text
Agent IC is an enterprise procurement control plane for agentic services. It funds bounded vendor-agent trials, governs tools and spend, blocks unsafe actions, measures real outcomes on public data, validates vendor claims, and produces an evidence-backed continue/revise/kill decision before an enterprise expands access or signs a contract.
```

What it does:

```text
The demo evaluates RouteGuard AI before a buyer signs a $14,400 contract. Agent IC creates a $100 Stripe test-mode spend envelope, runs 330 public NHTSA ODI complaint rows through a governed worker, uses Nemotron for classification and procurement synthesis, blocks a $150 CARFAX enrichment attempt with a policy-gate 403, records a live NemoHermes sandbox receipt, and stores renewal evidence so the decision can repeat monthly.
```

Why it is useful:

```text
Enterprises are buying agentic services faster than finance, security, and operations teams can govern them. Agent IC gives those teams a practical control plane: each vendor agent earns budget, tools, and production access only after measurable evidence proves value and policy compliance.
```

Why it is viable:

```text
The prototype is a working Next.js control plane with live-proof gates. The current submission cut has passing video QA, 183 passing tests, production build, API/browser smoke, release check, masked proof report, test-mode Stripe receipt, Nemotron request evidence, OpenShell/policy block receipt, public workload hash, and live NemoHermes sandbox execution receipt. Production gaps are documented separately and not overstated.
```

Integrations used:

```text
Hermes Agent/NemoHermes for governed playbook execution receipts, NVIDIA Nemotron for classification and procurement synthesis, Stripe test-mode Checkout Sessions for bounded spend envelopes, OpenShell/policy gate for tool/spend enforcement, and public NHTSA ODI data for inspectable workload evidence.
```

## Judging Alignment

Usefulness:

- Solves a visible enterprise pain: deciding which vendor agents deserve budget, tools, and access.
- Shows a concrete buyer workflow rather than a generic agent demo.
- Produces CFO/security-friendly evidence: spend cap, blocked action, ROI, claim validation, and renewal trail.

Viability:

- Uses real public workload data and named formulas.
- Keeps Stripe wording honest as test mode.
- Carries live receipts for Nemotron and NemoHermes, plus deterministic policy-block evidence.
- Includes production-readiness boundaries instead of claiming a finished enterprise deployment.

Presentation:

- Primary demo is 114.84 seconds, inside the 1-3 minute window.
- Browser chrome and clean product host are visible.
- Video QA is image/video-analysis based, with OCR diagnostic-only.
- Contact sheets and full-frame inspection show the proof arc is nonblank, varied, and readable.
