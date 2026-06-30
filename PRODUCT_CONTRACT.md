# Agent IC Product Contract

This document defines the acceptance contract for Agent IC as an enterprise procurement control plane for agentic services.

## Scope boundary

Agent IC must support:

1. **Agentic-service evaluation lifecycle**
   - enterprise buyer and vendor service under evaluation;
   - governed spend envelope;
   - policy envelope and allowed tools;
   - worker-agent run events;
   - at least one allowed action and one blocked action;
   - imported evidence;
   - renew, expand, revise, downgrade, cancel, or kill decision;
   - reusable Hermes-compatible playbook.
2. **Budget and spend governance**
   - evaluation envelope in USD dollars;
   - Stripe `unit_amount` / `amount_total` in cents internally only;
   - no production-spend claim from `cs_test...` receipts;
   - production spend requires production-mode credentials, authenticated principal, and approval evidence;
   - primary UI presents money in dollars.
3. **Evidence-based service evaluation**
   - server-owned evidence and decision logic;
   - real or inspectable workload source for the primary proof path;
   - source row count and hash;
   - measured runtime/routing metrics;
   - decisions cite imported evidence, policy receipts, and provider receipts.
4. **Blocked-action governance**
   - primary flow shows at least one denied action before service expansion;
   - blocked actions append an audit/proof receipt with the invariant that fired;
   - out-of-policy tool requests return HTTP `403`/`409` and fail closed.
5. **Auditability**
   - durable local event/proof logs;
   - reset/admin mutation requires explicit confirmation;
   - no secrets or raw provider error dumps in audit/proof rows.
6. **UI/product experience**
   - polished enterprise console at `/trial`;
   - explicit loading/error/empty/live states;
   - live run progress is sourced from server trace events or final receipts, not fabricated counters;
   - proof cards instead of raw JSON walls on the primary UI.
7. **Validation**
   - Node tests for pure decision/evidence/schema/proof logic;
   - route smoke checks for API behavior and failure contracts;
   - smoke test against a running server;
   - browser proof for desktop and mobile rendering;
   - security and release checks for public repo hygiene.

## API contracts

### `GET /api/health`

Returns readiness without exposing secrets.

Required success shape:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "services": {
    "nemotron": true,
    "stripe": true,
    "openshell": true
  }
}
```

Acceptance:

- Never includes env var values or provider keys.
- Does not mutate audit state.
- Returns a deterministic readiness summary when live providers are absent.

### `GET /api/enterprise-trial`

Success:

- HTTP 200.
- Returns the four enterprise vendor cases.
- Each case includes domain, buyer, vendor, data source, blocked action, and projected net value.
- Never exposes provider credentials.

### `POST /api/enterprise-trial`

Input:

```json
{
  "caseId": "safety-ops-complaint-triage",
  "missionStatement": "Evaluate RouteGuard AI before signing a contract."
}
```

Success:

- HTTP 200.
- Returns the full governed enterprise service-evaluation payload.
- Includes `stripe`, `spendApproval`, `productionAccessDecision`, `workerResult.evidence`, `policyBlock`, `decision`, `playbook`, `governance`, `roiMethodology`, and renewal context.
- Unknown case id returns HTTP 404 with a structured error.
- Missing mission and case id returns HTTP 400.
- Claimed live providers must have receipts; unavailable providers must be labeled honestly. When `requireLiveProof` is true, the trial must fail closed unless it has a Stripe Checkout receipt, Nemotron classification request id, verified OpenShell 403 policy receipt, and Hermes dispatch receipt.

### `GET /api/renewals`

Success:

- Returns accumulated vendor relationship evidence.
- Supports `?all=true` for all relationships and `?caseId=<id>` for a single vendor case.
- Does not expose secrets.

### `POST /api/renewals`

Actions:

- `{ "action": "seedIllustrative" }` creates explicitly labeled illustrative renewal history for product navigation.
- `{ "action": "clear" }` clears the local renewal ledger.
- Unknown action returns HTTP 400.

### `GET /api/live-trace`

Returns event-stream trace data for proof/debug surfaces.

### `POST /api/live-trace`

Reset requires explicit confirmation:

```json
{ "reset": true, "confirmReset": "AGENT_IC_TRACE_RESET" }
```

Missing confirmation returns HTTP 403.

### `GET /api/proof-report`

Returns masked proof receipts for auditor inspection.

Success:

- Includes masked request/session identifiers and SHA-256 hashes.
- Includes evidence source, row count, and hash.
- Labels Stripe `cs_test...` sessions as non-production receipts.
- Includes policy `403` status when recorded.
- Includes provider states without exposing credentials.

## Edge-case matrix

| Area | Edge case | Expected behavior | Verification |
|---|---|---|---|
| Case lookup | unknown id | 404 structured error, no silent fallback | route smoke |
| Evaluation input | missing mission and case id | 400 structured error | route smoke |
| JSON parsing | malformed JSON | 400 structured error | route smoke |
| Evidence loader | public workload snapshot | row count/hash computed from source artifact | unit + proof report |
| Evidence gate | weak route coverage | REVISE/KILL, no expansion | unit test |
| Audit/proof | secret text | redacted before read/write | unit + proof report |
| Stripe receipt | configured key | Checkout Session receipt is masked and dollar cap is shown in UI | smoke |
| Stripe unavailable | no key or local/offline mode | no production-spend claim; evaluation stays honestly labeled | proof report |
| Nemotron configured | NIM key present | sample classification receipts are recorded; synthesis is claimed only when a synthesis receipt exists | smoke |
| Nemotron unavailable | no key | strict live-proof claims fail closed or stay explicitly unclaimed | proof report |
| Governance | out-of-policy tool request | HTTP 403/409 with receipt; spend remains blocked | smoke |
| Approval | production spend approval | approved envelope id/status is carried into the trial record and renewal cycle | unit + smoke |
| Production access | missing live/provider/approval proof | `productionAccessDecision.approved=false` with blockers, no silent production approval | unit |
| Production config | production deployment | `AGENT_IC_REQUIRE_LIVE_PROOF=true`, live Stripe key prefix, and local provider-off modes disabled | production config test |
| UI | initial render | pre-run state visible before click | browser proof |
| UI | service evaluation framing | Agent IC remains the governance layer, not the vendor agent | browser proof |
| Runtime progress | in-flight status | sourced from live trace events or final receipt, not fabricated proof | browser/unit review |

## Acceptance gates

Product closure requires all gates below:

1. `npm test` passes.
2. `npm run lint` passes.
3. `npm run build` passes.
4. `npm run smoke` passes against a running server.
5. `npm run smoke:api` passes against a running server.
6. `npm run smoke:browser` passes against a running server.
7. Static scan/lint finds no hardcoded secrets, `dangerouslySetInnerHTML`, `eval`, shell injection, or raw provider-key leaks in `app`, `components`, `lib`, and `scripts`.
8. README, validation checklist, and proof contract match observed behavior.
