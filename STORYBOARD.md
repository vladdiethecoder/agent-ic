# Final Storyboard

Target runtime: 60-90 seconds.

## 0-5 Seconds: Ready State

The `/run` console opens clean with empty audit and trace panels. The operator clicks `Run service trial`.

Visual thesis: Agent IC is the enterprise control plane for buying agentic services with governed spend, policy, and quantified results.

## 5-18 Seconds: Service Trial Intake

The trial loads: an enterprise buyer is evaluating a complaint-triage agentic service on real public NHTSA ODI complaint rows. The UI shows the service under test, workload source, policy envelope, allowed tools, blocked paid enrichment path, and $100 test-mode trial cap.

## 18-30 Seconds: Live Evaluation

Hermes/NemoHermes dispatch or handoff records the worker-agent trial. Nemotron returns a decision-path request ID and readable rationale over the service trial, policy, and evidence plan.

## 30-40 Seconds: Stripe Envelope

Stripe creates and retrieves a test-mode Checkout Session for the governed trial envelope. The UI shows a masked `cs_test...` session, dollar-denominated cap metadata, client reference, and retrieval status. The UI must not show raw cents language.

## 40-52 Seconds: Worker-Agent Run And Policy Block

The complaint-triage service imports real NHTSA rows and routes them into technical, safety-review, and manual-review queues. The service attempts a paid enrichment/tool request above the allowed cap. NemoHermes/OpenShell blocks it with HTTP `403`, showing attempted dollars, cap, policy rule, and receipt.

## 52-68 Seconds: Evidence And Decision

Evidence cards show imported source row count, source URL/domain, artifact hash, measured runtime, routing coverage, human-review queue, and zero Agent IC policy incidents. The decision card explains whether the service earns the next cap and why.

## 68-82 Seconds: Reusable Playbook

The saved `SKILL.md` appears. The operator clicks `Run from playbook`, and a second governed service trial returns fresh receipts and its own decision payload.

## Outro

The QR page points to source and proof artifacts. The final caption states that provider calls and evidence hashes are captured for audit, while keys and long identifiers stay masked.
