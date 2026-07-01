# Agent IC Runtime Proof Contract

Agent IC's product claim is specific: it governs a purchased or evaluated agentic service by issuing a spend envelope, enforcing tool policy, observing work, recording receipts, quantifying results, and deciding whether the service earns more budget or production access.

This file is a runtime proof contract for the product. It is not a marketing checklist and it does not allow provider claims without matching run evidence.

## Claim scope

- NVIDIA Nemotron is live only when `/api/enterprise-trial` records a NIM request id from that run.
- Stripe is a real API integration when the run records a Checkout Session receipt plus retrieve/status metadata. `cs_test...` sessions are safe non-production receipts and must never be described as live money movement.
- OpenShell is external sandbox proof only when the run records an OpenShell sandbox or HTTP 403 denial receipt. If OpenShell is unavailable, Agent IC may still enforce through the local deny-by-default policy gate, but the receipt must say policy-gate rather than sandbox enforcement.
- Hermes orchestration is live only when the run records a Hermes gateway, sandbox, or CLI receipt. Without that receipt, the product keeps a Hermes-compatible `SKILL.md` handoff package and labels it as a package.
- Workload evidence is valid only when the run cites source artifact names, row counts, hashes, and source metadata.
- Missing, malformed, unavailable, or unverified evidence must not silently produce an approved or proven result. Strict proof mode requires all core provider receipts: live-mode Stripe Checkout with matching retrieve/status metadata, provider-shaped Nemotron classification request id with internally consistent sample/accounting evidence, OpenShell 403 enforcement with sandbox id, OpenShell block receipt id, container-network-policy type, and `genuineExternal=true`, and a Hermes gateway/sandbox/CLI dispatch receipt with a correlated session/task id and, for local CLI/sandbox dispatch, output hash plus selected skill evidence.
- Production access additionally requires spend/access approval evidence correlated to the same case and spend cap, with an `appr_...` approval id, `finance_approver` decision role, and valid decision timestamp.
- Production access must remain denied unless both `trial-evidence` and `worker-results` artifacts persist with content-addressed SHA-256 metadata for the run.
- Trial responses must carry ROI methodology with named inputs, materialized baseline/agent costs, and a net-value formula whose value matches `baseline.totalCost - agent.totalCost`.
- Stored trial and proof-report summaries must retain ROI methodology formulas and materialized costs so renewal/export reviewers can audit the financial decision after the run; stored trial records without ROI methodology are invalid.
- Renewal cycles must retain ROI methodology so renewal, expansion, and cancellation recommendations remain financially auditable after the trial response is gone.
- Compliance export bundles must carry renewal relationships and renewal cycles with ROI methodology so offline auditors can inspect the recurring procurement decision, not just the first trial.
- Offline export verification must check semantic proof completeness, not only hash/signature integrity, so re-signed bundles missing trial, renewal, ROI, or production-access proof fields still fail.
- Trial result schema requires both sides of policy proof: a 2xx allowed-action receipt and a denied `403` blocked-action receipt.
- The OpenAPI contract must expose the same policy proof shape so API clients know a successful trial includes both the allowed action and denied action receipts.

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
`npm run proof:stripe` applies the same live-mode receipt standard: a live Checkout Session must have matching retrieve/status metadata and amount proof before it can be reported as live.
`npm run proof:production-access` rejects an approval unless the production-access decision carries all receipt booleans required by the runtime gate: correlated approval, persisted evidence artifacts, live Stripe receipt, Nemotron classification, verified OpenShell 403, Hermes receipt, and no policy bypass.
`npm run proof:policy` distinguishes local policy-gate enforcement from OpenShell sandbox proof; in strict-live mode it requires the verified OpenShell 403 receipt instead of accepting a local policy denial.
`npm run proof:nemotron` may report synthesis-only evidence, but strict-live proof requires the verified sample-classification receipt used by the production-access gate.

## Product proof requirements

- A governed run must show a buyer mission, vendor agent, contract at risk, spend envelope, approval state, allowed evidence read, denied action, evidence package, ROI formula, procurement decision, production-access decision, and renewal effect.
- Provider states must be truthful: `LIVE`, `RECORDED`, `NON-PRODUCTION RECEIPT`, `LOCAL POLICY`, `HANDOFF PACKAGE`, or `UNAVAILABLE`.
- A `cs_test...` Stripe object must remain labeled as non-production money movement and must block production-access approval.
- A local policy denial must not be called OpenShell sandbox proof.
- Deterministic classification or synthesis must stay labeled as deterministic, never as Nemotron reasoning.
- Public snapshots, checked-in fixtures, and illustrative renewal history must remain visually and programmatically distinguishable from observed trial evidence.
- Raw keys, full provider IDs, local workspace paths, and private account data must never appear in API responses or screenshots.
