# Proof Contract

Agent IC is allowed to run safely in local rehearsal mode, but the final submission story must not depend on invented business outcomes.

## Rule

Real or inspectable inputs are required for the primary submission workload. Hard-coded outcomes are not allowed.

## Allowed Local Rehearsal Inputs

These may exist for development and tests:

- Local deterministic fallback proposals.
- Stripe test-mode or local demo Checkout objects.
- Local policy-gate fallback when strict live proof is not requested.
- Small fixed fixtures for route and unit tests.

These must be labeled as rehearsal or compatibility data and must not be the primary video proof.

## Primary Submission Inputs

The final demo must use a named, inspectable workload source. Current source:

- `data/nhtsa-complaints-run/complaints.json`
- Source metadata: `data/nhtsa-complaints-run/SOURCE.md`
- Workload: public NHTSA ODI vehicle complaint rows with VIN omitted or redacted.

## Outcomes That Must Be Computed

These values must originate from server-side logic, provider receipts, or the imported workload:

- Rows imported and source hash.
- Worker-agent routing counts.
- Human-review queue size.
- Measured import/runtime metrics.
- Spend envelope and Stripe test-mode receipt.
- Blocked action status, attempted amount, cap, and policy.
- Decision: `CONTINUE`, `REVISE`, or `KILL`.
- Next cap or renewal decision.
- Playbook ID and second-run result.
- Audit rows.

No React component may contain final outcome literals such as fixed row counts, fixed QA scores, fixed hours saved, fixed cost-per-case deltas, or a pre-decided `CONTINUE` verdict except when rendering values returned by the API.

## Vocabulary

Use these labels in the UI and narrative:

- Agentic service trial
- Worker agent under governance
- Enterprise buyer
- Governed spend envelope
- Stripe test-mode receipt
- Public workload evidence
- Policy-generated denial
- Replayable audit log
- Renewal / expand / revise / kill decision

Avoid in final submission surfaces:

- Mock result
- Fake checkout
- Simulated decision
- Demo numbers
- Synthetic ticket dataset
- Seeded case-study proof

## Demo Phrase

> "Agent IC does not sell the worker agent. It governs the service trial: budget, tools, policy, receipts, evidence, and the decision to expand or stop spend."
