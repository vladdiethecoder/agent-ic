# PRD: Evidence and ROI Engine

## 1. Purpose

Convert pilot execution data into a credible business decision.

## 2. Responsibilities

- Define success metrics and kill criteria before execution.
- Collect evidence during the run.
- Estimate value, cost, confidence, and risk.
- Produce the final kill/continue/revise recommendation.

## 3. Evidence Types

- Cost evidence: spend, model/API usage, service fees, estimated labor.
- Quality evidence: task accuracy, reviewer score, failure rate, policy violations.
- Time evidence: setup time, execution time, estimated hours saved.
- Risk evidence: data sensitivity, tool risk, approval burden, policy blocks.
- Reuse evidence: whether a playbook was generated for future pilots.

## 4. ROI Model

The first version should use a transparent formula:

- Estimated weekly value = estimated hours saved * configured hourly cost.
- Pilot cost = actual spend + estimated operating cost.
- Payback estimate = pilot cost / estimated weekly value.
- Decision threshold = continue only if expected value exceeds configured threshold and policy risk is acceptable.

## 5. Decision Outputs

- Continue: proceed to next budget stage.
- Revise: change scope, tool, metric, or policy and rerun.
- Kill: stop spend and document why.

## 6. Memo Requirements

The memo must include:

- Executive summary.
- Evidence table.
- Budget and spend.
- ROI estimate.
- Risks and policy notes.
- Final recommendation.
- Next step.

## 7. Acceptance Criteria

- Decision recommendation can be traced back to evidence rows.
- The ROI model is simple enough to explain in the video.
- A negative or weak pilot can be killed without looking like a product failure.
- The memo is exportable or copyable for the submission writeup.

