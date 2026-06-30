# Agent IC - Agent Coding Guide

This document is for AI coding agents working on Agent IC.

## Project Overview

Agent IC is an enterprise procurement control plane for agentic services. It helps CFOs and enterprise operators fund the right AI pilots, stop the wrong ones, and prove every dollar with evidence.

The product is not another AI agent. It is the governance layer that decides which vendor agents deserve budget, tools, and production access.

Core thesis: Enterprises do not need another isolated AI agent — they need a governed function that decides which agents deserve budget, tools, and production access.

## Technology Stack

- Framework: Next.js 15.5.19 App Router
- Runtime: Node.js 24+ with ES modules and `node --test`
- UI: React 19.2.3, JSX, CSS modules/global CSS
- AI: NVIDIA Nemotron (NIM) for sample classification in the current v7 run; procurement synthesis is claimed only when a run records a synthesis receipt
- Payments: Stripe Checkout receipts
- Policy: NVIDIA OpenShell when observed; otherwise an explicitly labeled local deny-by-default policy gate
- Skills: Hermes Agent playbook generation and reuse
- Data: NHTSA ODI, NVD CVE, GitHub, SEC EDGAR (all public, free)

## Architecture (v18)

### Engine Layer (`lib/`)

- `enterpriseCases.js` — 4 vendor product definitions with real data sources, vendor pricing/claims, defensible ROI methodology, OpenShell policy rules, and mission-statement-driven intake
- `enterpriseMetrics.js` — 8 enterprise metrics: profitability, waste ratio, risk-adjusted ROI, throughput, vendor claim validation, annualized value, opportunity cost, time-to-value
- `vendorClaimValidator.js` — validates vendor marketing claims against measured trial results
- `intakeAnalyzer.js` — mission-statement-driven intake with domain keyword matching
- `procurementDecisionEngine.js` — procurement-grade decisions with sign/don't-sign recommendations, risk-at-scale analysis, waste assessment
- `trialOrchestrator.js` — 8-phase orchestration: intake → Stripe → worker dispatch → policy enforcement → metrics → deterministic decision or receipt-backed Nemotron synthesis → playbook → ledger recording
- `workerAgent.js` — real data processing (NHTSA, GitHub, NVD, invoices) with Nemotron or deterministic classification
- `openShellIntegration.js` — attempts NVIDIA OpenShell sandbox enforcement when available; otherwise records local policy-gate proof without claiming sandbox enforcement
- `renewalLedger.js` — multi-cycle evidence accumulation with monthly renewal decisions and trend analysis

### API Routes

- `POST /api/enterprise-trial` — Run a governed enterprise service trial
- `GET /api/enterprise-trial` — List available enterprise cases
- `GET/POST /api/renewals` — Vendor renewal history and accumulated evidence

### UI

- `/trial` — Enterprise trial console (primary surface, "Governance Ledger" aesthetic)
- `/run` — Legacy v17 console (compatibility)

## Enterprise Cases

| Domain | Vendor | Data Source | Policy Block |
|--------|--------|------------|--------------|
| Safety Ops | RouteGuard AI | NHTSA ODI API | $150 CARFAX over $100 cap |
| Engineering | CodeShield Pro | GitHub PR API | Auto-merge (write without approval) |
| Security Ops | ThreatScope AI | NVD CVE API | External webhook (data exfiltration) |
| Finance Ops | InvoiceMind | Invoices + SEC EDGAR | Payment approval > $5,000 |

## Build And Run Commands

All npm scripts that invoke Next.js go through `scripts/safe-next.mjs` because the workspace path contains `#`.

```bash
npm install
npm run dev          # Start dev server
npm test             # 206 tests
npm run build        # Production build
npm run smoke        # API smoke tests
npm run smoke:browser
```

## Environment Variables

`.env.local` may contain live credentials. Never print, commit, or show those values.

```bash
NEMOTRON_BASE_URL=https://integrate.api.nvidia.com/v1
NEMOTRON_API_KEY=nvapi-...
NEMOTRON_MODEL=nvidia/nemotron-3-super-120b-a12b
STRIPE_SECRET_KEY=sk_test_...
AGENT_IC_LOCAL_MODE=false
```

NVIDIA OpenShell is optional at runtime. If installed, verify with `openshell status`; otherwise Agent IC labels local policy-gate enforcement instead of claiming sandbox proof.

## Code Style Guidelines

- Use ES modules
- Prefer `async/await`
- Keep business logic in `lib/`; keep API routes thin
- Money is stored and computed in dollars unless a Stripe API field explicitly requires cents
- Use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` for user-facing currency
- Never return raw provider keys, raw Stripe secrets, or raw Nemotron keys
- Every ROI number must trace to a formula with named inputs (see `roiMethodology` in case definitions)

## Validation

Do not claim done until:

```bash
npm test
npm run build
npm run smoke
```

All must pass.
