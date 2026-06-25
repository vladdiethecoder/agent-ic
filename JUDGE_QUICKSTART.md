# Agent IC Judge Quickstart

Agent IC is an enterprise procurement control plane for agentic services. It funds bounded vendor-agent trials, governs tools and spend, blocks unsafe actions, measures real outcomes, validates vendor claims, and produces an evidence-backed continue/revise/kill decision before an enterprise expands access or signs a contract.

Public repo: `https://github.com/vladdiethecoder/agent-ic`

For the shortest criteria-by-criteria read, start with `JUDGE_SCORECARD.md`.

## Watch First

Primary submission video:

- `demo-out/agent-ic-demo-final-winning-v3.mp4`
- SHA-256: `5da9da4f9b200fe4f304698d8325d225f5965119d5e98c9682c3c82e0fa14726`
- Runtime: 114.84 seconds
- Format: 1920x1080 H.264/AAC
- Final posting packet: `POSTING_PACKET.md`
- Optional X custom cover: `demo-out/agent-ic-x-cover-proof.jpg`

The public GitHub repo intentionally does not include generated videos, frame dumps, local browser profiles, or `.env.local`. The video should be attached to the X submission post; the repo contains the app, source, data snapshot, tests, proof docs, and validators.

## What The Demo Proves

- Stripe test-mode Checkout Session creates a bounded $100 spend envelope.
- A governed worker processes 330 public NHTSA ODI complaint rows.
- Nemotron classifies a sample and records a live request id.
- The policy gate blocks a $150 CARFAX enrichment attempt with HTTP `403`.
- Agent IC computes ROI, waste, claim validation, and a procurement verdict.
- A live NemoHermes sandbox receipt and governed playbook are recorded.
- The renewal ledger shows evidence carrying across monthly decisions.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/trial`.

The workspace path used for the private build contains `#`, so all Next.js scripts go through `scripts/safe-next.mjs` and mirror to `/tmp/agent-ic-*` when needed.

## Verify

Core gates:

```bash
npm test
npm run build
npm run judge:check
npm run release:check
```

`npm run judge:check` is safe to run from a clean public clone. It runs tests, builds the app, verifies `SUBMISSION_MANIFEST.json`, confirms generated video artifacts are intentionally excluded from Git, and checks the public docs for stale/private URLs and secret-shaped strings. The private video QA gates below require the local MP4 artifacts.

Live smoke gates require the app to be running:

```bash
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:api
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:browser
```

Submission/video gates in the private workspace:

```bash
npm run demo:qa:v18
npm run demo:frame-qa:v18
npm run submission:preflight
npm run public:export
```

Video QA is based on `ffprobe`, `ffmpeg`, ImageMagick contact sheets, frame hashes, detail metrics, and frame-difference metrics. OCR is diagnostic only.

The current QA report hashes are recorded in `SUBMISSION_MANIFEST.json`.

## Judge Criteria Map

- Usefulness: Agent IC gives finance/security/ops teams a concrete way to decide which vendor agents earn budget, tools, and production access.
- Viability: The app has live-proof gates, public workload evidence, test-mode Stripe receipts, Nemotron/NemoHermes receipts, policy-block evidence, API contracts, release checks, and documented production boundaries.
- Presentation: The v3 video is under two minutes, uses a clean browser surface, and keeps the proof arc in-frame from mission intake through renewal evidence.

## More Detail

- `SUBMISSION.md` has tweet copy, Typeform copy, and the exact public submission steps.
- `JUDGE_SCORECARD.md` maps the entry to usefulness, viability, and presentation.
- `SUBMISSION_MANIFEST.json` is the machine-readable judge proof map.
- `FINAL_SUBMISSION_PACKET.md` has the full evidence packet and current validation list.
- `VALIDATION.md` lists fail-closed video and proof requirements.
- `PUBLIC_REPO_RELEASE.md` explains how the stripped public repo export is built.
