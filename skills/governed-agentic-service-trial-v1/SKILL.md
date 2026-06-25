---
name: governed-agentic-service-trial-v1
version: v1
proposal: agentic-service-complaint-triage-trial
kind: hermes-skill
author: Agent IC
---

# Governed Agentic Service Trial Playbook

Reusable Hermes-compatible skill for enterprise agentic-service procurement trials.

## Purpose

Encode the procedure Agent IC used to evaluate a third-party agentic service before enterprise expansion: grant a bounded trial envelope, run the service on inspectable workload evidence, block unsafe actions, and decide whether more capital is earned.

## Inputs

- Normalized service-trial proposal (buyer, service, workload, expansion ask, evidence plan)
- Governance policy envelope (kill criteria, allowed tools, spend cap)
- Inspectable workload artifact or source URL
- Optional counterfactual overrides (evidence confidence, envelope cap)

## Outputs

- Spend envelope with Stripe metadata
- Blocked-action audit entry for any out-of-policy tool request
- Evidence receipts (source rows, routing coverage, review queue, runtime, incidents)
- CONTINUE / REVISE / KILL decision and next autonomy level

## Procedure

1. Load proposal and assert validity.
2. Score service viability, governance fit, and evidence quality.
3. Create a bounded spend envelope and Stripe test-mode authorization.
4. Run the worker service under the configured policy gate; when NemoHermes/OpenShell is live, capture that broker receipt.
5. Block any spend or tool call that breaches the envelope.
6. Import and measure workload evidence.
7. Issue an expansion decision and save a reusable playbook.

## Invariants

- No autonomous spend above the pre-authorized cap.
- Every tool call is scoped by proposal, budget line, approver, and expiry.
- Kill switch revokes tokens, freezes skills, and preserves the audit log.

## Example

```yaml
trial: agentic-service-complaint-triage-trial
  workload: nhtsa-odi-public-complaints-snapshot
  source: NHTSA ODI public complaints API
  routing_coverage: 100
  envelope_cap: 100
  expected_decision: CONTINUE
```
