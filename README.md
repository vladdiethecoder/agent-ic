# Agent IC

**Govern vendor-agent spend, access, evidence, and renewal decisions.**

Agent IC is an enterprise procurement control plane for agentic services. It helps finance, security, operations, and procurement teams decide which vendor AI agents deserve budget, tools, data access, and production privileges.

The product is not another worker agent. It is the governed buying and operating layer around every agent an enterprise wants to adopt.

## Product thesis

Enterprises will not buy autonomous agentic services at scale without a control plane that governs spend, actions, evidence, and renewal decisions.

Agent IC is that control plane.

## How it works

1. **Intake** — capture the buyer mission, vendor agent, contract at risk, success metrics, and allowed scope.
2. **Approval state** — attach finance approval evidence when production spend or expansion is requested.
3. **Bounded spend** — create a governed Checkout envelope or approved ledger envelope for the capped evaluation budget.
4. **Governed execution** — run the vendor-agent workload against inspectable data under policy.
5. **Policy enforcement** — allow approved evidence reads and block out-of-policy spend/tool requests with OpenShell when observed, otherwise fail closed through Agent IC's local deny-by-default policy gate.
6. **Evidence and ROI** — compute named-input profitability, waste, risk-adjusted ROI, throughput, vendor claim validation, annualized value, opportunity cost, and time-to-value.
7. **Procurement decision** — issue continue, revise, or kill recommendations with receipts rather than model opinion alone.
8. **Production-access gate** — deny production privileges unless live/provider receipts and approval evidence clear the policy.
9. **Renewal ledger** — carry observed evidence into monthly renewal, expansion, downgrade, or cancellation decisions.

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
- `/api/enterprise-trial` — governed evaluation execution
- `/api/renewals` — accumulated vendor renewal evidence
- `/api/proof-report` — masked proof and provider-state audit surface

## Integration truth model

- **Stripe** records bounded spend-envelope receipts. A `cs_test...` receipt is explicitly non-production money movement; a production-money claim requires a production-mode receipt and approval workflow evidence.
- **NVIDIA Nemotron** is live only when a run records a provider request ID.
- **NVIDIA OpenShell** is claimed only when a run records observed sandbox/policy enforcement such as an HTTP 403 denial receipt.
- **Hermes** is live only when a run records a Hermes gateway, sandbox, or CLI receipt.
- **Public data** is treated as inspectable evidence with source paths, row counts, and hashes.
- **Local development mode** can provide a local principal and local ledgers; production mode fails closed without authenticated principals and approval evidence.

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
STRIPE_SECRET_KEY=sk_test_...      # or an approved production-mode key in controlled deployments
NEMOTRON_API_KEY=nvapi-...
NEMOTRON_BASE_URL=https://integrate.api.nvidia.com/v1
NEMOTRON_MODEL=nvidia/nemotron-3-super-120b-a12b
AGENT_IC_LOCAL_MODE=false          # true disables outbound providers for local/offline rehearsals
AGENT_IC_PRODUCTION_MODE=false     # true requires authenticated principal and spend approval
AGENT_IC_REQUIRE_LIVE_PROOF=false   # production deployments should set true
```

## Production boundary

Agent IC is a working enterprise product foundation with governed execution, fail-closed policy behavior, masked provider receipts, local audit/renewal ledgers, production-mode auth checks, signed export support, migrations, security scans, and release manifests. A full enterprise deployment still requires organization-specific SSO/OIDC configuration, production database/object storage, deployed observability, compliance approval, and production smoke evidence in the target environment.
