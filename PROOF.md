# Agent IC Proof Contract

Agent IC is submitted as an enterprise agentic-service governance demo. The final video must show the product operating from `/trial` and must not expose local URLs, private workspace paths, raw keys, or full provider identifiers.

The product claim is specific: Agent IC governs a purchased or trialed agentic service by issuing a spend envelope, enforcing tool policy, observing real work, recording receipts, quantifying results, and deciding whether the service earns more budget.

## Claim Scope

- NVIDIA Nemotron is live only when the `/api/enterprise-trial` response includes a NIM request id from that run.
- Stripe is a real API integration in **test mode** when the receipt includes a `cs_test...` Checkout Session plus retrieve/status metadata. It is not production money movement.
- NemoHermes/OpenShell is external live proof only when the run records an external sandbox or OpenShell 403 receipt. The local policy gate is valid fallback proof of fail-closed policy logic, but it must be labeled as policy-gate proof rather than external sandbox proof.
- Hermes orchestration is claimed only when either `HERMES_AGENT_URL` returns a task id or `AGENT_IC_HERMES_NEMOHERMES_LIVE=true` dispatches a Hermes one-shot inside the configured NemoHermes sandbox and records a sandbox session id. Without one of those receipts, the product honestly shows a Hermes-compatible `SKILL.md` handoff package.
- Workload evidence is real or inspectable only when the run cites source artifact names, row counts, hashes, and source metadata. Pre-baked Atlas-style productivity numbers are not acceptable for the final submission claim.

## Judge Audit Surface

```bash
curl -s https://agent-ic.demo/api/proof-report
```

Local validation uses the same endpoint while masking host details in the video:

```bash
npm test
npm run build
npm run smoke
```

The proof report returns masked request/session ids, sha256 hashes, evidence artifact row counts, Stripe test-mode session metadata, policy 403 status, and the Hermes dispatch or `SKILL.md` package hash. Stripe unit conversion remains an internal adapter check; the submitted UI presents the governed envelope in dollars.

## Final Video Requirements

- A visible cursor clicks `Run service trial`.
- Provider states must be truthful: `READY`, `LIVE`, `TEST MODE`, `LOCAL PROOF`, or `HANDOFF READY`.
- `STRIPE LIVE` must not appear for `cs_test...` sessions.
- `HERMES_AGENT_URL not configured`, `[mock]`, `[fallback]`, `SIMULATED`, `localhost`, and private paths must not appear.
- The video must visibly frame the run as an enterprise evaluation of an agentic service, not a standalone analytics demo.
- The video must show imported workload source, row count, hash, service metrics, and policy result.
- Raw cents language must not appear in captions or primary UI.
- Atlas Freight may appear only in legacy docs/tests, not as the primary final video proof.
- The primary public submission video must fit the 1-3 minute submission window; the short strict-proof walkthrough may remain 60-90 seconds.
- The video is not complete until automated QA and frame review both pass.
