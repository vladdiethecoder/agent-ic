# Agent IC

**Fund the right AI pilots. Stop the wrong ones. Prove every dollar with evidence.**

Agent IC is an enterprise procurement control plane for agentic services. It helps finance, security, operations, and procurement teams decide which vendor AI agents deserve budget, tools, data access, and production access.

The product is not another worker agent. It is the governed buying layer around every agent an enterprise wants to adopt.

## Product thesis

Enterprises will not buy autonomous agentic services at scale without a control plane that governs spend, actions, evidence, and renewal decisions.

Agent IC is that control plane.

## How it works

1. **Intake** — capture the buyer mission, vendor agent, contract at risk, success metrics, and allowed scope.
2. **Bounded spend** — create a Stripe test-mode Checkout envelope for a capped trial budget.
3. **Governed execution** — run the vendor-agent workload against inspectable data under policy.
4. **Policy enforcement** — allow approved evidence reads and block out-of-policy spend/tool requests with NVIDIA OpenShell when observed, otherwise fail closed or label local policy-gate proof explicitly.
5. **Evidence and ROI** — compute named-input profitability, waste, risk-adjusted ROI, throughput, vendor claim validation, annualized value, opportunity cost, and time-to-value.
6. **Procurement decision** — issue continue, revise, or kill recommendations with receipts rather than model opinion alone.
7. **Renewal ledger** — carry observed evidence into monthly renewal and expansion decisions.

## Enterprise cases

| Domain | Vendor product | Data source | Example blocked action |
|---|---|---|---|
| Safety Ops | RouteGuard AI | NHTSA ODI complaints | $150 CARFAX enrichment above a $100 cap |
| Engineering | CodeShield Pro | GitHub PRs | Auto-merge/write without approval |
| Security Ops | ThreatScope AI | NVD CVEs | External webhook/data exfiltration |
| Finance Ops | InvoiceMind | Invoices + SEC EDGAR | Payment approval above threshold |

## Primary surfaces

- `/trial` — enterprise trial console
- `/admin` — operational/admin console
- `/api/enterprise-trial` — governed trial execution
- `/api/renewals` — accumulated vendor renewal evidence
- `/api/proof-report` — masked proof and provider-state audit surface

## Integration truth model

- **Stripe** is used in test mode for bounded spend-envelope receipts.
- **NVIDIA Nemotron** is live only when a run records a provider request ID.
- **NVIDIA OpenShell** is claimed only when a run records observed sandbox/policy enforcement such as an HTTP 403 denial receipt.
- **Hermes** is live only when a run records a Hermes gateway, sandbox, or CLI receipt.
- **Public data** is treated as inspectable evidence with source paths, row counts, and hashes.

## Development

All Next.js scripts go through `scripts/safe-next.mjs` because this workspace path can contain shell-hostile characters.

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

Live local smoke checks require the app server to be running:

```bash
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:api
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:browser
```

Broader release hardening:

```bash
npm run release:check
```

## Environment

`.env.local` may contain live credentials. Do not commit or print those values.

Common variables:

```bash
STRIPE_SECRET_KEY=sk_test_...
NEMOTRON_API_KEY=nvapi-...
NEMOTRON_BASE_URL=https://integrate.api.nvidia.com/v1
NEMOTRON_MODEL=nvidia/nemotron-3-super-120b-a12b
AGENT_IC_DEMO_MODE=false
```

## Production boundary

Agent IC is a working enterprise prototype with substantial local controls and proof gates. Full production deployment still requires deployed SSO/OIDC, production database/object storage, formal migrations, deployed observability, compliance signoff, and production smoke evidence.
