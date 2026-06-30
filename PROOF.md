# Agent IC Runtime Proof Contract

Agent IC's product claim is specific: it governs a purchased or evaluated agentic service by issuing a spend envelope, enforcing tool policy, observing work, recording receipts, quantifying results, and deciding whether the service earns more budget or production access.

This file is a runtime proof contract for the product. It is not a marketing checklist and it does not allow provider claims without matching run evidence.

## Claim scope

- NVIDIA Nemotron is live only when `/api/enterprise-trial` records a NIM request id from that run.
- Stripe is a real API integration when the run records a Checkout Session receipt plus retrieve/status metadata. `cs_test...` sessions are safe non-production receipts and must never be described as live money movement.
- OpenShell is external sandbox proof only when the run records an OpenShell sandbox or HTTP 403 denial receipt. If OpenShell is unavailable, Agent IC may still enforce through the local deny-by-default policy gate, but the receipt must say policy-gate rather than sandbox enforcement.
- Hermes orchestration is live only when the run records a Hermes gateway, sandbox, or CLI receipt. Without that receipt, the product keeps a Hermes-compatible `SKILL.md` handoff package and labels it as a package.
- Workload evidence is valid only when the run cites source artifact names, row counts, hashes, and source metadata.
- Missing, malformed, unavailable, or unverified evidence must not silently produce an approved or proven result. Strict proof mode requires all core provider receipts: Stripe Checkout, Nemotron classification, OpenShell 403 enforcement, and Hermes dispatch.

## Audit surface

```bash
curl -s http://localhost:<port>/api/proof-report
```

Local validation uses the same proof surfaces while masking host details in screenshots or walkthroughs:

```bash
npm test
npm run build
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:api
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:browser
AGENT_IC_BASE_URL=http://localhost:<port> npm run proof:production-access
```

The proof report returns masked request/session ids, SHA-256 hashes, evidence artifact row counts, spend-envelope receipt state, policy status, and the Hermes dispatch or `SKILL.md` package hash. Stripe unit conversion remains an internal adapter check; the UI presents the governed envelope in dollars.

## Product proof requirements

- A governed run must show a buyer mission, vendor agent, contract at risk, spend envelope, approval state, allowed evidence read, denied action, evidence package, ROI formula, procurement decision, production-access decision, and renewal effect.
- Provider states must be truthful: `LIVE`, `RECORDED`, `NON-PRODUCTION RECEIPT`, `LOCAL POLICY`, `HANDOFF PACKAGE`, or `UNAVAILABLE`.
- A `cs_test...` Stripe object must remain labeled as non-production money movement and must block production-access approval.
- A local policy denial must not be called OpenShell sandbox proof.
- Deterministic classification or synthesis must stay labeled as deterministic, never as Nemotron reasoning.
- Public snapshots, checked-in fixtures, and illustrative renewal history must remain visually and programmatically distinguishable from observed trial evidence.
- Raw keys, full provider IDs, local workspace paths, and private account data must never appear in API responses or screenshots.
