# Agent IC Product Contract

This document freezes the acceptance criteria for taking Agent IC from a hackathon demo to a real product prototype. It is intentionally concrete: every item below must be backed by automated or visual verification before final delivery.

## Scope boundary

Agent IC is a local-first Next.js product for governed capital experiments on autonomous work. The hardened product must support:

1. Capital experiment lifecycle: mission → envelope → run → blocked action → evidence → decision → playbook
   - deterministic local evaluator always available
   - optional NVIDIA NIM/Nemotron live evaluator
   - no sensitive credentials returned to clients
   - deterministic fallback when live model fails
   - `/api/evaluate` returns `spendEnvelope`, `blockedEvent`, `providerReceipts`, and `hermesPlaybook`
2. Budget and spend governance
   - recommended pilot budget in USD dollars
   - autonomous spend cap in USD dollars
   - Stripe `unit_amount` / `amount_total` in cents only
   - no live Stripe call unless `STRIPE_SECRET_KEY` exists and `AGENT_IC_DEMO_MODE=false`
3. Evidence-based decision gates
   - server-owned ROI evidence gate logic
   - week 0/2/4/6/8 seeded evidence
   - kill/continue/observe decisions are reproducible
   - every decision cites imported evidence, not model opinion alone

4. Blocked-action governance
   - demo path shows at least one blocked/denied action before any spend is authorized
   - blocked actions append an audit entry with the invariant that fired
   - out-of-policy tool requests return HTTP 403/409 and fail closed
5. Auditability
   - append-only durable local event log
   - bounded event retention or file rotation
   - reset/admin mutation requires explicit demo admin confirmation
   - no secrets or raw provider error dumps in audit rows
6. UI/product experience
   - polished top fold, workbench, Stripe, evidence, governance, audit, storyboard states
   - explicit loading/error/empty/live-demo states
   - no raw JSON dumps or snake_case debug leaks on primary UI
7. Validation
   - unit tests for pure decision/evidence/schema logic
   - route tests for API behavior and failure contracts
   - smoke test against a production server
   - build/audit pass
   - visual QA on critical viewports
   - independent review before closure

## API contracts

### `GET /api/health`

Returns readiness without exposing secrets.

Required success shape:

```json
{
  "ok": true,
  "app": "Agent IC",
  "proposalCount": 3,
  "seededScenario": "atlas-freight-rma-copilot",
  "decision": "CONTINUE",
  "budget": 185000,
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
- Returns deterministic seeded decision.

### `POST /api/evaluate`

Input:

```json
{ "proposalId": "atlas-freight-rma-copilot" }
```

Success:
- HTTP 200
- returns `proposal`, `evaluation`, `audit`
- unknown proposal id returns HTTP 404 with a structured error
- malformed JSON returns HTTP 400
- body above size limit returns HTTP 413
- live Nemotron timeout/failure returns HTTP 200 with deterministic fallback and sanitized `liveError`
- live raw model text is omitted unless `AGENT_IC_DEBUG_MODEL=true`

### `POST /api/stripe-session`

Input:

```json
{ "proposalId": "atlas-freight-rma-copilot", "evaluation": { "decision": "CONTINUE" } }
```

Success in demo mode:
- HTTP 200
- `mode="demo"`
- `checkout.id` begins with `cs_test_agent_ic_`
- `checkout.amount_total` is cents
- `checkout.metadata.autonomous_spend_cap_dollars` is dollars

Success in live mode:
- HTTP 200 only if Stripe returns a Checkout Session
- no live call when demo mode is true or key is absent
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

### `GET /api/audit`

Success:
- HTTP 200
- returns `{ "audit": [...] }`
- reads durable event log
- newest first
- no secret values

### `POST /api/audit`

Allowed actions:
- append event with bounded fields
- reset only with `confirmReset="AGENT_IC_DEMO_RESET"`

Failure:
- malformed JSON HTTP 400
- oversized body HTTP 413
- reset without confirmation HTTP 403
- invalid event HTTP 400

## Edge-case matrix

| Area | Edge case | Expected behavior | Verification |
|---|---|---|---|
| Proposal lookup | unknown id | 404 structured error, no silent fallback | route test |
| Proposal lookup | missing id | default seeded id only for explicit demo path; otherwise documented behavior | route test |
| JSON parsing | malformed JSON | 400 structured error | route test |
| Request size | oversized body | 413 structured error | route test |
| Numeric data | NaN/Infinity/negative budget fields | rejected or clamped before spend | unit + route test |
| Decision engine | budget lines sum | equals recommended budget | unit test |
| Decision engine | autonomous cap | never exceeds recommended budget or governance tool cap | unit test |
| Evidence gate | week < 4 | OBSERVE unless hard breach | unit test |
| Evidence gate | week >= 4 and grade below B+ | KILL | unit test |
| Evidence gate | week >= 4 and grade B+ | CONTINUE unless net hard breach | unit test |
| Audit | append IDs | stable unique monotonic IDs after restart/log read | unit test |
| Audit | retention | bounded or rotated without corrupting new writes | unit test |
| Audit | reset | requires confirmation | route test |
| Audit | secret text | redacted before write/read | unit test |
| Stripe demo | no key | mock session only | route test |
| Stripe live | demo mode true | no network call | route test |
| Stripe live | KILL decision | 409, no network call | route test |
| Stripe live | cents conversion | dollars × 100 in `unit_amount` | route test |
| Stripe live | provider non-JSON | 502 sanitized error | route test |
| Stripe live | timeout | 504 sanitized error | route test |
| Nemotron | no key | deterministic evaluator | route test |
| Nemotron | malformed model JSON | deterministic fallback | route test |
| Nemotron | provider timeout | deterministic fallback with sanitized error | route test |
| Governance | out-of-policy tool request | HTTP 403/409 with audit entry; spend remains blocked | route test |
| Nemotron | raw model output | hidden unless debug env true | route test |
| Safe runner | path contains `#` | mirrors to guarded `/tmp/agent-ic-*` path | unit/CLI test |
| Safe runner | unsafe mirror root | refuses rsync delete target | unit/CLI test |
| UI | initial render | seeded verdict visible before clicks | browser/vision |
| UI | loading | buttons disabled / readable state | browser/DOM |
| UI | API error | readable error banner, no stack trace | browser/DOM |
| UI | KILL proposal | Stripe spend button disabled | browser/DOM |
| UI | mobile width | no nav/card clipping | screenshot/vision |

## Acceptance gates

Final product closure requires all gates below:

1. `npm test` passes.
2. `npm run build` passes.
3. `npm audit --json` reports zero vulnerabilities.
4. `npm run smoke` passes against production server.
5. API edge-case script passes against production server.
6. Static scan finds no hardcoded secrets, `dangerouslySetInnerHTML`, `eval`, shell injection, or raw provider-key leaks in `app`, `components`, `lib`, and `scripts`.
7. Browser/visual QA passes for top fold, workbench, evidence/Stripe, governance/audit/storyboard, and mobile viewport.
8. Independent reviewer reports no blocking security concerns or logic errors.
9. README, validation checklist, and storyboard match observed behavior.
10. `.hermes/atomic_ledger.md` records completed units and validation evidence.
