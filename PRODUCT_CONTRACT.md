# Agent IC Product Contract

This document freezes the acceptance criteria for Agent IC as an enterprise product prototype and hackathon submission.

## Scope Boundary

Agent IC is a local-first Next.js product for governing enterprise trials of agentic services. The hardened product must support:

1. **Agentic-service trial lifecycle**
   - enterprise buyer and vendor service under test
   - governed spend envelope
   - policy envelope and allowed tools
   - worker-agent run events
   - blocked action
   - imported evidence
   - renewal/expand/revise/kill decision
   - reusable Hermes-compatible playbook
2. **Budget and spend governance**
   - trial envelope in USD dollars
   - Stripe `unit_amount` / `amount_total` in cents internally only
   - no production-spend claim; Stripe is presented as test-mode Checkout unless production capability is actually proven
   - primary UI and captions present money in dollars
3. **Evidence-based service evaluation**
   - server-owned evidence and decision logic
   - real or inspectable workload source for the primary submission path
   - source row count and hash
   - measured runtime/routing metrics
   - decisions cite imported evidence, policy receipts, and provider receipts
4. **Blocked-action governance**
   - final demo path shows at least one denied action before service expansion
   - blocked actions append an audit/proof receipt with the invariant that fired
   - out-of-policy tool requests return HTTP `403`/`409` and fail closed
5. **Auditability**
   - durable local event/proof logs
   - reset/admin mutation requires explicit confirmation
   - no secrets or raw provider error dumps in audit/proof rows
6. **UI/product experience**
   - polished enterprise trial console at `/trial`
   - explicit loading/error/empty/live states
   - proof cards instead of raw JSON walls on the primary UI
   - no local/private URL leakage in the submitted video
7. **Validation**
   - Node tests for pure decision/evidence/schema/proof logic
   - route smoke checks for API behavior and failure contracts
   - smoke test against a running server
   - browser proof for desktop and mobile rendering
   - rendered-video QA and frame review for final submission cuts

## API Contracts

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
- Returns the full governed enterprise service-trial payload.
- Includes `stripe`, `workerResult.evidence`, `policyBlock`, `decision`, `playbook`, `governance`, `roiMethodology`, and renewal context.
- Unknown case id returns HTTP 404 with a structured error.
- Missing mission and case id returns HTTP 400.
- Claimed live providers must have receipts; unavailable providers must be labeled honestly.

### `GET /api/renewals`

Success:

- Returns accumulated vendor relationship evidence.
- Supports `?all=true` for all relationships and `?caseId=<id>` for a single vendor case.
- Does not expose secrets.

### `POST /api/renewals`

Actions:

- `{ "action": "seed" }` creates deterministic demo renewal history.
- `{ "action": "clear" }` clears the local renewal ledger.
- Unknown action returns HTTP 400.

### `GET /api/live-trace`

Returns event-stream trace data for proof/debug surfaces.

### `POST /api/live-trace`

Reset requires explicit confirmation:

```json
{ "reset": true, "confirmReset": "AGENT_IC_DEMO_RESET" }
```

Missing confirmation returns HTTP 403.

### `GET /api/proof-report`

Returns masked proof receipts for judge/auditor inspection.

Success:

- Includes masked request/session identifiers and SHA-256 hashes.
- Includes evidence source, row count, and hash.
- Includes honest Stripe test-mode wording.
- Includes policy `403` status when recorded.
- Includes provider states without exposing credentials.

## Edge-Case Matrix

| Area | Edge case | Expected behavior | Verification |
|---|---|---|---|
| Case lookup | unknown id | 404 structured error, no silent fallback | route smoke |
| Trial input | missing mission and case id | 400 structured error | route smoke |
| JSON parsing | malformed JSON | 400 structured error | route smoke |
| Evidence loader | public workload snapshot | row count/hash computed from source artifact | unit + proof report |
| Evidence gate | weak route coverage | REVISE/KILL, no expansion | unit test |
| Audit/proof | secret text | redacted before read/write | unit + proof report |
| Stripe test mode | configured key | Checkout Session receipt is masked and dollar cap is shown in UI | smoke |
| Stripe unavailable | no key or demo mode | no production-spend claim; trial stays honestly labeled | proof report |
| Nemotron configured | NIM key present | sample classification and synthesis receipts are recorded | smoke |
| Nemotron unavailable | no key | strict live-proof claims fail closed or stay explicitly unclaimed | proof report |
| Governance | out-of-policy tool request | HTTP 403/409 with receipt; spend remains blocked | smoke |
| UI | initial render | pre-run state visible before click | browser proof |
| UI | service trial framing | no Atlas/case-study analytics framing in final path | browser proof |
| Recorder | final video | no local/private text; no raw cents; real workload evidence visible | video QA |

## Acceptance Gates

Final product closure requires all gates below:

1. `npm test` passes.
2. `npm run build` passes.
3. `npm run smoke` passes against a running server.
4. `npm run smoke:api` passes against a running server.
5. `npm run smoke:browser` passes against a running server.
6. Static scan/lint finds no hardcoded secrets, `dangerouslySetInnerHTML`, `eval`, shell injection, or raw provider-key leaks in `app`, `components`, `lib`, and `scripts`.
7. Final video generation and QA pass when preparing a new submission cut.
8. Video QA confirms no local/private text, no raw cents, no Atlas primary-story language, no fake-live markers, and no long silence.
9. Frame review confirms every sampled frame supports the governed agentic-service trial story.
10. README, validation checklist, storyboard, and proof contract match observed behavior.
