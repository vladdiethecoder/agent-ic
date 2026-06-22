# Agent IC

**Fund the right AI pilots. Stop the wrong ones. Prove every dollar with evidence.**

Agent IC is an enterprise procurement control plane for agentic services. It helps CFOs and enterprise operators decide which vendor AI agents deserve budget, tools, and production access — before signing a contract.

The product is not another AI agent. It is the governance layer that funds a bounded trial of any vendor's agentic service, governs its tools and spend, blocks unsafe actions, measures real outcomes on real data, validates vendor claims, and produces a procurement-grade decision: sign, revise, or kill.

## Core Thesis

Enterprises do not need another isolated AI agent — they need a governed function that decides which agents deserve budget, tools, and production access.

Agent IC is that function.

## How It Works

1. **Intake**: A buyer describes a business problem and names the vendor service they are considering.
2. **Trial Plan**: Agent IC generates a governed trial plan — spend envelope, allowed tools, policy rules, evidence metrics.
3. **Fund**: A Stripe test-mode Checkout Session creates a bounded spend authorization.
4. **Dispatch**: The vendor service processes real public data inside an NVIDIA OpenShell sandbox.
5. **Govern**: OpenShell enforces network policy — blocks paid enrichment, data exfiltration, and unauthorized actions with genuine NVIDIA-engine 403s.
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

Each case uses real public data, real Nemotron reasoning, genuine OpenShell policy enforcement, and produces defensible ROI where every dollar traces to a receipt.

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
npm test             # Run test suite (100 tests)
npm run build        # Production build
npm run smoke        # API smoke tests
npm run smoke:browser # Browser smoke tests
```

## Active Surfaces

- `/trial` — Enterprise trial console (primary)
- `/run` — Legacy v17 console (compatibility)
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

NVIDIA OpenShell is installed system-wide (`openshell` binary). No env var needed.

## Verification

```bash
npm test
npm run build
npm run smoke
```

## Submission

Hackathon: Hermes Agent Accelerated Business Hackathon (NVIDIA x Stripe x Nous Research)
Judging: Usefulness, Viability, Presentation
Deadline: EOD June 30, 2026
