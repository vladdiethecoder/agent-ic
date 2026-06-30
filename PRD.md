# Agent IC System PRD

## 1. Summary

Agent IC is an enterprise solution for buying agentic services with governance. It gives an enterprise a controlled way to trial an outside or internal worker agent: approve a bounded spend envelope, restrict tools and data access, observe the service doing real work, block unsafe or over-budget actions, import evidence, and decide whether the service earns more budget or autonomy.

The product thesis is:

> Enterprises will not buy autonomous agents at scale without a control plane that governs spend, actions, evidence, and renewal decisions.

Agent IC is that control plane.

## 2. Goals

- Demonstrate an enterprise evaluating an agentic service before expanding spend.
- Show a governed service trial where the service receives a hard trial envelope, performs real work, hits a policy block, imports evidence, and receives a continue/revise/kill decision.
- Show Stripe-backed non-production spend authorization, NVIDIA/Nemotron-backed reasoning or evidence synthesis, Hermes skill/playbook reuse, and OpenShell/NemoHermes receipts only when observed; otherwise label local policy/playbook artifacts explicitly.
- Make the blocked-action beat visible: at least one out-of-policy tool or spend request is denied before the trial can expand.
- Produce a clear audit trail: buyer, service under test, mission, envelope, policy, approvals, blocked events, evidence, decision, production-access decision, and next cap.
- Save the learned service-evaluation procedure as a reusable Hermes playbook.

## 3. Non-Goals

- Do not build a generic procurement platform.
- Do not build the worker agent as the product.
- Do not present a dataset analysis as the product.
- Do not claim production compliance, SOC2 readiness, or real enterprise legal review.
- Do not claim live always-on agent execution unless credentials and environments are actually present.
- Do not support arbitrary real-money autonomous spending without explicit approval gates.

## 4. Target Users

- Enterprise innovation, operations, procurement, or finance leaders deciding which agentic services deserve budget and autonomy.
- Security and governance owners who need proof that agentic services can be constrained before they touch production systems.
- Enterprise evaluators reviewing governed agentic-service purchasing, proof quality, and operational fit.

## 5. Core Product Scenario

The enterprise operator evaluates an external complaint-triage agentic service:

> "Run a governed trial of this complaint-triage agentic service on real public NHTSA ODI complaint rows. Give it a $100 non-production work envelope, allow public-data reads and evidence generation, block paid enrichment above the cap, and only expand if the run produces measurable routing evidence with zero Agent IC policy incidents."

Agent IC:

1. Registers the service trial: buyer, vendor/service, mission, success metric, and hard envelope.
2. Defines the policy envelope: allowed tools, spend cap, merchant/category restrictions, data sensitivity, expiry, and human-review rules.
3. Creates a Stripe Checkout receipt for the governed trial envelope with proposal metadata and reconciliation fields.
4. Dispatches or hands off the work through Hermes/NemoHermes and records the service receipt.
5. Lets the worker service import and route real public NHTSA complaint rows.
6. Blocks one over-cap or unapproved paid enrichment/tool request with HTTP `403`.
7. Imports evidence: public rows processed, route coverage, safety-review queue, service runtime, provider receipts, and policy incidents.
8. Uses Nemotron to synthesize the run receipts into a decision rationale.
9. Issues `CONTINUE`, `REVISE`, or `KILL` and cites the evidence instead of model opinion alone.
10. Saves the review pattern as a reusable Hermes playbook and reruns it on a second service trial.

## 6. Required Product Surface

- Service trial intake showing buyer, service under test, workload, success metric, and spend envelope.
- Spend envelope card showing mission, cap, approver, expiry, and policy rules.
- Provider receipt strip showing Hermes/NemoHermes, Nemotron, Stripe non-production mode, and policy gate states.
- Live run timeline with worker-agent actions, tool calls, policy checks, blocked events, spend events, and evidence import.
- Blocked action banner that surfaces denied tool request, attempted amount, cap, and policy invariant.
- Evidence ledger showing imported source, row counts, hashes, measured runtime, route coverage, human-review queue, and policy incidents.
- Final decision memo optimized for recording and sharing.
- Saved playbook panel showing the reusable Hermes procedure generated from the trial.

## 7. Integrations

- Hermes Agent / NemoHermes: dispatch, skills, playbook reuse, and repeatable service evaluation workflow.
- NVIDIA/Nemotron: reasoning or evidence synthesis over the run receipts.
- NemoClaw/OpenShell-style governance: policy envelope, tool permissions, blocked-action enforcement, and runtime constraints.
- Stripe: scoped non-production spend authorization via Checkout, session reconciliation IDs, metadata, and ledger proof.
- Public evidence source: NHTSA ODI complaints API snapshot for the primary workload, with VIN omitted or redacted.

## 8. Hard Invariants

- No spend or provisioning-capable action occurs without visible policy and approval state.
- Every spend-capable action has a budget, purpose, and audit log entry.
- At least one out-of-policy action is demonstrably blocked before the service can earn more budget.
- Decisions must cite run evidence, not just model opinion.
- The product must never expose raw keys, cards, tokens, private account data, local ports, or private workspace paths.
- The system must fail closed if strict live proof is requested and any core receipt is unavailable: Stripe Checkout, Nemotron classification request id, verified OpenShell 403 enforcement, or Hermes dispatch.

## 9. Success Metrics

- A viewer can state the product in one sentence: "Agent IC governs agentic services before enterprises expand spend."
- The video shows a service trial, a spend envelope, live provider receipts, a blocked action, imported evidence, and a continue/revise/kill decision.
- The evidence comes from a real, inspectable workload source or an explicitly labeled local rehearsal fixture.
- The product walkthrough passes automated QA, frame-by-frame visual review, and Kimi/vision review when configured.
- The product flow ends with a visible saved Hermes playbook or operating packet that can be reused on another service trial.

## 10. Resolved Product Decisions

- Final product name: Agent IC.
- Primary product framing: enterprise control plane for purchasing and governing agentic services.
- Primary workload: real public NHTSA ODI complaint rows, used to evaluate a complaint-triage agentic service.
- Stripe mode: Checkout Session only; no production money movement.
- Live proof path: strict receipts are required whenever the product claims live provider behavior.
