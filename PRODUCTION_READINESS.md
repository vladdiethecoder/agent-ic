# Agent IC Production Readiness Contract

Agent IC's active goal is a **full production-ready enterprise solution**, not a demo hardening slice. This document is the authoritative production target and current-state gap audit.

## Production Definition

Agent IC is production-ready only when it can be safely deployed for real enterprise buyers to govern real vendor-agent trials with real users, tenants, policy decisions, spend controls, evidence retention, operational observability, and security controls.

A green local demo, passing local tests, or a polished video is not enough.

## Non-Negotiable Production Invariants

1. **No unauthenticated enterprise operation:** every mutation, trial run, renewal mutation, policy reset, or evidence export requires an authenticated principal.
2. **Tenant isolation:** data, audit rows, policies, spend envelopes, provider receipts, and renewal histories are scoped to an organization/tenant and cannot leak across tenants.
3. **Least privilege:** roles define what a user can view, approve, run, export, reset, or administer.
4. **Spend safety:** no provider, Stripe, provisioning, or tool call can execute without a policy envelope, budget cap, approval state, idempotency key, and audit row.
5. **Fail closed:** missing auth, tenant, policy, provider credentials, approvals, or storage must block production operations rather than falling back silently.
6. **Immutable auditability:** production audit/evidence records are append-only, durable, tamper-evident, and exportable.
7. **No secret leakage:** raw provider keys, tokens, sessions, local paths, internal URLs, or long sensitive identifiers never appear in UI, logs, audit rows, proof reports, exports, or error payloads.
8. **Evidence-backed decisions:** procurement decisions cite workload evidence, policy outcomes, and provider receipts, not model opinion alone.
9. **Operational observability:** health, readiness, metrics, traces, structured logs, error tracking, and incident runbooks exist before production deployment.
10. **Recoverability:** backups, restore procedures, data retention, and disaster recovery are tested.
11. **Compliance posture:** SOC2/GDPR-style controls are documented with clear non-claims; compliance is not claimed until audited.
12. **Release gates:** production deployments require automated tests, build, security checks, smoke checks, database migrations, rollback plan, and browser/API proof.

## Production Capability Requirements

### 1. Identity, Access, and Organization Model

Required:

- SSO/OIDC/SAML-compatible identity provider integration or production-ready adapter boundary, including browser session exchange and logout.
- Organization/tenant model.
- User membership model.
- RBAC roles at minimum:
  - `owner`: tenant administration and policy administration.
  - `procurement_admin`: vendor case management, renewal decisions, export.
  - `finance_approver`: spend-envelope approval and budget override.
  - `security_reviewer`: policy review, blocked-action review, evidence access.
  - `operator`: run bounded trials within approved policies.
  - `auditor`: read-only audit/proof access.
- Session validation on every API route.
- Auth-aware UI states.
- Tests proving unauthorized, wrong-role, and wrong-tenant requests fail.

Current state:

- Role model, route guards, signed HS256/RS256/JWKS auth, tenant-scope checks, membership enforcement, tenant registry, and HttpOnly browser session exchange/logout foundations exist.
- Full enterprise SSO is still incomplete: OIDC/SAML redirect/callback or platform middleware, deployed IdP validation, and production DB-backed tenant/user/session storage remain. SCIM-shaped lifecycle sync foundation exists.
- Demo fallback remains available outside production only; production routes fail closed without bearer/session auth.

Status: **Incomplete**.

### 2. Durable Data and Evidence Store

Required:

- Production database or equivalent durable store for tenants, users, vendor cases, trial runs, policies, approvals, audit rows, evidence artifacts, provider receipts, and renewal cycles.
- Migration strategy.
- Transactional write boundaries for trial run + audit + evidence.
- Retention policy.
- Backups and restore verification.
- Append-only/tamper-evident audit ledger.

Current state:

- File-backed `.agent-ic/*.jsonl` ledgers and local snapshots are useful for demo/dev.
- File-backed local ledgers are not sufficient for production durability, multi-tenant isolation, or tamper evidence.

Status: **Incomplete**.

### 3. Policy and Spend Governance

Required:

- Persistent policy envelopes with versioning.
- Approval workflows for spend/tool/network scope.
- Idempotency keys for spend and provider requests.
- Explicit production/test mode boundaries.
- Stripe test/live separation and webhook verification.
- Provider/tool execution sandbox policy with recorded decision receipts.
- Policy simulator and policy diff review before activation.

Current state:

- Signed export bundle foundation exists for compliance packages.
- Strong demo policy envelope and blocked-action story exists.
- Stripe test-mode path exists.
- OpenShell integration exists and proof report can label state.
- No full policy authoring/versioning/approval workflow yet.

Status: **Partially implemented**.

### 4. Enterprise API Surface

Required:

- Stable API versioning. **OpenAPI version and runtime version-header/rejection foundation implemented; formal compatibility/deprecation windows still required.**
- OpenAPI schema or typed contract. **OpenAPI 3.1 foundation and release validation implemented.**
- Request validation on all inputs.
- Structured error format.
- Rate limiting / abuse protection. **Tenant/principal-aware local limiter and production shared-backend config gate implemented; deployed shared enforcement still required.**
- CSRF/CORS strategy. **Foundation implemented for session-cookie JSON mutations plus CORS preflight baseline; deployed review still required.**
- Security headers. **Baseline security headers, report-only CSP, and production HSTS foundation implemented.**
- Pagination for lists. **Foundation implemented for primary list endpoints with shared `limit`/`cursor` metadata.**
- Audit event on every mutation.

Current state:

- Shared request validation exists in `lib/validation.js`, including session-cookie CSRF checks for JSON mutation routes.
- Structured JSON errors exist for guarded routes.
- Security middleware/header/CORS baseline and mutation rate-limit foundation exist.
- OpenAPI schema, pagination, runtime API version-header, and tenant/principal-aware rate-limit foundations implemented; formal deprecation windows, shared backend enforcement, and deployed security review remain.

Status: **Incomplete**.

### 5. Observability and Operations

P5 status update: metrics/logging endpoint, guarded alerts/SLO/incident endpoints, telemetry export foundation, alert threshold foundation, SLO/error-budget foundation, incident-review foundation, and initial runbooks/threat model are implemented as a foundation. Full P5 remains incomplete until telemetry is wired to production backends, dashboards, paging/ticketing integration, incident process, and deployment operations are in place.

Required:

- `/api/health` liveness.
- `/api/ready` readiness that checks storage/provider config without leaking secrets.
- Structured logs with correlation/run IDs.
- Metrics endpoint or exporter.
- Alert threshold evaluator and on-call escalation metadata. **Foundation implemented via `/api/alerts`; external paging still required.**
- External telemetry export. **Foundation implemented via `/api/telemetry/export`; production backend wiring still required.**
- SLO and error budget visibility. **Foundation implemented via `/api/slo`; external dashboards and SLO ownership still required.**
- Error tracking boundary.
- Traceable run IDs from API to UI to audit row.
- Runbooks for incident response, provider outage, payment incident, policy bypass attempt, and recovery.
- Incident review and alert-drill evidence workflow. **Foundation implemented via `/api/incidents`; external ticketing and compliance policy still required.**

Current state:

- `/api/health` exists.
- Some run IDs and proof reports exist.
- No readiness endpoint, metrics endpoint, or ops runbooks yet.

Status: **Incomplete**.

### 6. Security and Privacy

Required:

- Threat model.
- Security headers. **Baseline security headers, report-only CSP, and production HSTS foundation implemented.**
- CORS policy.
- Secret redaction tests.
- CSRF protection for browser-session authenticated mutations.
- Dependency audit policy.
- Data classification model.
- PII handling/redaction strategy.
- Secure error handling.
- No dangerous DOM/shell patterns.
- Admin-only reset endpoints.

Current state:

- Secret redaction helpers exist.
- Video QA and proof QA check leakage.
- Threat model, CORS/header baseline, CSP report-only foundation, HSTS production header, admin auth foundation, and session-CSRF mutation protection exist; deployed security review, CSP enforcement tuning, and production identity hardening remain.

Status: **Incomplete**.

### 7. Deployment and Release

Required:

- Production Dockerfile or deployment manifest that does not copy local-only artifacts or secrets. **Dockerfile hardening and container preflight implemented; executed signed image evidence still required.**
- Environment variable schema validation.
- Startup fails fast for invalid production config.
- CI workflow for lint/test/build/smoke/security.
- Rollback strategy.
- Database migration workflow.
- Public/private artifact split for product release versus production deployment.

Current state:

- Dockerfile exists but requires audit; it references `openshell` copy and may include local/demo artifacts if not curated.
- `scripts/safe-next.mjs` supports this workspace path.
- Environment validation, static security scan, release-check script, Dockerfile hardening, container release preflight, and CI workflow foundation exist; executed image scanning/signing, deployment manifests, and rollback automation still required.

Status: **Incomplete**.

### 8. Product UX for Enterprise Operators

Required:

- Tenant/org selector.
- Authenticated user identity in UI.
- Role-aware navigation.
- Production-safe empty/loading/error states.
- Policy builder/review surface.
- Approval queue.
- Audit/evidence export.
- Renewal decision history.

Current state:

- `/trial` has strong demo UX and renewal visualization.
- No authenticated enterprise admin UX yet.

Status: **Partially implemented**.

## Current Production Readiness Verdict

Agent IC is currently a **strong enterprise prototype and enterprise-grade product concept**, not a production-ready enterprise solution.

Current readiness estimate:

- Product thesis: **Strong**
- Demo workflow: **Strong**
- Enterprise relevance: **Strong**
- Production auth/tenant isolation: **Foundation implemented; production SSO/DB lifecycle still incomplete**
- Durable audit/data: **Local foundation implemented; production DB/WORM/object store still incomplete**
- Policy governance workflow: **Partial**
- Deployment/ops/compliance: **Foundations implemented; deployed production operations still incomplete**
- Full production readiness: **Not achieved**

## Required Milestones to Reach Full Production Ready

### Milestone P0 — Production Contract and Gap Audit

- Keep this document current.
- Ensure docs and final packet never claim production readiness prematurely.
- Add production readiness checklist script.

Exit evidence:

- `PRODUCTION_READINESS.md` exists and is referenced by README/final packet.
- Tests/checks fail if production readiness is claimed without required gates.

### Milestone P1 — Production Safety Baseline

P1 status update: baseline controls are implemented in middleware, `/api/ready`, and `lib/productionConfig.js`, with tests and smoke coverage. P1 does not make Agent IC fully production-ready; it only establishes the first safety foundation.

- Security headers. **Baseline security headers, report-only CSP, and production HSTS foundation implemented.**
- CORS policy.
- Rate limiting for mutation routes.
- Env schema validation.
- `/api/ready` endpoint.
- Admin confirmation gates for reset/clear operations.

Exit evidence:

- Unit/API tests for headers, readiness, rate limit, and secret redaction.
- `npm test`, `npm run build`, `npm run smoke`, `npm run smoke:api`, `npm run smoke:browser` pass.

### Milestone P2 — Auth, Tenant, and RBAC Enforcement

P2 status update: auth adapter and route guard foundation are implemented for API routes, including production fail-closed behavior for missing principals, HS256 and RS256/JWKS bearer-token validation, durable HttpOnly browser session exchange/logout, role checks, tenant-scope checks, membership enforcement, tenant registry, SCIM-shaped IdP lifecycle sync foundation, and auth-aware admin UI foundations. P2 is not complete until OIDC/SAML redirect/callback or platform SSO middleware, deployed IdP validation, and production DB-backed tenant/user/session lifecycle are implemented.

- Auth adapter boundary. **Foundation implemented via signed HS256 bearer-token adapter, RS256/JWKS validation, and HttpOnly browser session exchange/logout; production OIDC/SAML redirect/callback or platform provider still required.**
- Tenant/user/session model. **Tenant registry, memberships, SCIM lifecycle endpoint foundation, and local session store foundations implemented; production DB/IdP-backed lifecycle still required.**
- Route guards on every API route. **Foundation applied to enterprise, renewal, proof, events, and trace APIs; health/ready remain public.**
- Role checks for run/approval/admin/audit/export. **Foundation implemented.**
- Tenant isolation tests. **Route-level tenant mismatch tests implemented; durable-store isolation still required.**

Exit evidence:

- Unauthorized requests fail.
- Wrong-role requests fail.
- Cross-tenant access fails.
- UI displays authenticated tenant/user/role state and exposes browser session create/logout controls.

### Milestone P3 — Durable Store and Audit Ledger

P3 status update: tamper-evident, signed, tenant-scoped local audit-chain foundation, versioned tenant-store foundation, and formal local migration runner/schema registry are implemented and verified. Full P3 remains incomplete until a durable production database/WORM/object store, platform migrations, backup/restore drill, and transactional trial/evidence writes are implemented.

- Database or durable store adapter. **Versioned local tenant-store foundation implemented; production DB still required.**
- Migrations. **Formal local migration runner implemented; production DB/object/WORM migrations still required.**
- Trial/evidence/policy/renewal tables or collections.
- Append-only audit design with tamper-evident hashes and row signatures. **Local hash-chain plus HMAC row-signing foundation implemented; WORM backend and key rotation still required.**
- Backup/restore procedure.

Exit evidence:

- Integration tests against production-like storage.
- Audit chain verification. **Local hash-chain and HMAC signature verification implemented.**
- Restore drill documented. **Still required for production.**

### Milestone P4 — Policy Governance and Approval Workflow

P4 status update: spend approval request/approve/reject workflow foundation and tenant-scoped policy versioning/diff/simulation foundation are implemented. Production-mode trials require an approved tenant-scoped spend approval. Full P4 remains incomplete until richer policy builder/approval queue UI, scheduled payment reconciliation, richer policy simulation, and release workflow are implemented.

- Policy envelope builder.
- Approval queue.
- Policy versioning and diff review.
- Stripe webhook verification, idempotency, and payment-state reconciliation. **Webhook and manual retrieve reconciliation foundations implemented; deployed scheduled reconciliation still required.**
- Provider/tool execution audit receipts.

Exit evidence:

- Policy changes require approval.
- Spend cannot execute without approval.
- Webhooks verified.
- Policy bypass attempts fail closed.

### Milestone P5 — Observability, Compliance, and Release Operations

- Structured logs.
- Metrics/readiness dashboards.
- SLO ownership and error-budget policy. **Local evaluator implemented; production SLO program still required.**
- Incident review cadence and alert/fire-drill evidence. **Foundation implemented; production operating cadence still required.**
- Alert threshold and paging integration. **Local alert evaluator implemented; external on-call integration still required.**
- Incident runbooks.
- Threat model.
- Data retention and privacy docs.
- CI/CD release gate.
- Deployment manifest audited.

Exit evidence:

- CI passes all gates.
- Runbooks exist.
- Threat model exists.
- Production deployment checklist is green.

### Milestone P6 — Final Production Acceptance

- End-to-end production-like trial with authenticated tenant/user.
- Provider proof and policy proof are fresh and matched to the run.
- No stale demo artifacts are used as production evidence.
- Completion audit maps every requirement in this document to current proof.

Exit evidence:

- Production readiness checklist passes.
- Full requirement-by-requirement audit proves completion.
- Only then may the goal be marked complete.
