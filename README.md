# Agent IC

**Fund the right AI pilots. Stop the wrong ones. Prove every dollar with evidence.**

Agent IC is an enterprise procurement control plane for agentic services. It helps CFOs and enterprise operators decide which vendor AI agents deserve budget, tools, and production access — before signing a contract.

The product is not another AI agent. It is the governance layer that funds a bounded trial of any vendor's agentic service, governs its tools and spend, blocks unsafe actions, measures real outcomes on real data, validates vendor claims, and produces a procurement-grade decision: sign, revise, or kill.

## Hackathon Judge Quickstart

Start with `JUDGE_QUICKSTART.md` and `JUDGE_SCORECARD.md`, then watch the X-attached demo video:

- Public repo: `https://github.com/vladdiethecoder/agent-ic`
- Immutable public release tag: `hackathon-submission-2026-06-25-final-v2`
- Primary video: `demo-out/agent-ic-demo-final-winning-v3.mp4`
- SHA-256: `5da9da4f9b200fe4f304698d8325d225f5965119d5e98c9682c3c82e0fa14726`
- Runtime: 114.84 seconds, 1920x1080 H.264/AAC

The stripped public repo intentionally excludes generated videos, frame dumps, browser profiles, local state, and `.env.local`; the video should be attached to the public X submission post. `VIDEO_JUDGE_GUIDE.md`, `JUDGE_SCORECARD.md`, `SUBMISSION_MANIFEST.json`, `SUBMISSION.md`, `FINAL_SUBMISSION_PACKET.md`, and `VALIDATION.md` contain the timestamped video guide, criteria map, proof map, current validation status, tweet copy, Typeform copy, and fail-closed QA rules.

## Core Thesis

Enterprises do not need another isolated AI agent — they need a governed function that decides which agents deserve budget, tools, and production access.

Agent IC is that function.

## How It Works

1. **Intake**: A buyer describes a business problem and names the vendor service they are considering.
2. **Trial Plan**: Agent IC generates a governed trial plan — spend envelope, allowed tools, policy rules, evidence metrics.
3. **Fund**: A Stripe test-mode Checkout Session creates a bounded spend authorization.
4. **Dispatch**: The vendor service processes real public data through a governed worker run.
5. **Govern**: OpenShell policy enforcement is used when available; the local deny-by-default policy gate still records the same blocked-action `403` receipt when the sandbox is unavailable.
6. **Measure**: Eight enterprise metrics computed from real trial evidence: profitability, waste ratio, risk-adjusted ROI, throughput, vendor claim validation, annualized value, opportunity cost, time-to-value.
7. **Validate**: Vendor marketing claims are checked against measured results. Did the vendor deliver what they promised?
8. **Decide**: Nemotron synthesizes a procurement recommendation: should the buyer sign the contract? At what tier?
9. **Renew**: Evidence accumulates across monthly cycles. The renewal ledger tracks trends and recommends expand, hold, downgrade, or cancel.

## Enterprise Cases

Four vendor products being trialed across diverse enterprise domains:

| Domain | Vendor Product | Real Data Source | Policy Block |
|--------|---------------|-----------------|--------------|
| Safety Ops | RouteGuard AI (Sentinel Routing) | NHTSA ODI Complaints API | $150 CARFAX enrichment over $100 cap |
| Engineering | CodeShield Pro (Refactor Labs) | GitHub Pull Request API | Auto-merge to production (write without approval) |
| Security Ops | ThreatScope AI (CypherSec) | NVD CVE API | External webhook POST (data exfiltration) |
| Finance Ops | InvoiceMind (LedgerFlow) | Invoice dataset + SEC EDGAR | Payment approval above $5,000 threshold |

Each case uses public or inspectable workload evidence, Nemotron-backed reasoning when configured, a fail-closed policy block, and defensible ROI where every dollar traces to a named formula.

## Technology Stack

- Framework: Next.js 15 App Router
- Runtime: Node.js 24+ with ES modules
- AI: NVIDIA Nemotron (NIM) for classification and procurement decision synthesis
- Payments: Stripe test-mode Checkout Sessions
- Policy: NVIDIA OpenShell v0.0.66 (genuine agent sandbox runtime)
- Skills: Hermes Agent playbook generation and reuse
- Data: NHTSA ODI, NVD CVE, GitHub, SEC EDGAR (all public, free, no auth)

## Commands

```bash
npm install
npm run dev          # Start dev server
npm run judge:check  # Public-clone judge gate: test, build, and proof-map checks
npm test             # Run Node test suite
npm run build        # Production build
npm run smoke        # API smoke tests
npm run smoke:browser # Browser smoke tests
```

## Active Surfaces

- `/trial` — Enterprise trial console (primary)
- `/api/enterprise-trial` — Run a governed enterprise trial
- `/api/renewals` — Vendor renewal history and accumulated evidence
- `/api/proof-report` — Masked proof receipts for audit

## Environment

`.env.local` may contain live credentials. Never commit or display those values.

```bash
STRIPE_SECRET_KEY=sk_test_...
NEMOTRON_API_KEY=nvapi-...
NEMOTRON_BASE_URL=https://integrate.api.nvidia.com/v1
NEMOTRON_MODEL=nvidia/nemotron-3-super-120b-a12b
```

NVIDIA OpenShell is checked at runtime (`openshell status`). If it is unavailable, Agent IC labels the result as policy-gate proof instead of claiming sandbox proof.

## Production Readiness

Agent IC is a strong enterprise prototype, but full production readiness is tracked separately from hackathon-demo readiness. See `PRODUCTION_READINESS.md` and `PRODUCTION_GAP_AUDIT.md`.

Current implemented production baseline controls include:

- security/CORS headers via middleware,
- mutation-route rate limiting,
- `/api/ready` readiness checks,
- production environment validation via `npm run prod:check`,
- migration apply/check gate via `npm run migrate:apply` and `npm run migrate:check`,
- secret-redacted readiness/proof payloads,
- SCIM-shaped IdP membership lifecycle endpoints for tenant user provisioning,
- guarded alerts, SLO/error-budget, incident review, telemetry export, and OpenAPI contract and pagination foundations.

Full production readiness still requires deployed SSO/OIDC redirect/callback or platform middleware, production DB/object/WORM storage, formal migrations, deployed observability, compliance signoff, image signing/scanning, and production smoke evidence. Do not claim production readiness until `PRODUCTION_READINESS.md` is fully satisfied.

## Verification

```bash
npm test
npm run build
npm run judge:check
npm run release:check
```

Live smoke gates require the app to be running:

```bash
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:api
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:browser
```

## Submission

Hackathon: Hermes Agent Accelerated Business Hackathon (NVIDIA x Stripe x Nous Research)
Judging: Usefulness, Viability, Presentation
Deadline: EOD June 30, 2026
