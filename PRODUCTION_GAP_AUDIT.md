# Agent IC Production Gap Audit

Generated for the full production-ready objective. This audit intentionally does not shrink the target to a prototype slice.

## Current Strong Foundations

- Clear enterprise product thesis and buyer persona.
- `/trial` governed vendor-agent trial UI.
- Four enterprise cases across Safety, Engineering, Security, and Finance.
- Real/inspectable NHTSA workload snapshot.
- Procurement decision engine and enterprise metrics.
- Policy block story with attempted over-cap action.
- Stripe test-mode integration path.
- Nemotron integration path.
- OpenShell integration path.
- Renewal ledger concept.
- Proof report endpoint.
- Video/browser QA gates.

## Production Blockers

| Area | Current gap | Production risk | Required fix |
|---|---|---|---|
| Auth | Signed HS256 and RS256/JWKS route guards plus durable HttpOnly browser session/logout foundation implemented; real IdP redirect/session middleware still missing | Token exchange/session foundation is not a complete enterprise SSO lifecycle | OIDC/SAML redirect/callback or platform middleware, key-rotation policy, deployed SCIM/IdP validation, and production DB-backed lifecycle |
| Tenancy | Tenant mismatch checks, tenant-scoped stores, membership records, and tenant registry/org selector foundation implemented; production DB-backed org lifecycle still missing | Local registry is not yet a production source of truth for multi-org enterprise tenancy | Production tenant/org DB, IdP-backed org lifecycle, migrations, and transactional isolation |
| RBAC | Role permissions, stored tenant memberships, membership/admin UI, and SCIM-shaped IdP lifecycle sync foundation implemented | Local memberships still need production DB backing and deployed IdP validation | Durable production user store, deployed SCIM connector, richer user workflow, SSO session lifecycle |
| Storage | Versioned tenant-store foundation with atomic local writes and formal local migration runner covers approvals, renewals, trials, evidence metadata/artifacts, policies, payments, memberships, retention, export, SCIM, sessions, and tenant registry; production DB still missing | Local files still lack production durability and transactional guarantees | Durable DB/object store with platform migrations and transactions |
| Audit | Local tenant-scoped hash-chain audit plus HMAC row-signing foundation implemented; WORM/durable backend still missing | Local files can still be deleted or rolled back | Durable append-only/WORM-backed audit store with key rotation |
| Spend approval | Spend approval request/approve/reject API, production trial approval gate, idempotency, admin approval UI, and manual live payment reconciliation foundation implemented | Workflow is still too basic for enterprise approval policy, escalation, and review evidence | Richer approval queue, escalation rules, approval evidence export, and scheduled live payment reconciliation |
| Webhooks | Stripe signature verification, event replay detection, tenant-scoped payment event store, payments API, and retrieve-based reconciliation foundation implemented | Live deployed endpoint, secret rotation, scheduled reconciliation, and distributed event backend remain | Deployed live-mode webhook, rotated secrets, reconciliation jobs, out-of-order handling |
| Security headers/CORS/CSRF | Middleware header/CORS baseline, CSP report-only foundation, HSTS production header, and session-CSRF mutation protection implemented and unit-tested | Policy still needs deployed-environment verification and formal security review before CSP enforcement | Deployed security scan, CSP telemetry review/enforcement, shared rate/CSRF review, and security signoff |
| API contract | OpenAPI 3.1 contract foundation, release validation, runtime API version headers/rejection, and pagination foundation for primary list APIs implemented; full governance policy still incomplete | Client integrations can drift if contract is not maintained | Formal deprecation windows, generated client validation, and deployed contract tests |
| Rate limits | Tenant/principal-aware mutation-route limiter and production shared-backend config gate implemented | Enforcement remains local until wired to the configured shared backend | Shared backend enforcement, multi-instance verification, and abuse dashboards |
| Env validation | `npm run prod:check` and `/api/ready` production config gates implemented | Platform deployment must still wire real secrets and prove ready state in production | Deployment-specific config validation and production smoke evidence |
| Observability | `/api/ready`, RBAC metrics endpoint, guarded alerts/SLO/incident endpoints, telemetry export foundation, redacted event/counter foundation, alert thresholds, on-call metadata, and runbooks implemented | Metrics/logs/alerts/SLOs/incidents remain foundation-level without external paging, tickets, or dashboards | External log/metric shipping automation, dashboards, paging/ticketing integration, incident process, and SLO program |
| Compliance | Threat model, retention/legal-hold preview, signed export bundle foundation, and runbooks implemented as foundations | Legal-approved policies, immutable export storage, purge approvals, and auditor packages remain | Legal/compliance review, immutable export storage, approved purge workflows |
| Deployment | Hardened Dockerfile, `.dockerignore`, CI workflow, dependency audit, container release preflight, release manifest, rollback runbook, and example manifest implemented | No actually signed/published/scanned image or deployed production environment proof yet | Execute image build/sign/scan, platform manifests, rollback automation, deployed smoke |
| Demo proof | Some proof artifacts can be stale vs current render | Overclaiming live proof | Fresh matched provenance for live claims |

## First Implementation Priorities

1. P1 production safety baseline: security headers, CORS, rate limit, env validation, readiness endpoint.
2. P2 auth/tenant/RBAC route enforcement.
3. P3 durable store/audit chain.
4. P4 approval workflow and Stripe webhook correctness.
5. P5 deployment/observability/compliance package.

## Completion Rule

Do not call Agent IC production-ready until every blocker above has an implemented fix and authoritative verification evidence.

## P1 Progress

Implemented baseline controls:

- Security headers: `x-content-type-options`, `x-frame-options`, `referrer-policy`, `permissions-policy`, cross-origin policies.
- CORS preflight handling for API routes.
- In-memory mutation-route rate limiting as a first baseline; production should replace/augment this with a shared tenant-aware limiter.
- `lib/productionConfig.js` validates production env blockers.
- `/api/ready` reports readiness without exposing secrets.
- `npm run prod:check` fails closed when production config is incomplete.

Remaining blockers from this audit still stand: auth, tenancy, durable store, tamper-evident audit, approval workflow, observability/runbooks, compliance posture, and production deployment hardening.

## P1 Validation Evidence

Latest P1 validation run:

- `npm run lint` — passed.
- `npm test` — passed 12/12 tests, including production config, readiness route, middleware security headers, CORS, and rate limiting.
- `npm run build` — passed; build output includes `/api/ready` and Middleware.
- `npm run prod:check` — passed in development mode and fails closed in production-mode tests.
- Fresh dev server on port 3002:
  - `AGENT_IC_BASE_URL=http://localhost:3002 npm run smoke:api` — passed readiness, security headers, CORS preflight, proof report, and route edge checks.
  - `AGENT_IC_BASE_URL=http://localhost:3002 npm run smoke:browser` — passed.
  - `AGENT_IC_BASE_URL=http://localhost:3002 npm run smoke` — passed full governed trial, latest run `trial_1782181878125_u0jvym`.

P1 is complete as a foundation milestone. The full production-ready objective remains incomplete until auth/tenant isolation, durable storage, tamper-evident audit, approval workflow, observability/runbooks, compliance posture, and production deployment hardening are implemented and verified.

## P2 Progress

Implemented foundation controls:

- `lib/rbac.js` defines production roles (`owner`, `procurement_admin`, `finance_approver`, `security_reviewer`, `operator`, `auditor`) plus legacy demo aliases.
- `lib/authz.js` parses principal context, fails closed in production mode, supplies demo principal only outside production, checks permissions, and rejects cross-tenant requests.
- API guards applied to enterprise trials, renewals, proof reports, live traces, and event streams.
- Tests prove unauthenticated production requests fail, wrong roles fail, and cross-tenant requests fail.

Remaining P2 blockers:

- Replace header-based adapter with real OIDC/SAML/JWT/session validation.
- Production tenant registry/org selector foundation is implemented, but must move to a production DB and IdP-backed org lifecycle.
- Replace local/demo token entry with SSO-backed browser sessions and logout.
- SCIM/IdP membership lifecycle sync foundation is implemented; add deployed IdP tests and cross-tenant integration tests against the production data backend.

## P2 Validation Evidence

Latest P2 validation run:

- `npm run lint` — passed.
- `npm test` — passed 20/20 tests, including auth principal parsing, production fail-closed behavior, role checks, tenant-scope violation checks, and guarded enterprise-trial route failures.
- `npm run build` — passed with middleware and guarded API routes.
- Fresh dev server on port 3003:
  - `AGENT_IC_BASE_URL=http://localhost:3003 npm run smoke:api` — passed.
  - `AGENT_IC_BASE_URL=http://localhost:3003 npm run smoke:browser` — passed.
  - `AGENT_IC_BASE_URL=http://localhost:3003 npm run smoke` — first attempt hit external Nemotron timeout, retry passed; latest run `trial_1782182472235_uwotmu`.
- `npm run prod:check` — passed in development mode.
- `git diff --check` — passed.

P2 foundation is substantially stronger: route-level auth/RBAC/tenant checks, signed JWT/JWKS validation, durable HttpOnly browser session exchange/logout, stored memberships, SCIM-shaped IdP lifecycle sync, and an admin organization selector now exist. Full P2 remains incomplete until OIDC/SAML redirect/callback or platform session middleware, deployed IdP validation, and production DB-backed tenant/user/org lifecycle are implemented.

## P3 Progress

Implemented foundation controls:

- `lib/auditStore.js` now appends tenant/user/role-scoped audit rows.
- Audit rows include `previousHash` and `hash` fields using stable SHA-256 hashing.
- When `AGENT_IC_AUDIT_SIGNING_KEY` is configured, audit rows are signed with HMAC-SHA256 metadata and `verifyAuditChain()` detects missing/mismatched signatures when signatures are required.
- `verifyAuditChain()` detects tampering, broken links, and signature failures.
- Proof report includes audit-chain verification summary.
- Events/proof audit reads are tenant-filtered.
- Enterprise trial completion, renewal seed/clear, and live-trace reset append audit rows.
- Tests prove tenant filtering, hash-chain verification, tamper detection, and route mutation audit append.

Remaining P3 blockers:

- Replace local JSONL/file store with durable production DB or WORM-capable audit backend.
- Add migrations and transactional trial/evidence/policy writes.
- Add backup/restore procedure and restore drill evidence.
- Add retention/legal-hold controls.

## P3 Validation Evidence

Latest P3 validation run:

- `npm run lint` — passed.
- `npm test` — passed 23/23 tests, including tenant-scoped hash-chain append, tamper detection, and mutation-route audit append.
- `npm run build` — passed.
- Fresh dev server on port 3004:
  - `AGENT_IC_BASE_URL=http://localhost:3004 npm run smoke:api` — passed and includes `audit-chain-proof`.
  - `AGENT_IC_BASE_URL=http://localhost:3004 npm run smoke:browser` — passed.
  - `AGENT_IC_BASE_URL=http://localhost:3004 npm run smoke` — passed, latest run `trial_1782182907218_k13nq5`.
- `npm run prod:check` — passed in development mode.
- `git diff --check` — passed.

P3 foundation is partially complete. It provides local tamper-evident audit semantics and route audit events, but full P3 remains incomplete until a durable database/WORM-capable audit backend with managed key rotation, platform database/object-store migrations, transactional evidence writes, backup/restore drill, and retention/legal-hold controls are implemented.

## P4 Progress

Implemented foundation controls:

- `lib/approvalWorkflow.js` stores tenant-scoped spend approval requests.
- `POST /api/approvals` supports `request`, `approve`, and `reject` actions with RBAC enforcement.
- `GET /api/approvals` lists tenant-scoped approvals for spend approvers.
- Production-mode `POST /api/enterprise-trial` requires `approvalId` and verifies tenant, case, status, and cap before executing.
- Approval request/decision and missing-approval blocks append audit events.
- Tests prove approval lifecycle, wrong-role denial, tenant scoping, and production trial approval requirement.

Remaining P4 blockers:

- Build approval queue UI.
- Expand policy envelope builder UI and review workflow.
- Expand idempotency/replay protection to Stripe webhook/payment operations.
- Add Stripe webhook verification and payment-state reconciliation foundation implemented; production webhook replay hardening and distributed store still required.
- Expand policy simulator coverage and make simulation mandatory in UI before activation.

## P4 Validation Evidence

Latest P4 validation run:

- `npm run lint` — passed.
- `npm test` — passed 26/26 tests, including approval request/approve lifecycle, wrong-role denial, and production trial approval requirement.
- `npm run build` — passed and includes `/api/approvals`.
- Fresh dev server on port 3005:
  - `AGENT_IC_BASE_URL=http://localhost:3005 npm run smoke:api` — passed and includes `approval-request-approve`.
  - `AGENT_IC_BASE_URL=http://localhost:3005 npm run smoke:browser` — passed.
  - `AGENT_IC_BASE_URL=http://localhost:3005 npm run smoke` — passed, latest run `trial_1782183360674_zqp3h8`.
- `npm run prod:check` — passed in development mode.
- `git diff --check` — passed.

P4 foundation is partially complete. Production-mode trials now require approved tenant-scoped spend approvals, but full P4 remains incomplete until approval queue UI, policy builder/versioning/diff review, Stripe webhook verification, and policy simulation are implemented.

## P5 Progress

Implemented foundation controls:

- `lib/observability.js` provides redacted structured events, counters, gauges, and Prometheus text export.
- `GET /api/metrics` is RBAC-guarded and supports JSON and Prometheus-style text.
- Audit, approval, and enterprise trial flows emit metrics/events.
- Initial production threat model: `PRODUCTION_THREAT_MODEL.md`.
- Initial runbooks under `docs/runbooks/`: provider outage, policy bypass, payment incident, audit restore.

Remaining P5 blockers:

- Production log shipping and dashboards.
- Alert thresholds and on-call escalation foundation implemented; external paging integration still required.
- CI-enforced lint/test/build/prod-check/security scan workflow foundation implemented; dependency audit/container scan still required.
- Deployment manifests and rollback automation.
- Formal incident review and compliance evidence process foundation implemented; external ticketing/compliance policy still required.

## P5 Validation Evidence

Latest P5 validation run:

- `npm run lint` — passed.
- `npm test` — passed 28/28 tests, including observability redaction and metrics route guard/export.
- `npm run build` — passed and includes `/api/metrics`.
- Fresh dev server on port 3006:
  - `AGENT_IC_BASE_URL=http://localhost:3006 npm run smoke:api` — passed and includes `metrics-endpoint`.
  - `AGENT_IC_BASE_URL=http://localhost:3006 npm run smoke:browser` — passed.
  - `AGENT_IC_BASE_URL=http://localhost:3006 npm run smoke` — passed, latest run `trial_1782183832243_rbgmbs`.
- `npm run prod:check` — passed in development mode.
- `git diff --check` — passed.

P5 foundation is partially complete. It provides local in-process observability, RBAC-guarded metrics and alerts endpoints, a threat model, and initial incident runbooks. Full P5 remains incomplete until telemetry export is wired to production observability backends, external paging/on-call is integrated, deployment manifests are hardened, and incident/compliance processes are operationalized.

## Signed Auth Progress

Implemented strengthening controls:

- Production mode now requires a valid signed bearer JWT by default.
- JWT claims include user (`sub`), `tenantId`, and `role`.
- Issuer/audience checks are supported when configured.
- Spoofable `x-agent-ic-user` / `x-agent-ic-tenant` / `x-agent-ic-role` headers are rejected in production unless `AGENT_IC_AUTH_ALLOW_TRUSTED_HEADERS=true` is explicitly set.
- Tests prove missing token, wrong role, cross-tenant, and spoofed-header failures.

Remaining auth blockers:

- Live JWKS URL fetch/cache foundation implemented; key rotation policy and platform OIDC middleware integration still required.
- Add SSO-backed browser session UI and organization selector.
- SCIM/IdP membership lifecycle sync foundation implemented; deployed IdP connector validation remains.

## Tenant Store Progress

Implemented foundation controls:

- `lib/tenantStore.js` provides a versioned store manifest with migration metadata.
- Tenant IDs are sanitized for path safety.
- Tenant collections are written with temp-file + rename atomic writes.
- `/api/ready` includes tenant-store health.
- Approvals, renewal ledger data, and completed trial/evidence summaries moved from flat/global or response-only paths to tenant-scoped store collections.
- Tests prove manifest creation, tenant path sanitization, tenant collection read/write, and approval workflow compatibility.

Remaining durable-store blockers:

- Replace local JSON store with a production DB.
- Formal local migration runner and schema registry foundation implemented; production database/object-store migrations still required.
- Move local tenant-store data to a production DB/object-store backend and add transactional writes across policy/user/membership/tenant/evidence records.
- Add backup/restore and retention/legal-hold controls.

## Tenant Store Validation Evidence

Latest tenant-store validation run:

- `npm run lint` — passed.
- `npm test` — passed 31/31 tests, including tenant store manifest, sanitized tenant path, atomic collection write/read, and approval workflow compatibility.
- `npm run build` — passed.
- Fresh dev server on port 3008:
  - `AGENT_IC_BASE_URL=http://localhost:3008 npm run smoke:api` — passed.
  - `AGENT_IC_BASE_URL=http://localhost:3008 npm run smoke:browser` — passed.
  - `AGENT_IC_BASE_URL=http://localhost:3008 npm run smoke` — passed, latest run `trial_1782184584738_f137dz`.
- `npm run prod:check` — passed in development mode.
- `git diff --check` — passed.

This advances P3 durable-store work but does not complete it. Approvals, renewal history, and completed trial/evidence summaries now use tenant-scoped atomic local storage; policy/user/membership data and full raw evidence still need durable production DB migration.

## Renewal Store Validation Evidence

Latest renewal tenant-store validation run:

- Renewal ledger now reads/writes tenant-scoped collections through `lib/tenantStore.js`.
- Trial orchestrator passes tenant/user context into renewal-cycle records.
- Renewal API routes seed/read/clear only the authenticated tenant's ledger.
- Tests prove tenant A renewal history is not visible to tenant B.

Remaining durable-store blockers remain: trial/evidence/policy/user/membership data, production DB, migrations, backup/restore, WORM audit backend, and transactional writes.

## Trial Store Validation Evidence

Latest trial-store validation run:

- `lib/trialStore.js` stores completed trial/evidence summaries in tenant-scoped collections.
- `GET /api/trials` lists or fetches tenant-scoped stored runs and is RBAC-guarded.
- `POST /api/enterprise-trial` records completed runs to the tenant store.
- Full smoke verifies the completed run can be retrieved from `/api/trials?runId=<runId>`.
- Tests prove stored trial records are masked, retrievable by same tenant, and invisible cross-tenant.

Remaining durable-store blockers: full raw evidence/blob storage, policy store, user/membership store, production DB adapter, platform migrations, transactional writes, backup/restore, and WORM audit backend.

## Policy Store Validation Evidence

Latest policy-store validation run:

- `lib/policyStore.js` stores tenant-scoped policy versions.
- Policy records include normalized envelope, version number, status, and SHA-256 policy hash.
- Active policy activation retires prior active policies for the same case.
- Policy diff reports spend cap, currency, allowed tool, network policy, blocked tool, and hash changes.
- Policy simulation returns 403-style blocked results for blocked tool, over-cap, or non-allowlisted attempts.
- `GET/POST /api/policies` is RBAC-guarded and tenant-scoped.
- Smoke verifies create, activate, and simulate actions.

Remaining policy-governance blockers: approval queue UI, policy builder UI, richer simulation coverage, idempotency/replay protection, Stripe webhook verification, and policy activation release workflow.

## Idempotency Validation Evidence

Latest idempotency validation run:

- `npm run lint` — passed.
- `npm test` — passed 39/39 tests, including idempotency replay/conflict for approvals and trial missing-approval responses.
- `npm run build` — passed.
- Fresh dev server on port 3013:
  - `AGENT_IC_BASE_URL=http://localhost:3013 npm run smoke:api` — passed.
  - `AGENT_IC_BASE_URL=http://localhost:3013 npm run smoke:browser` — passed.
  - `AGENT_IC_BASE_URL=http://localhost:3013 npm run smoke` — retry passed after one transient Nemotron empty response, latest run `trial_1782186713201_w4aiv6`.
- `npm run prod:check` — passed.
- `git diff --check` — passed.

Implemented foundation controls:

- `lib/idempotencyStore.js` stores tenant-scoped idempotency records with request fingerprints and response bodies.
- Approval request/decision routes replay identical idempotency-key requests and reject same-key/different-payload conflicts.
- Production trial route replays identical missing-approval responses and rejects same-key/different-payload conflicts before execution.
- Tests prove replay and conflict behavior.

Remaining idempotency blockers:

- Extend idempotency to Stripe webhook/payment reconciliation.
- In-progress request locking semantics implemented for local tenant-store idempotency.
- Add distributed/shared idempotency backend for multi-instance production deployments.

## Stripe Webhook Validation Evidence

Latest Stripe webhook validation run:

- `npm run lint` — passed.
- `npm test` — passed 42/42 tests, including Stripe signature verification, invalid signature rejection, event replay, and tenant-scoped payment event reads.
- `npm run build` — passed and includes `/api/stripe-webhook` and `/api/payments`.
- Fresh dev server on port 3014:
  - `AGENT_IC_BASE_URL=http://localhost:3014 npm run smoke:api` — passed; webhook smoke was skipped because no local `STRIPE_WEBHOOK_SECRET` is configured in this environment.
  - `AGENT_IC_BASE_URL=http://localhost:3014 npm run smoke:browser` — passed.
  - `AGENT_IC_BASE_URL=http://localhost:3014 npm run smoke` — passed, latest run `trial_1782187211157_qcvsv9`.
- `npm run prod:check` — passed in development mode.
- `git diff --check` — passed.

Implemented foundation controls:

- `POST /api/stripe-webhook` verifies Stripe signatures with `STRIPE_WEBHOOK_SECRET`.
- Invalid signatures fail closed with `400 stripe_signature_invalid`.
- Verified webhook events are stored tenant-scoped in `lib/paymentEvents.js`.
- Duplicate Stripe event IDs replay instead of duplicating payment state.
- `GET /api/payments` is RBAC-guarded and tenant-scoped.
- Production readiness config now requires `STRIPE_WEBHOOK_SECRET`.
- Tests prove valid signature record/replay, invalid signature rejection, and tenant-scoped payment event reads.

Remaining payment blockers:

- Stripe live-mode webhook endpoint deployment and webhook secret rotation.
- Payment-state reconciliation against Stripe retrieve API foundation implemented; scheduled reconciliation and deployed live-mode proof remain.
- Distributed/shared idempotency and payment event store.
- Webhook replay and out-of-order event handling.






## Incident Review / Alert Drill Validation Evidence

Implemented foundation controls:

- `lib/incidentReviewStore.js` stores tenant-scoped incident reviews and alert drills.
- `GET/POST /api/incidents` is guarded and tenant-scoped.
- Incident reviews capture title, severity, source alert, runbook, owner, summary, status, corrective actions, evidence metadata, and drill status.
- Incident create/update actions append audit rows.
- `/admin` includes an Incident Reviews panel with alert drill creation and close action.
- API smoke records and lists a drill incident.
- Browser smoke asserts the Incident Reviews panel renders.
- `docs/runbooks/incident-review.md` documents create, drill, close, and production boundaries.
- Tests prove store lifecycle, RBAC denial for low-privilege creation, tenant scoping, and close transitions.

Latest incident validation run:

- `node --test tests/incident-review.test.mjs tests/alerting.test.mjs` — passed 5/5 tests.
- `npm run lint` — passed.
- `npm test` — passed 84/84 tests.
- `npm run release:check` — passed: lint, tests (84/84), migrate apply/check, build including `/api/incidents`, prod config check, security scan, dependency audit, and release manifest.
- Fresh dev server on port 3028: initial safe-next mirror failed due `/tmp` quota; removed only `/tmp/agent-ic-*` safe mirror directories, then reran successfully.
  - `AGENT_IC_BASE_URL=http://localhost:3028 npm run smoke:browser` — passed and verified the Incident Reviews admin panel renders.
  - `AGENT_IC_BASE_URL=http://localhost:3028 npm run smoke` — passed full governed-trial smoke, latest run `trial_1782224784336_army5w`, `evidenceArtifacts: 2`.

Remaining incident-review blockers:

- Integrate with external ticketing/paging systems.
- Define incident review owners, compliance-approved postmortem policy, recurring alert/fire drill cadence, and production evidence retention.

## SLO / Error Budget Validation Evidence

Implemented foundation controls:

- `lib/slo.js` evaluates SLOs for governed trial success, audit integrity, Stripe webhook acceptance, and policy enforcement.
- `GET /api/slo` is RBAC-guarded and returns SLO summary, status, target, success ratio, and error-budget remaining.
- `/admin` includes an SLO + error budget panel.
- Browser smoke asserts the SLO panel renders.
- API smoke verifies `/api/slo` returns summary and SLO arrays.
- `docs/runbooks/slo-review.md` documents SLOs, review procedure, and production boundaries.
- Tests prove healthy, at-risk, breached, and guarded route behavior.

Latest SLO validation run:

- `node --test tests/slo.test.mjs tests/alerting.test.mjs tests/observability.test.mjs` — passed 8/8 tests.
- `npm run lint` — passed.
- `npm test` — passed 82/82 tests.
- `npm run release:check` — passed: lint, tests (82/82), migrate apply/check, build including `/api/slo`, prod config check, security scan, dependency audit, and release manifest.
- Fresh dev server on port 3027:
  - `AGENT_IC_BASE_URL=http://localhost:3027 npm run smoke:browser` — passed and verified the SLO + error budget admin panel renders.
  - `AGENT_IC_BASE_URL=http://localhost:3027 npm run smoke` — passed full governed-trial smoke, latest run `trial_1782224441085_vba5v0`, `evidenceArtifacts: 2`.

Remaining SLO blockers:

- Back SLOs with externally stored production metrics instead of in-process counters.
- Incident review and drill evidence foundation implemented; add dashboards, ownership, error-budget policy, incident-review cadence, and recurring alert/fire-drill evidence.

## Telemetry Export Validation Evidence

Implemented foundation controls:

- `lib/telemetryExport.js` builds redacted telemetry payloads containing metrics, recent events, and alert summaries.
- Telemetry export supports safe dry-run and POST to a configured HTTP(S) endpoint.
- Production mode requires HTTPS telemetry export endpoints.
- `GET/POST /api/telemetry/export` is guarded by metrics access and can dry-run or export telemetry.
- `/admin` includes a Telemetry Export panel with dry-run proof.
- Browser smoke asserts the Telemetry Export panel renders.
- `docs/runbooks/telemetry-export.md` documents configuration, manual dry-run/export, and production boundaries.
- Tests prove payload redaction, HTTPS enforcement, mocked POST export, optional bearer token handling, and guarded route behavior.

Latest telemetry validation run:

- `node --test tests/telemetry-export.test.mjs tests/alerting.test.mjs tests/observability.test.mjs` — passed 8/8 tests.
- `npm run lint` — passed.
- `npm test` — passed 79/79 tests.
- `npm run release:check` — passed after replacing a provider-shaped test fixture caught by static security scan: lint, tests (79/79), migrate apply/check, build including `/api/telemetry/export`, prod config check, security scan, dependency audit, and release manifest.
- Fresh dev server on port 3026:
  - `AGENT_IC_BASE_URL=http://localhost:3026 npm run smoke:browser` — passed and verified the Telemetry Export admin panel renders.
  - `AGENT_IC_BASE_URL=http://localhost:3026 npm run smoke` — passed full governed-trial smoke, latest run `trial_1782224073909_1dyu0n`, `evidenceArtifacts: 2`.

Remaining telemetry blockers:

- Wire `AGENT_IC_TELEMETRY_EXPORT_URL` to a real production observability backend.
- Automate periodic/streaming export instead of manual API-triggered export.
- Incident review workflow foundation implemented; add dashboards, paging integration, production SLO program, recurring incident review cadence, and alert drills.

## Alerting / On-call Validation Evidence

Implemented foundation controls:

- `lib/alerting.js` defines explicit alert rules for audit-chain failures, rejected Stripe webhooks, trial failures, policy bypass attempts, and recent error events.
- `GET /api/alerts` is RBAC-guarded and returns alert summaries, triggered rules, runbook pointers, severity, and on-call escalation metadata.
- Alert metadata redacts secrets from on-call channel/target configuration.
- `/admin` includes an Alerts + on-call panel with active alert counts, on-call target/channel, and triggered runbook links.
- Browser smoke asserts the Alerts + on-call panel renders.
- API smoke verifies `/api/alerts` returns a summary and rules array.
- Tests prove clear state, triggered thresholds, runbook pointers, route auth, and redaction.

Latest alerting validation run:

- `node --test tests/alerting.test.mjs tests/observability.test.mjs` — passed 5/5 tests.
- `npm run lint` — passed.
- `npm test` — passed 76/76 tests.
- `npm run release:check` — passed: lint, tests (76/76), migrate apply/check, build including `/api/alerts`, prod config check, security scan, dependency audit, and release manifest.
- Fresh dev server on port 3025:
  - `AGENT_IC_BASE_URL=http://localhost:3025 npm run smoke:browser` — passed and verified the Alerts + on-call admin panel renders.
  - `AGENT_IC_BASE_URL=http://localhost:3025 npm run smoke` — passed full governed-trial smoke, latest run `trial_1782223638829_nf32av`, `evidenceArtifacts: 2`.

Remaining alerting blockers:

- Ship metrics/events/alerts to an external observability backend.
- Integrate real paging/on-call tooling and escalation policies.
- Incident review workflow foundation implemented; add deployed dashboards, externalized SLOs, external ticketing, and production alert drills.

## Stripe Payment Reconciliation Validation Evidence

Implemented foundation controls:

- `POST /api/payments` now supports `action: reconcile` for spend approvers/owners.
- Reconciliation retrieves the Stripe Checkout Session via `retrieveCheckoutSession()`, compares provider state against the recorded webhook event, and stores a tenant-scoped reconciliation record.
- Reconciliation compares Checkout Session ID, payment status, session status, amount, and currency.
- Reconciliation records masked Stripe Checkout Session IDs only; raw session IDs and Stripe secrets are not returned or persisted in reconciliation records.
- Reconciliation appends audit rows for matched or mismatched Stripe state.
- `/admin` includes a Stripe Checkout Session ID field and Reconcile payment action in the Payment Events panel.
- Browser smoke now asserts the reconciliation field renders.
- Tests prove successful reconciliation, persisted reconciliation reads, mismatch detection, provider failure sanitization, tenant scoping, and secret/session-ID redaction.

Latest Stripe reconciliation validation run:

- `node --test tests/stripe-webhook.test.mjs` — passed 5/5 tests.
- `npm run lint` — passed.
- `npm test` — passed 73/73 tests.
- `npm run release:check` — passed: lint, tests (73/73), migrate apply/check, build, prod config check, security scan, dependency audit, and release manifest.
- Fresh dev server on port 3024:
  - `AGENT_IC_BASE_URL=http://localhost:3024 npm run smoke:browser` — passed and verified the admin reconciliation field renders.
  - `AGENT_IC_BASE_URL=http://localhost:3024 npm run smoke` — passed full governed-trial smoke, latest run `trial_1782223297823_l7h120`, `evidenceArtifacts: 2`.

Remaining payment blockers:

- Deploy a live-mode Stripe webhook endpoint and rotate webhook/API secrets.
- Add scheduled/background reconciliation and alerting for stale, out-of-order, or mismatched payment events.
- Move payment event/reconciliation state to a distributed production backend.






## Rate Limiting Validation Evidence

Implemented foundation controls:

- `lib/rateLimitPolicy.js` derives rate-limit identity from JWT claims, trusted tenant/user headers, and client IP fallback.
- Mutation route rate-limit keys now include tenant, user, role, method, and route.
- Successful and rejected mutation responses expose rate-limit headers including scope metadata.
- Production config now fails closed unless a shared rate-limit backend is configured via `AGENT_IC_RATE_LIMIT_BACKEND_URL`, `REDIS_URL`, or `UPSTASH_REDIS_REST_URL`.
- `docs/runbooks/rate-limiting.md` documents the current local limiter, shared-backend configuration, and production boundary.
- Tests prove tenant-aware isolation and production shared-backend config enforcement.

Latest rate-limit validation run:

- `node --test tests/production-readiness.test.mjs` — passed 8/8 tests.
- `npm run lint` — passed.
- `npm test` — passed 93/93 tests.
- `npm run release:check` — passed: lint, tests (93/93), OpenAPI check, migrate apply/check, build, prod config check with shared rate-limit backend requirement, security scan, dependency audit, container preflight, release manifest.
- Fresh dev server on port 3034: `AGENT_IC_BASE_URL=http://localhost:3034 npm run smoke:api` — passed.

Remaining rate-limit blockers:

- Wire the shared backend into deployed middleware/platform infrastructure.
- Verify multi-instance behavior under load.
- Add abuse dashboards and alerting from production rate-limit metrics.

## CSP / Security Header Validation Evidence

Implemented foundation controls:

- Middleware now emits `content-security-policy-report-only` with conservative directives for default source, frame ancestors, base URI, form action, object source, images, fonts, connect sources, scripts, and styles.
- Middleware emits `x-agent-ic-csp-mode: report-only` so operators do not confuse the foundation with enforced CSP.
- Middleware emits `strict-transport-security` in production/HTTPS contexts.
- CORS allowed headers include `x-agent-ic-csrf` for browser-session mutation protection.
- `docs/runbooks/security-headers.md` documents current headers, report-only mode, and the production boundary.
- Tests verify CSP report-only header content and HSTS production behavior.

Latest security-header validation run:

- `node --test tests/production-readiness.test.mjs` — passed 6/6 tests.
- `npm run lint` — passed.
- `npm test` — passed 91/91 tests.
- `npm run release:check` — passed: lint, tests (91/91), OpenAPI check, migrate apply/check, build, prod config check, security scan, dependency audit, container preflight, and release manifest.
- Fresh dev server on port 3032: `AGENT_IC_BASE_URL=http://localhost:3032 npm run smoke:api` — passed and included `security-headers` and `cors-preflight` in checked surfaces.

Remaining security-header blockers:

- Review CSP report-only telemetry in a deployed environment.
- Move from report-only to enforced CSP after nonce/hash strategy and third-party endpoint review.
- Complete formal deployed security review/signoff.


## API Version Header / Deprecation Policy Validation Evidence

Implemented foundation controls:

- Middleware adds `x-agent-ic-api-version: 2026-06-23.foundation-v1` to API responses.
- Middleware adds `x-agent-ic-api-deprecation-policy: no-removal-without-documented-successor`.
- Requests with unsupported explicit `x-agent-ic-api-version` fail closed with structured `400 unsupported_api_version`.
- OpenAPI documents the optional `x-agent-ic-api-version` header and exposes `x-agent-ic-deprecation-policy`.
- API smoke checks the version header and unsupported-version rejection.
- `docs/runbooks/api-versioning.md` documents the current version, headers, rejection behavior, and production governance boundary.

Latest API-version validation run:

- `node --test tests/openapi-contract.test.mjs tests/production-readiness.test.mjs` — passed 9/9 tests.
- `npm run openapi:check` — passed, version `2026-06-23.foundation-v1`.
- `npm run lint` — passed.
- `npm test` — passed 92/92 tests.
- `npm run release:check` — passed: lint, tests (92/92), OpenAPI check, migrate apply/check, build, prod config check, security scan, dependency audit, container preflight, release manifest.
- Fresh dev server on port 3033: `AGENT_IC_BASE_URL=http://localhost:3033 npm run smoke:api` — passed and included `api-version-header` and `api-version-reject` in checked surfaces.

Remaining API versioning blockers:

- Formal compatibility/deprecation windows and consumer notification process.
- Deployed contract tests and generated client/SDK validation if required by enterprise buyers.

## API Pagination Validation Evidence

Implemented foundation controls:

- `lib/pagination.js` provides shared `limit`/`cursor` parsing, max-limit clamping, deterministic array slicing, and response metadata.
- Primary list endpoints preserve existing array fields while adding `pagination` metadata.
- Pagination is applied to approvals, policies, trials, evidence, payments, memberships, tenants, and incidents list routes.
- OpenAPI now documents `limit` and `cursor` query parameters.
- `docs/runbooks/api-pagination.md` documents query parameters, response metadata, and covered endpoints.
- Tests prove helper behavior and paginated memberships route compatibility.

Latest pagination validation run:

- `node --test tests/pagination.test.mjs tests/openapi-contract.test.mjs` — passed 4/4 tests.
- `npm run lint` — passed.
- `npm test` — passed 90/90 tests.
- `npm run release:check` — passed: lint, tests (90/90), OpenAPI check, migrate apply/check, build, prod config check, security scan, dependency audit, container preflight, and release manifest.
- Fresh dev server on port 3031: `AGENT_IC_BASE_URL=http://localhost:3031 npm run smoke:api` — passed and included `openapi-contract` in checked surfaces.

Remaining API governance blockers:

- API version header/deprecation policy foundation implemented; formal deprecation windows and consumer notification still required.
- Deployed contract tests against a production-like environment.
- Generated client/SDK validation if required by enterprise buyers.

## OpenAPI / API Contract Validation Evidence

Implemented foundation controls:

- `lib/openapiSpec.js` defines a versioned OpenAPI 3.1 foundation contract for current Agent IC APIs.
- `GET /api/openapi` returns the contract without provider secrets and explicitly marks `x-agent-ic-production-ready: false`.
- `scripts/openapi-check.mjs` validates OpenAPI version, operation IDs, duplicate operation IDs, success/default responses, and secret-shaped strings.
- `npm run openapi:check` writes `.agent-ic/openapi.json` and is included in `npm run release:check`.
- API smoke verifies `/api/openapi` and confirms the contract does not claim full production readiness.
- `docs/runbooks/api-contract.md` documents contract validation and remaining production boundaries.

Latest OpenAPI validation run:

- `node --test tests/openapi-contract.test.mjs` — passed 2/2 tests.
- `npm run openapi:check` — passed, operationCount 43, pathCount 26, version `2026-06-23.foundation-v1`.
- `npm run lint` — passed.
- `npm test` — passed 88/88 tests.
- `npm run release:check` — passed: lint, tests (88/88), OpenAPI check, migrate apply/check, build including `/api/openapi`, prod config check, security scan, dependency audit, container preflight, and release manifest.
- Fresh dev server on port 3030: `AGENT_IC_BASE_URL=http://localhost:3030 npm run smoke:api` — passed and included `openapi-contract` in checked surfaces.

Remaining API contract blockers:

- Add formal backwards-compatible API versioning policy and deprecation process.
- Pagination foundation implemented for primary list endpoints; add deployed contract tests and ensure every future list endpoint uses the shared helper.
- Add generated client/SDK validation if enterprise buyers require it.

## Container Release Preflight Validation Evidence

Implemented foundation controls:

- `scripts/container-release-check.mjs` validates Dockerfile/.dockerignore hardening and writes `.agent-ic/container-release-preflight.json`.
- The preflight reports tool availability for Docker/Podman, Trivy, Syft, and Cosign without claiming a real image has been built or signed.
- The preflight records build, scan, SBOM, sign, and verify command plan for CI execution.
- `npm run container:check` is included in `npm run release:check`.
- `docs/runbooks/container-release.md` documents the required production image build/scan/SBOM/sign/verify/deploy sequence.
- Tests prove hardened Dockerfiles pass and unsafe Dockerfile/env-copy patterns fail.

Latest container preflight validation run:

- `node --test tests/container-release.test.mjs` — passed 2/2 tests.
- `npm run container:check` — passed and wrote `.agent-ic/container-release-preflight.json`; local tools detected Docker but not Trivy/Cosign/Syft, so actual scan/sign/SBOM execution remains unproven.
- `npm run lint` — passed.
- `npm test` — passed 86/86 tests.
- `npm run release:check` — passed: lint, tests (86/86), migrate apply/check, build, prod config check, security scan, dependency audit, container preflight, and release manifest.
- Fresh dev server on port 3029: first `AGENT_IC_BASE_URL=http://localhost:3029 npm run smoke` hit transient Nemotron empty-classification response; immediate retry passed full governed-trial smoke, latest run `trial_1782225108745_jap9pa`, `evidenceArtifacts: 2`.

Remaining deployment blockers:

- Execute the image build in CI and record the immutable digest.
- Attach vulnerability scan report, SBOM, signature verification, platform deployment manifest, and deployed smoke evidence.

## Release Gate Validation Evidence

Implemented foundation controls:

- `scripts/security-scan.mjs` scans source for raw provider secrets, dangerous DOM/eval patterns, and Docker/package release-gate requirements.
- `npm run security:scan` executes the static security scan.
- `npm run release:check` runs lint, tests, build, production config check, and security scan.
- `.github/workflows/production-readiness.yml` runs CI checks on push/PR.
- Dockerfile now uses a non-root `agentic` runtime user, avoids copying local demo/state artifacts, and includes a healthcheck.
- `.dockerignore` excludes env files, node_modules, .next, demo outputs, local state, and virtualenv artifacts.

Remaining release/deployment blockers:

- Dependency vulnerability audit enforcement with policy exceptions is implemented; keep policy exceptions reviewed and time-bound.
- Container build/scan/signing preflight implemented; actual build/publish/signing and vulnerability scan evidence still required.
- Add deployment manifests and rollback automation.
- Add production smoke tests against a deployed environment.

## Release Manifest Validation Evidence

Implemented foundation controls:

- `scripts/release-manifest.mjs` generates `.agent-ic/release-manifest.json`.
- Release manifest records package version, git commit/dirty state, release gate commands, production-readiness status, and SHA-256 hashes for key release artifacts.
- `npm run release:manifest` generates the manifest.
- `npm run release:check` now includes manifest generation.
- `docs/runbooks/deployment-rollback.md` defines deployment and rollback procedure.
- `deploy/production.manifest.example.json` documents required runtime controls/secrets for platform-specific deployment manifests.

Remaining release blockers: real platform deployment manifests, container image build/sign/scan, deployed-environment smoke tests, rollback automation, and release approval process.

## Dependency Audit Validation Evidence

Implemented foundation controls:

- `security/dependency-audit-policy.json` defines fail severities and allowed advisory exceptions.
- `scripts/dependency-audit.mjs` runs `npm audit --json --omit=dev` and fails on high/critical production dependency advisories unless explicitly allowed.
- `npm run security:audit` executes the dependency audit.
- `npm run release:check` and CI now include dependency audit.

Latest audit result: 0 production vulnerabilities, 0 blocking advisories.

Remaining blockers: executed container image vulnerability scanning/signing and deployed-environment release evidence.

## Operator UI Validation Evidence

Implemented foundation controls:

- `/admin` provides an auth-aware enterprise operations console.
- Admin console surfaces tenant/user/role context, readiness/proof state, audit-chain status, tenant-store health, approval queue, policy governance, stored trial evidence, and payment events.
- Operators can request/approve/reject spend approvals in the UI foundation.
- Security reviewers can create/activate/simulate policy versions in the UI foundation.
- Browser smoke verifies `/admin` renders key operator sections and screenshot artifact `.agent-ic/qa/admin-top-fold.png`.

Remaining UI blockers:

- Replace local token paste with enterprise SSO/OIDC session UI.
- Promote the organization selector foundation to a production DB/IdP-backed tenant lifecycle.
- Add richer approval queue workflow, policy diff review UI, and production evidence export UI.

## Raw Evidence Store Validation Evidence

Latest raw evidence validation run:

- `npm run release:check` — passed (lint, tests 44/44, build, prod config check, security scan, dependency audit, release manifest).
- Fresh dev server on port 3016:
  - `AGENT_IC_BASE_URL=http://localhost:3016 npm run smoke:api` — passed.
  - `AGENT_IC_BASE_URL=http://localhost:3016 npm run smoke:browser` — passed and includes `/admin`.
  - `AGENT_IC_BASE_URL=http://localhost:3016 npm run smoke` — passed, latest run `trial_1782188553192_e1fk6q`, `evidenceArtifacts: 2`.

Implemented foundation controls:

- `lib/evidenceStore.js` stores content-addressed evidence artifacts under tenant-scoped paths.
- Completed trials persist `trial-evidence` snapshots and `worker-results` raw result artifacts.
- `GET /api/evidence` lists artifacts by run ID or retrieves a single artifact, optionally including verified content.
- Artifact metadata includes kind, run ID, SHA-256, byte size, created-by, and created-at fields.
- Full smoke verifies evidence artifacts are recorded and retrievable after a governed trial.

Remaining evidence blockers:

- Replace local artifact files with production blob/object storage.
- Add retention/legal-hold policies for raw evidence.
- Add large-artifact streaming and malware/PII scanning where applicable.
- Add transactional writes with trial/audit/policy records.

## Backup Restore Validation Evidence

Implemented foundation controls:

- `lib/storeBackup.js` can create, verify, and restore tenant-store backup bundles.
- Backup bundles contain relative paths, bytes, SHA-256 hashes, base64 content, and a manifest hash.
- Restore refuses existing target roots unless explicitly overwritten.
- `npm run store:backup` exposes create/verify/restore CLI.
- Tests prove backup verification, restore, and tamper detection.
- `docs/runbooks/audit-restore.md` documents backup/verify/restore drill commands.

Remaining recovery blockers:

- Production backup schedule and off-host storage.
- Periodic restore drill against production-like durable backend.
- WORM audit backend restore procedure.
- Recovery time objective / recovery point objective validation.

## Retention Legal Hold Validation Evidence

Implemented foundation controls:

- `lib/retentionPolicy.js` stores tenant-scoped retention policy with default retention windows for audit, evidence, trials, payments, approvals, and policies.
- Legal holds can be created/released per resource type and resource ID.
- Retention evaluation is preview-only and marks resources as `retain`, `retain_legal_hold`, or `eligible_for_review`; no destructive purge is implemented.
- `GET/POST /api/retention` is RBAC-guarded and tenant-scoped.
- API smoke verifies retention preview is available.
- Tests prove expired resource eligibility, legal-hold protection, RBAC enforcement, and cross-tenant rejection.

Remaining retention blockers:

- Production legal-hold workflow UI and approvals.
- Destructive purge workflow with approval, export, and audit evidence.
- Integration with production object storage/WORM backend.
- Formal retention schedule review with legal/compliance stakeholders.

## Membership Store Validation Evidence

Implemented foundation controls:

- `lib/membershipStore.js` stores tenant-scoped user memberships and role assignments.
- `GET/POST /api/memberships` is guarded by `manage_users` and tenant scoped.
- Production auth can require `AGENT_IC_AUTH_REQUIRE_MEMBERSHIP=true`, forcing JWT claims to match an active stored membership.
- Production readiness config now requires membership enforcement in production mode.
- Tests prove membership upsert/list/deactivate, production auth membership requirement, role mismatch rejection, and cross-tenant membership API rejection.

Remaining identity blockers:

- Replace HS256 adapter with enterprise OIDC/SAML/JWKS provider validation.
- Replace local token/admin context with SSO-backed UI session and logout.
- SCIM/IdP sync foundation implemented; add production DB-backed user profiles, group mapping review, and deployed IdP validation.

## JWKS Validation Evidence

Implemented foundation controls:

- `lib/authz.js` supports RS256 JWT verification using configured JWKS JSON or JWKS file material.
- Issuer and audience checks apply to RS256 tokens.
- Existing HS256 test/development adapter remains available.
- Tests prove valid RS256 JWT acceptance and invalid JWKS key rejection.

Remaining OIDC/JWKS blockers:

- Live JWKS URL fetch/cache implemented; add key rotation policy and platform-provided OIDC middleware where available.
- SSO-backed browser session lifecycle.
- SCIM/IdP membership synchronization foundation implemented; deployed IdP validation remains.

## Live JWKS URL Validation Evidence

Implemented foundation controls:

- `lib/authz.js` now has async auth guards that can fetch JWKS from `AGENT_IC_AUTH_JWKS_URL`.
- JWKS fetch requires HTTPS in production mode.
- JWKS responses are cached by URL using `AGENT_IC_AUTH_JWKS_CACHE_MS`.
- Guarded API routes use async auth verification so live JWKS URL auth works at runtime.
- Tests prove remote JWKS fetch, cache reuse, and non-HTTPS rejection in production mode.

Remaining OIDC blockers:

- Key rotation policy and cache invalidation on key rollover.
- Platform OIDC/SAML redirect/callback or middleware integration for browser session creation.
- SCIM/IdP membership synchronization foundation implemented; deployed IdP validation remains.






## Audit Signing Validation Evidence

Implemented foundation controls:

- `lib/auditStore.js` signs new audit rows with HMAC-SHA256 when `AGENT_IC_AUDIT_SIGNING_KEY` is configured.
- Audit signatures cover the row hash plus signature metadata; raw signing keys are never stored in audit rows.
- `verifyAuditChain()` now verifies row hashes, previous-hash links, and audit signatures; it reports signature summary metadata.
- Production config now requires `AGENT_IC_AUDIT_REQUIRE_SIGNATURES=true` in production mode in addition to `AGENT_IC_AUDIT_SIGNING_KEY`.
- `.env.example` documents audit signing key, key ID, and signature enforcement controls.
- Tests prove signed rows are emitted, signing keys are not leaked, signature verification passes, and signature tampering is detected.

Latest audit-signing validation run:

- `node --test tests/audit-chain.test.mjs` — passed 4/4 tests.
- `node --test tests/production-readiness.test.mjs` — passed 5/5 tests with audit-signature production config enforcement.
- `npm run lint` — passed.
- `npm test` — passed 71/71 tests.
- `npm run release:check` — passed: lint, tests (71/71), migrate apply/check, build, prod config check, security scan, dependency audit, and release manifest.
- Fresh dev server on port 3023: `AGENT_IC_BASE_URL=http://localhost:3023 npm run smoke` — passed full governed-trial smoke, latest run `trial_1782222837795_bct2jd`, `evidenceArtifacts: 2`.

Remaining audit blockers:

- Replace local JSONL audit storage with WORM-capable or production append-only storage.
- Add managed signing-key rotation, historical key lookup, and external timestamp/notary support.
- Add deployed restore drill and auditor-facing verification package.

## Migration Runner Validation Evidence

Implemented foundation controls:

- `lib/migrationRunner.js` defines a formal migration registry with deterministic SHA-256 checksums for the current tenant-store domain schema foundation.
- `scripts/migrate-store.mjs` exposes `status`, `apply`, and `check` commands.
- `npm run migrate:apply` applies pending migrations idempotently; `npm run migrate:check` fails on pending migrations or checksum drift.
- `npm run release:check` now runs migration apply/check before build and production config validation.
- `/api/ready` reports migration status under `dependencies.migrations` without exposing secrets.
- `docs/runbooks/migrations.md` documents migration commands, release order, and the production boundary.
- Release manifest now records migration scripts and migration-runner artifacts.

Latest migration validation run:

- `node --test tests/migration-runner.test.mjs tests/tenant-store.test.mjs` — passed 9/9 tests.
- `npm run migrate:apply` — applied/verified `001_initial_tenant_store`, `002_domain_schema_registry`, and `003_release_migration_gate`.
- `npm run migrate:check` — passed with no pending migrations or checksum mismatches.
- `npm run release:check` — passed: lint, tests (70/70), migrate apply/check, build, prod config check, security scan, dependency audit, and release manifest.
- Fresh dev server on port 3022: first `AGENT_IC_BASE_URL=http://localhost:3022 npm run smoke` attempt hit a transient Nemotron empty-classification provider response; immediate retry passed full governed-trial smoke, latest run `trial_1782222485898_nfly97`, `evidenceArtifacts: 2`.

Remaining migration/storage blockers:

- Replace or back this local migration runner with production database migrations and object-store/WORM provisioning.
- Add transactional write boundaries across trial/evidence/policy/audit/payment records.
- Add rollback and restore-drill evidence for production-like storage.

## SCIM / IdP Membership Lifecycle Validation Evidence

Implemented foundation controls:

- `GET/POST /api/scim/v2/Users` exposes SCIM-shaped list and provision flows guarded by `AGENT_IC_SCIM_BEARER_TOKEN` and tenant-bound by `AGENT_IC_SCIM_TENANT_ID`.
- `GET/PUT/PATCH/DELETE /api/scim/v2/Users/{userId}` supports user lookup, replacement, patch-based role/status updates, and deactivation.
- SCIM provisioning writes through `lib/membershipStore.js`, validates Agent IC roles against `lib/rbac.js`, records display name, external ID, email metadata, SCIM source, sync timestamp, and active/inactive status.
- SCIM create/update/deactivate actions append tenant-scoped audit rows.
- Production config now requires `AGENT_IC_SCIM_BEARER_TOKEN` and `AGENT_IC_SCIM_TENANT_ID` in production mode.
- `.env.example` and `deploy/production.manifest.example.json` document the SCIM tenant/token controls.

Latest SCIM validation run:

- `node --test tests/scim.test.mjs tests/membership-store.test.mjs` — passed 6/6 tests.
- `npm run lint` — passed.
- `npm test` — passed 67/67 tests.
- `npm run release:check` — passed: lint, tests (67/67), build including `/api/scim/v2/Users` and `/api/scim/v2/Users/[userId]`, prod config check, security scan, dependency audit, and release manifest.
- Fresh dev server on port 3021: `AGENT_IC_BASE_URL=http://localhost:3021 npm run smoke` — passed full governed-trial smoke, latest run `trial_1782221854232_xk4naw`, `evidenceArtifacts: 2`.

Remaining SCIM/IdP blockers:

- Validate against a real enterprise IdP SCIM client and provider-specific PATCH/group payloads.
- Move SCIM users/memberships to a production DB with unique constraints and transactions.
- Add group-to-role mapping policy UI/review, per-tenant SCIM app credentials, token rotation, and cross-tenant integration tests against the production data backend.

## Browser Session Lifecycle Validation Evidence

Latest browser-session validation run:

- `node --test tests/session-lifecycle.test.mjs tests/authz.test.mjs` — passed 18/18 tests for the session foundation; after CSRF hardening, `node --test tests/session-lifecycle.test.mjs` passed 5/5 and `npm test` passed 64/64.
- `npm run lint` — passed.
- `npm test` — passed 63/63 tests.
- `npm run build` — passed and includes `/api/session`.
- Fresh dev server on port 3018:
  - `AGENT_IC_BASE_URL=http://localhost:3018 npm run smoke:browser` — passed for `/trial` and `/admin`, including browser session controls in the admin DOM.
- `npm run release:check` — passed: lint, tests (64/64), build, prod config check, static security scan, dependency audit, and release manifest.
- Fresh dev server on port 3019: `AGENT_IC_BASE_URL=http://localhost:3019 npm run smoke:browser` — passed for `/trial` and `/admin`.
- Fresh dev server on port 3020: `AGENT_IC_BASE_URL=http://localhost:3020 npm run smoke` — passed full governed-trial smoke, latest run `trial_1782221402347_g7ou1d`, `evidenceArtifacts: 2`.

Implemented foundation controls:

- `lib/sessionStore.js` creates random-token browser sessions, stores only SHA-256 token hashes, enforces active/expired/revoked status, and returns safe session metadata without raw tokens.
- `lib/authz.js` accepts the `agent_ic_session` HttpOnly cookie as a production auth source after bearer-token/JWKS verification and before demo fallback.
- `POST /api/session` exchanges a valid signed bearer/JWKS principal for an HttpOnly, SameSite=Lax browser session cookie and appends a session-created audit event.
- `GET /api/session` reports the current authenticated browser session, and `DELETE /api/session` revokes the stored session and clears the cookie.
- `agent_ic_csrf` is issued as a separate SameSite=Lax cookie; JSON mutation routes reject session-cookie requests without a matching `x-agent-ic-csrf` header.
- `/admin` exposes Create browser session, Check session, and Logout session controls while preserving the existing manual token path for local verification and automatically sends the CSRF header when present.
- Browser smoke asserts the admin session controls render.
- Tests prove session creation/authentication/revocation, production auth via session cookie, session API cookie exchange/logout, CSRF rejection/acceptance for session-authenticated mutations, and production refusal of unauthenticated session creation.

Remaining SSO/session blockers:

- Add OIDC/SAML redirect/callback or platform middleware that obtains the signed identity token from the enterprise IdP instead of manual token exchange.
- Move sessions/CSRF state to a production database/session store with rotation, idle timeout, device/session management, distributed revocation, and CSRF review under the deployed domain model.
- Bind session creation to IdP-managed organization selection and deployed SCIM/IdP membership lifecycle.

## Tenant Registry / Organization Selector Validation Evidence

Latest tenant-registry validation run:

- `npm run release:check` — passed: lint, 59/59 tests, production build, production config check, static security scan, dependency audit, and release manifest.
- Fresh dev server on port 3017:
  - `AGENT_IC_BASE_URL=http://localhost:3017 npm run smoke:browser` — passed for `/trial` and `/admin`, with QA artifacts refreshed under `.agent-ic/qa/`.
- `node --test tests/tenant-registry.test.mjs` — passed in the narrow validation run before the broad release gate.

Implemented foundation controls:

- `lib/tenantStore.js` supports root-scoped collections for global tenant registry state.
- `lib/tenantRegistry.js` can upsert, list, fetch, and deactivate tenant records with active/inactive status and update metadata.
- `GET/POST /api/tenants` is guarded by `manage_users`, returns masked auth context, and appends audit events for tenant upsert/deactivate actions.
- `/admin` now renders an Organization / Tenant selector and tenant display-name save flow backed by `/api/tenants` instead of only a free-text tenant field.
- Tests prove tenant registry upsert/list/deactivate behavior and RBAC guard enforcement for the tenants API.

Remaining tenant/org blockers:

- Replace the local root JSON registry with a production DB-backed organization table and formal migrations.
- Bind organizations to SSO/OIDC/SAML sessions and deployed SCIM/IdP tenant membership lifecycle.
- Add organization creation/deactivation approval workflows and richer cross-tenant integration tests against a production-like backend.


## Signed Evidence Export Validation Evidence

Implemented foundation controls:

- `lib/exportBundle.js` signs evidence export bundles with HMAC-SHA256 when `AGENT_IC_EXPORT_SIGNING_KEY` or audit signing fallback is configured.
- Export signatures cover the bundle hash plus signature metadata without storing raw signing keys.
- `verifyExportBundleSignature()` verifies signatures and detects signature/hash metadata tampering.
- Production config can require export bundle signatures with `AGENT_IC_EXPORT_REQUIRE_SIGNATURES=true`.
- `docs/runbooks/signed-export.md` documents signing configuration, verification, and immutable-storage boundary.
- Tests prove signature emission, secret non-leakage, content hash mismatch detection, and signature mismatch detection.

Latest signed-export validation run:

- `node --test tests/export-bundle.test.mjs tests/production-readiness.test.mjs` — passed 10/10 tests.
- `npm run lint` — passed.
- `npm test` — passed 93/93 tests.
- `npm run release:check` — passed: lint, tests (93/93), OpenAPI check, migrate apply/check, build, prod config check, security scan, dependency audit, container preflight, and release manifest.
- Fresh dev server on port 3035: `AGENT_IC_BASE_URL=http://localhost:3035 npm run smoke:api` — passed.

Remaining export/compliance blockers:

- Store signed export bundles in immutable/WORM object storage.
- Add key rotation and auditor-facing verification package.
- Add approved purge workflow that requires signed export evidence before destructive actions.

## Evidence Export Validation Evidence

Implemented foundation controls:

- `lib/exportBundle.js` builds tenant-scoped export bundles covering trials, evidence metadata, approvals, policies, payments, retention state, audit chain, and audit rows.
- `GET /api/export` is guarded by `export_evidence` and tenant-scoped.
- `/admin` includes a Compliance Export panel that generates and summarizes an export bundle.
- API smoke verifies export bundle hash and summary.
- Tests prove deterministic bundle hashing and RBAC/cross-tenant enforcement.

Remaining compliance export blockers:

- Export artifact signing foundation implemented; immutable storage remains.
- Redaction/profile options for external auditors.
- Export approval workflow before destructive purge.
- UI download/retention package workflow.

## In Progress Idempotency Lock Evidence

Implemented foundation controls:

- `lib/idempotencyStore.js` now supports `beginIdempotentRequest()` and `completeIdempotentRequest()`.
- Duplicate same-key/same-payload requests can return `idempotency_in_progress` while the first request is still processing.
- Approval and enterprise trial mutation routes use begin/complete idempotency semantics.
- Tests prove in-progress state, completed replay, and conflict behavior.

Remaining idempotency blockers: shared/distributed idempotency backend for multi-instance deployments and robust in-flight lock expiry/owner semantics.
