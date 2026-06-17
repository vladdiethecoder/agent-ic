# PRD: Governance and Spend Layer

## 1. Purpose

Provide policy, approval, budget, and audit controls for Agent IC.

## 2. Responsibilities

- Define the policy envelope for each pilot.
- Enforce budget limits.
- Gate spend/provisioning behind explicit approval.
- Record audit logs for every privileged action.
- Fail closed when policy or credentials are missing.

## 3. Policy Envelope

Each pilot must have:

- Maximum budget.
- Allowed tool/service categories.
- Blocked actions.
- Data sensitivity level.
- Required approval points.
- Kill criteria.
- Decision threshold.

## 4. Stripe Requirements

- Use Stripe test mode or approved live path for a visible spend/provisioning event.
- Record amount, purpose, approval status, and resulting artifact.
- Do not display private payment credentials or real secret values.
- If Stripe Projects or MCP integration is available, prioritize provisioning a low-risk service.
- If provisioning is unavailable, use a scoped payment/ledger event with test-mode proof.

## 5. NemoClaw/OpenShell-Style Requirements

- Represent allowed tools, data sources, and blocked actions as an explicit policy object.
- Display policy checks in the run timeline.
- Block any action outside the envelope.
- Emit a visible blocked event when policy prevents execution.

## 6. Audit Log Requirements

Every privileged event records:

- Timestamp.
- Actor.
- Action.
- Policy result.
- Approval state.
- Budget impact.
- External reference ID if available.

## 7. Acceptance Criteria

- A denied or over-budget action cannot proceed.
- The UI can show a complete audit trail for the seeded demo run.
- The ledger balance and event timeline agree.
- The system fails closed on missing keys, unavailable payment path, or policy mismatch.

