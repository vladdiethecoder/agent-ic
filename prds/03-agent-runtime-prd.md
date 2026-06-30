# PRD: Agent Runtime and Playbook Layer

## 1. Purpose

Define the execution layer that turns an agentic-service trial into a governed evaluation.

## 2. Responsibilities

- Parse enterprise service-trial requests.
- Generate trial charters and success metrics.
- Select tools/services required by the worker agent.
- Execute or coordinate the worker-service run.
- Synthesize evidence into a decision memo.
- Save reusable playbook steps for future pilots.

## 3. Required Workflow

1. Intake service trial.
2. Classify service type, buyer department, risk level, and likely value driver.
3. Generate hypothesis, metrics, kill criteria, and budget recommendation.
4. Build a plan with required actions and required approvals.
5. Request approval for any spend/provisioning-capable action.
6. Execute approved steps.
7. Collect outcome evidence.
8. Produce decision memo.
9. Save playbook summary.

## 4. Hermes Requirements

- Use Hermes-style skill decomposition for proposal analysis, pilot planning, evidence review, and memo writing.
- Persist the learned pilot-evaluation playbook in a form that can be shown in the UI.
- Make repeat runs visibly faster or more structured by reusing the playbook if feasible.

## 5. NVIDIA/Nemotron Requirements

- Use Nemotron or NVIDIA-hosted reasoning path where available for at least one core reasoning step.
- Log the model/provider used for evidence synthesis.
- Keep the UI honest if NVIDIA access is unavailable; no fabricated provider claims.

## 6. Decision Logic

The runtime must output one of:

- Continue: evidence meets or exceeds threshold within budget.
- Revise: partial evidence, missing data, or fixable failure.
- Kill: expected value does not justify continued spend or policy blocks execution.

Every decision must include:

- Evidence cited.
- Spend consumed.
- Expected ROI or savings.
- Confidence level.
- Next action.

## 7. Acceptance Criteria

- Given the default service trial, the runtime produces a complete charter, event stream, evidence summary, and decision memo.
- No spend-capable step can execute before approval.
- The final decision is deterministic enough for local rehearsal, while the proof path cites real or inspectable workload evidence.
- Errors become timeline events rather than silent failures.
