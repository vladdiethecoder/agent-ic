---
name: Bounded Capital Experiment Playbook
version: v1
proposal: atlas-freight-rma-copilot
kind: hermes-skill
author: Agent IC
---

# Bounded Capital Experiment Playbook

Reusable Hermes skill for governed capital experiments.

## Purpose

Encode the procedure Agent IC used to turn a pilot proposal into a governed capital experiment, so Hermes can replay it on similar missions.

## Inputs

- Normalized IC proposal (company, title, pain, ask, duration, evidence plan)
- Governance policy envelope (kill criteria, allowed tools, spend cap)
- Optional counterfactual overrides (QA agreement, envelope cap)

## Outputs

- Spend envelope with Stripe metadata
- Blocked-action audit entry for any out-of-policy tool request
- Evidence receipts (cases, QA, net value, incidents)
- CONTINUE / REVISE / KILL decision and next autonomy level

## Procedure

1. Load proposal and assert validity.
2. Score viability, governance, and evidence quality.
3. Create a bounded spend envelope and Stripe authorization.
4. Run the agent under NemoClaw / OpenShell network and credential policy.
5. Block any spend or tool call that breaches the envelope.
6. Import operational evidence.
7. Issue a capital decision and save a reusable playbook.

## Invariants

- No autonomous spend above the pre-authorized cap.
- Every tool call is scoped by proposal, budget line, approver, and expiry.
- Kill switch revokes tokens, freezes skills, and preserves the audit log.

## Example

```yaml
demo: atlas-freight-rma-copilot
  qa_agreement: 91
  envelope_cap: 100
  expected_decision: CONTINUE
```
