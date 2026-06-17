# Agent IC — Agent Coding Guide

This document is for AI coding agents working on Agent IC. It assumes no prior knowledge of the project.

## Project overview

Agent IC is a Next.js hackathon demo for the Nous × NVIDIA × Stripe Hermes Agent challenge. It models a **governed capital account for autonomous work**: a micro-pilot receives a bounded spend envelope, runs inside a policy envelope, gets blocked from unsafe actions, imports evidence, and reaches a continue/revise/kill decision with a reusable Hermes playbook.

The default mode is fully local and safe — no API keys, no model calls, and no real Stripe spend. Optional live paths activate only when environment variables are set.

Primary scenario: **Atlas Freight — Autonomous RMA + claims copilot for late freight exceptions**.

Expected baseline deterministic result for Atlas Freight:

- Decision: `CONTINUE`
- Budget: `$185,000`
- Autonomous spend cap: about `$35,000`
- Payback: `38 days`
- 90-day ROI: `2.36x`

## Technology stack

- **Framework:** Next.js 15.5.19 (App Router, server components by default)
- **Runtime:** Node.js 24+ (ES modules, `node --test`)
- **UI:** React 19.2.3, JSX, plain CSS modules in `app/globals.css` and `app/submit.css`
- **Language:** JavaScript (ES2022+), no TypeScript in app code
- **Dependencies:** `next`, `react`, `react-dom`
- **Dev dependency:** `@playwright/test` for browser/recording automation
- **External APIs (optional):** NVIDIA NIM / Nemotron OpenAI-compatible chat completions, Stripe Checkout Sessions

## Project structure

```
.
├── app/                       # Next.js App Router
│   ├── api/                   # API routes
│   │   ├── audit/route.js           # Append-only audit log (GET/POST/PUT)
│   │   ├── evaluate/route.js        # Proposal evaluation + optional Nemotron live path
│   │   ├── health/route.js          # Readiness probe
│   │   ├── run-capital-experiment/route.js  # Full capital-experiment orchestration
│   │   └── stripe-session/route.js  # Stripe Checkout Session creation (live/mock)
│   ├── mock-stripe-checkout/page.jsx
│   ├── submit/page.jsx
│   ├── globals.css
│   ├── layout.jsx
│   ├── page.jsx
│   └── submit.css
├── components/                # React client components
│   ├── AgentICApp.jsx              # Main demo workbench UI
│   ├── AgentICRecordingCockpit.jsx # Recording view at /?recording=1
│   └── AgentICSubmit.jsx           # Submission landing view at /submit
├── lib/                       # Shared business logic
│   ├── auditStore.js         # Durable append-only local audit log
│   ├── decisionEngine.js     # Deterministic scoring, budget, ROI, evidence gates
│   ├── demoData.js           # Seeded proposals, governance policy, rubric, timeline
│   ├── proofEngine.js        # Hermes playbook, provider receipts, operational runs, board packets
│   ├── stripeAdapter.js      # Stripe live/mock Checkout Session adapter
│   └── validation.js         # JSON body parsing, proposal lookup, secret redaction
├── scripts/                   # Build/test/demo automation
│   ├── safe-next.mjs         # Mirrors project to /tmp to avoid `#` in path
│   ├── smoke.mjs             # End-to-end API smoke test
│   ├── api-edge-smoke.mjs    # Edge-case API smoke test
│   ├── browser-smoke.mjs     # Headless Chrome DOM/screenshot smoke test
│   ├── record-demo.mjs       # Playwright recording for demo video
│   └── make-voiceover.sh, mux-demo.sh
├── tests/                     # Node test runner unit/route tests
│   ├── api-routes.test.mjs
│   ├── audit-store.test.mjs
│   ├── decision-engine.test.mjs
│   ├── run-capital-experiment.test.mjs
│   ├── safe-next.test.mjs
│   └── demo.record.spec.ts   # Playwright spec
├── prds/                      # Detailed PRDs for product subsystems
├── demo/                      # Voiceover scripts
├── demo-out/                  # Generated demo videos
├── .env.example               # Optional live integration variables
├── next.config.mjs
└── package.json
```

## Build and run commands

All npm scripts that invoke Next.js go through `scripts/safe-next.mjs` because the workspace path contains `#`, which breaks Next.js output tracing. The script mirrors the project to `/tmp/agent-ic-dev` or `/tmp/agent-ic-build` and runs Next.js there.

```bash
# Install dependencies
npm install

# Start development server on http://localhost:3000
npm run dev

# Production build
npm run build

# Production server (after build)
npm run start
```

Health check:

```bash
curl -s http://localhost:3000/api/health | python3 -m json.tool
```

## Test commands

```bash
# Run all unit and route tests with Node's test runner
npm test

# API smoke tests against a running server
npm run smoke
npm run smoke:api

# Browser smoke test (requires Chrome/Chromium)
npm run smoke:browser
```

The test suite covers:

- Decision engine math (budget line sums, cap bounds, evidence gates)
- Audit store (monotonic IDs, retention, secret redaction)
- API routes (malformed JSON, unknown proposals, KILL spend blocking, Stripe cents/dollars conversion, Nemotron fallback, live Stripe dry-run, provider failure sanitization)
- `run-capital-experiment` orchestration and counterfactual decisions
- `safe-next.mjs` mirror safety guardrails

## Code style guidelines

- Use ES modules (`"type": "module"` in `package.json`).
- Prefer `async/await` over raw promises.
- Use `node:` prefixed imports for built-ins (e.g., `node:fs`, `node:path`).
- Prefer early returns and explicit error handling.
- Keep business logic in `lib/`; keep API routes thin.
- UI components are client components with `'use client';` when they use hooks or browser APIs.
- Money is stored and computed in **dollars**; Stripe `unit_amount` / `amount_total` must always be **cents**.
- Use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` for currency display.
- CSS classes use kebab-case. Global styles live in `app/globals.css` and `app/submit.css`.

## Key architectural rules

### Deterministic fallback is the default

- `lib/decisionEngine.js` always produces a deterministic evaluation.
- `app/api/evaluate/route.js` calls Nemotron only when `NEMOTRON_API_KEY` is set **and** `AGENT_IC_DEMO_MODE` is not `true`.
- If the live model call fails, the route returns HTTP 200 with the deterministic evaluation and a sanitized `liveError` field.

### Stripe spend path is gated

- `lib/stripeAdapter.js` returns a mock Checkout Session unless `STRIPE_SECRET_KEY` is set **and** `AGENT_IC_DEMO_MODE=false`.
- `app/api/stripe-session/route.js` rejects KILL decisions with HTTP 409 before any Stripe call.
- Amounts sent to Stripe are always in cents; metadata stores dollars as a string.

### Audit log is append-only and durable

- `lib/auditStore.js` writes to `.agent-ic/audit-log.jsonl` by default.
- Test runs use `AGENT_IC_AUDIT_FILE=.agent-ic/test-audit-log.jsonl` to avoid polluting the production audit log.
- Entries are capped at 100 retained events.
- Secrets are redacted before persistence.
- Reset requires `confirmReset="AGENT_IC_DEMO_RESET"`.

### Request validation

- `lib/validation.js` provides `readJsonBody`, `getProposalOrError`, `assertValidProposal`, and `sanitizeProviderError`.
- Maximum JSON body size is 32 KB (`MAX_JSON_BYTES`).
- Malformed JSON returns HTTP 400; oversized bodies return HTTP 413.

## Environment variables

Copy `.env.example` to `.env.local` to enable live integrations. The app runs safely without any of these.

```bash
# NVIDIA NIM / Nemotron
NEMOTRON_BASE_URL=https://integrate.api.nvidia.com/v1
NEMOTRON_API_KEY=nvapi-...
NEMOTRON_MODEL=nvidia/nemotron-3-super-120b-a12b

# Optional Hermes handoff webhook
HERMES_AGENT_URL=http://localhost:8080/webhooks/agent-ic-evaluate
HERMES_AGENT_TOKEN=

# Stripe live path
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Demo mode guard
AGENT_IC_DEMO_MODE=true
```

## API contracts

### `GET /api/health`

Readiness probe. Returns seeded decision summary and integration flags. Never exposes secrets.

### `POST /api/evaluate`

Input: `{ "proposalId": "atlas-freight-rma-copilot" }`

Output: `proposal`, `evaluation`, `audit`, `liveError`, `hermesPlaybook`, `providerReceipts`, `operationalRun`, `blockedEvent`, `boardPacket`, `spendEnvelope`, `blockedAction`, `evidenceReceipts`.

### `POST /api/stripe-session`

Input: `{ "proposalId": "...", "evaluation": {...}, "idempotencyKey?": "..." }`

Output in demo mode: `{ mode: "demo", checkout, spendCapDollars, evaluation, audit, providerReceipts }`.

Output in live mode: `{ mode: "live", checkout, ... }` from Stripe.

### `GET /api/audit`

Output: `{ "audit": [...] }`, newest first.

### `POST /api/audit`

Append event or reset log with explicit confirmation.

### `POST /api/run-capital-experiment`

Input: `{ "proposalId?": "...", "qaAgreement?": number, "envelopeCap?": number }`

Output: full orchestration payload with `decision`, `envelope`, `stripe`, `blocked`, `evidence`, `hermesPlaybook`, `boardPacket`, `auditRows`, `providerReceipts`.

## Security considerations

- Never log or return raw API keys, Stripe secrets, or Nemotron keys. Use `redactSecrets` from `lib/validation.js`.
- Live Stripe calls are gated by `STRIPE_SECRET_KEY` and `AGENT_IC_DEMO_MODE=false`.
- KILL decisions block Stripe authorization.
- Out-of-policy tool requests return HTTP 403/409 and fail closed.
- Audit entries are sanitized before persistence.
- The `safe-next.mjs` script refuses to `rsync --delete` to any path outside `/tmp/agent-ic-*` unless explicitly allowed.
- No `dangerouslySetInnerHTML`, `eval`, or shell injection in the primary code paths.

## Demo recording

```bash
# Record the narrated demo video
npm run demo:record

# Generate voiceover audio
npm run demo:voice

# Mux video + audio
npm run demo:mux

# Full pipeline
npm run demo:video
```

Recording views:

- `http://localhost:3000/?recording=1` — recording cockpit with counterfactual sliders
- `http://localhost:3000/?productMode=true` — product-mode workbench
- `http://localhost:3000/submit` — submission landing page

## Important documentation

- `README.md` — setup, run, and live integration instructions
- `PRD.md` — system product requirements
- `PRODUCT_CONTRACT.md` — acceptance criteria and edge-case matrix
- `VALIDATION.md` — pre-submission verification checklist
- `STORYBOARD.md` — 90-second demo script
- `SUBMISSION.md` — submission materials and draft messages
- `prds/` — subsystem PRDs

## Common pitfalls

- Do not run `next dev`/`next build` directly inside the workspace path because `#` breaks Next.js tracing. Use `npm run dev` / `npm run build`.
- Do not store dollars in Stripe `unit_amount`; always multiply by 100.
- Do not remove the deterministic fallback path from `/api/evaluate`; rehearsals must remain safe without API keys.
- Do not increase `MAX_JSON_BYTES` without justification; the limit protects the demo server.
- Do not add arbitrary admin mutations to `/api/audit` without requiring explicit confirmation.

## Contact / ownership

This is a hackathon submission project. The canonical source of truth for behavior is the passing test suite plus `VALIDATION.md` and `PRODUCT_CONTRACT.md`.
