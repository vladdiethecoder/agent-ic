# Agent IC Production Threat Model

This is the initial production threat model for Agent IC. It supports the full production-ready objective but does not claim formal compliance certification.

## Assets

- Tenant data: organizations, users, roles, memberships.
- Trial data: vendor cases, missions, policies, evidence, decisions, renewal history.
- Spend data: Stripe Checkout Sessions, caps, approvals, webhook state.
- Provider data: Nemotron receipts, OpenShell/NemoHermes policy receipts, Hermes playbooks.
- Audit data: hash-chained audit entries and proof reports.
- Secrets: Stripe/Nemotron/Hermes/OpenShell credentials, audit signing key, auth provider keys.

## Trust Boundaries

1. Browser to Next.js API.
2. API route to auth/RBAC guard.
3. API route to local/durable stores.
4. Agent IC to Stripe/Nemotron/Hermes/OpenShell providers.
5. Proof/video artifacts to public submission surfaces.
6. Admin/operator/auditor role boundaries.

## High-Risk Threats and Controls

| Threat | Risk | Current control | Remaining production work |
|---|---|---|---|
| Unauthenticated trial execution | Spend/tool misuse | Production-mode signed JWT auth guard fails closed; RS256/JWKS material validation supported | Add live JWKS rotation or platform OIDC/SAML session provider |
| Cross-tenant data access | Customer data leakage | Tenant-scope checks and tenant-filtered audit reads | Durable tenant-scoped DB and cross-tenant integration tests |
| Privilege escalation | Wrong user approves spend | RBAC permission checks | Durable role assignments and auth-aware UI |
| Audit tampering | Evidence manipulation | SHA-256 hash-chain plus HMAC-signed local audit | WORM/durable audit backend and signing key rotation |
| Secret leakage | Provider compromise | Redaction helpers, proof/video checks | Centralized logging/error boundary review and secret scanning CI |
| Spend replay/idempotency failure | Double charge or stale approval reuse | Approval foundation | Idempotency keys, Stripe webhook verification, replay tests |
| Policy bypass | Unsafe tool/network access | OpenShell/policy gate proof path | Policy builder/versioning/simulator and signed policy activation |
| Provider outage | Trial failure or partial state | Fail-closed errors and readiness | Incident runbooks, retry budgets, circuit breakers |
| Local artifact overclaim | Misleading demo/proof | Honest production docs and proof caveats | Fresh matched strict-live captures for public claims |

## Required Security Gates Before Production Claim

- OIDC/JWT/session validation implemented and tested.
- Durable tenant/user/membership store implemented.
- Durable/WORM audit backend with managed signing-key rotation and backup/restore proof.
- Stripe webhook verification and idempotency tests.
- Policy versioning and approval workflow tests.
- CI secret scan and dependency audit.
- Incident runbooks and on-call escalation path.
