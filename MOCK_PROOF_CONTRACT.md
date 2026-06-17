# Mock Proof Contract

Agent IC uses seeded case-study inputs and sandbox providers so the demo is safe and reproducible. The mock must describe the **environment**, not the **outcome**.

## Rule

> Mock inputs are allowed. Hard-coded outcomes are not.

## Allowed mock / seeded data

These may be hard-coded because they are the case-study fixture:

- Company, mission, and pain description.
- Budget constraint and autonomy rules.
- Seeded dataset shape (e.g., 100 tickets).
- Allowed and blocked tool candidates.
- Loaded hourly cost and success thresholds.
- Stripe sandbox / test-mode environment.

## Outcomes that must be computed

These values must originate from server-side logic and be written to the audit log:

- `spent`, `blocked`, `auto-triaged`, `hours saved`.
- `gross value`, `net value`.
- `decision` (`CONTINUE`, `REVISE`, `KILL`).
- `next cap`, `playbook ID`.
- Audit rows.

No React component may contain final outcome literals such as `$35`, `$149`, `CONTINUE`, or `100 cases` except when rendering values returned by the API.

## Acceptance checklist

Before any demo is recorded or submitted, verify:

1. The UI starts from a pre-run state (no preloaded evaluation).
2. Inputs come from a named seeded fixture or sandbox response.
3. Outcomes are computed by `lib/decisionEngine.js`, `lib/proofEngine.js`, or provider adapters.
4. Every computed step appends an audit event.
5. The UI displays the source of each number.
6. A counterfactual input (e.g., QA threshold 82%) changes the decision.
7. The same seed reproduces the same result.

## Vocabulary

Use these labels in the UI and narrative:

- Seeded case study
- Stripe sandbox
- Deterministic evaluator
- Synthetic ticket dataset
- Computed evidence
- Policy-generated denial
- Replayable audit log

Avoid:

- Mock result
- Fake checkout
- Simulated decision
- Demo numbers

## Demo phrase

> "These are mock case-study inputs, not mock outcomes. The evidence, block, spend ledger, and decision are generated live by Agent IC. If I change the cap or evidence threshold, the decision changes."
