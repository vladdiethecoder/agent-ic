# Agent IC Product Contract

This document freezes the acceptance criteria for Agent IC as an enterprise product prototype.

## Scope Boundary

Agent IC is a local-first Next.js product for governing enterprise trials of agentic services. The hardened product must support:

1. Agentic-service trial lifecycle
   - enterprise buyer and service under test
   - governed spend envelope
   - policy envelope and allowed tools
   - worker-agent run events
   - blocked action
   - imported evidence
   - renewal/expand/revise/kill decision
   - reusable playbook
2. Budget and spend governance
   - trial envelope in USD dollars
   - Stripe `unit_amount` / `amount_total` in cents internally only
   - no Stripe API call unless `STRIPE_SECRET_KEY` exists and `AGENT_IC_DEMO_MODE=false`
   - primary UI and captions present money in dollars
3. Evidence-based service evaluation
   - server-owned evidence gate logic
   - real or inspectable workload source for the primary submission path
   - source row count and hash
   - measured runtime/routing metrics
   - decisions cite imported evidence, policy receipts, and provider receipts
4. Blocked-action governance
   - final demo path shows at least one denied action before service expansion
   - blocked actions append an audit entry with the invariant that fired
   - out-of-policy tool requests return HTTP 403/409 and fail closed
5. Auditability
   - append-only durable local event log
   - reset/admin mutation requires explicit confirmation
   - no secrets or raw provider error dumps in audit rows
6. UI/product experience
   - polished run console at `/run`
   - explicit loading/error/empty/live states
   - proof cards instead of raw JSON walls on the primary UI
   - no local/private URL leakage in the submitted video
7. Validation
   - unit tests for pure decision/evidence/schema logic
   - route tests for API behavior and failure contracts
   - smoke test against a running server
   - rendered-video QA
   - frame-by-frame review with Kimi CLI or configured vision reviewer when available

## API Contracts

### `GET /api/health`

Returns readiness without exposing secrets.

Required success shape:

```json
{
  "ok": true,
  "app": "Agent IC",
  "proposalCount": 4,
  "defaultScenario": "agentic-service-complaint-triage-trial",
  "integrations": {
    "nemotron": false,
    "stripe": false,
    "demoMode": true
  }
}
```

Acceptance:

- Never includes env var values or provider keys.
- Does not mutate audit state.
- Returns a deterministic local readiness summary when live providers are absent.

### `POST /api/evaluate`

Input:

```json
{ "proposalId": "agentic-service-complaint-triage-trial" }
```

Success:

- HTTP 200
- returns `proposal`, `evaluation`, `audit`
- unknown proposal id returns HTTP 404 with a structured error
- malformed JSON returns HTTP 400
- body above size limit returns HTTP 413
- live Nemotron timeout/failure returns HTTP 200 with deterministic fallback unless strict live proof is requested
- live raw model text is omitted unless `AGENT_IC_DEBUG_MODEL=true`

### `POST /api/stripe-session`

Input:

```json
{ "proposalId": "agentic-service-complaint-triage-trial", "evaluation": { "decision": "CONTINUE" } }
```

Success in demo mode:

- HTTP 200
- `mode="demo"`
- `checkout.id` begins with `demo_checkout_`
- `checkout.amount_total` is cents internally
- `checkout.metadata.autonomous_spend_cap_dollars` is dollars

Success in Stripe API test mode:

- HTTP 200 only if Stripe returns a Checkout Session
- no API call when demo mode is true or key is absent
- forwards idempotency key if present
- line item `unit_amount` is cents
- metadata has proposal id, governance policy, and spend cap dollars

Failure:

- KILL decisions are rejected with HTTP 409
- unknown proposal id is HTTP 404
- malformed JSON is HTTP 400
- oversized body is HTTP 413
- Stripe errors are HTTP 502 with sanitized error text
- Stripe timeouts are HTTP 504 with sanitized error text

### `POST /api/run-capital-experiment-v8`

Input:

```json
{
  "proposalId": "agentic-service-complaint-triage-trial",
  "requireLiveProof": true
}
```

Success:

- returns the full governed service-trial payload
- includes `stripe`, `blocked`, `evidence`, `evidenceArtifacts`, `decision`, `hermesExecutionReceipt`, `providerReceipts`, and `auditRows`
- when `requireLiveProof=true`, fails closed if claimed live Nemotron, Stripe, Hermes/NemoHermes, or external policy proof is missing

### `POST /api/run-from-playbook`

Runs the saved Hermes playbook on a second governed service trial.

Success:

- returns `ranFromPlaybook=true`
- returns the playbook source and second mission id
- returns a fresh decision payload

### `GET /api/proof-report`

Returns masked proof receipts for judge/auditor inspection.

Success:

- includes masked request/session identifiers and SHA-256 hashes
- includes evidence source, row counts, and hashes
- includes Stripe test-mode create/retrieve metadata
- includes policy 403 status when recorded
- includes Hermes dispatch or SKILL.md package proof

## Edge-Case Matrix

| Area | Edge case | Expected behavior | Verification |
|---|---|---|---|
| Proposal lookup | unknown id | 404 structured error, no silent fallback | route test |
| Proposal lookup | missing id | default scenario only on explicit demo path | route test |
| JSON parsing | malformed JSON | 400 structured error | route test |
| Request size | oversized body | 413 structured error | route test |
| Numeric data | NaN/Infinity/negative budget fields | rejected or clamped before spend | unit + route test |
| Decision engine | budget lines sum | equals recommended budget | unit test |
| Evidence loader | public workload snapshot | row count/hash computed from source artifact | unit test |
| Evidence gate | weak route coverage | REVISE/KILL, no expansion | unit test |
| Audit | append IDs | stable unique monotonic IDs after restart/log read | unit test |
| Audit | reset | requires confirmation | route test |
| Audit | secret text | redacted before write/read | unit test |
| Stripe demo | no key | local test-mode shaped session only | route test |
| Stripe live | demo mode true | no network call | route test |
| Stripe live | KILL decision | 409, no network call | route test |
| Stripe live | cents conversion | dollars x 100 in `unit_amount` | route test |
| Nemotron | no key | deterministic evaluator | route test |
| Nemotron | provider timeout | deterministic fallback unless strict live proof | route test |
| Governance | out-of-policy tool request | HTTP 403/409 with audit entry; spend remains blocked | route test |
| UI | initial render | pre-run state visible before click | browser/vision |
| UI | service trial framing | no Atlas/case-study analytics framing in final path | browser/vision |
| Recorder | final video | no local/private text; no raw cents; real workload evidence visible | video QA |

## Acceptance Gates

Final product closure requires all gates below:

1. `npm test` passes.
2. `npm run build` passes.
3. `npm run smoke` passes against a running server.
4. `npm run smoke:browser` passes.
5. `npm run demo:video` passes.
6. Static scan finds no hardcoded secrets, `dangerouslySetInnerHTML`, `eval`, shell injection, or raw provider-key leaks in `app`, `components`, `lib`, and `scripts`.
7. Video QA confirms no local/private text, no raw cents, no Atlas primary-story language, no fake/demo markers, and no long silence.
8. Frame review confirms every sampled frame supports the governed agentic-service trial story.
9. Kimi CLI or configured vision review reports no blocking frame-by-frame issues when available.
10. README, validation checklist, storyboard, and proof contract match observed behavior.
