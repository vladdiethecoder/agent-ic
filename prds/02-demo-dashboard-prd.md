# PRD: Demo Dashboard

## 1. Purpose

Provide a polished, recordable web interface for the Agent IC workflow.

## 2. Users

- Demo operator recording the submission.
- Hackathon judges watching the 1-3 minute video.

## 3. Core Views

- Intake: single proposal text area, budget limit, department, and seeded example selector.
- Charter: generated hypothesis, success metric, kill criteria, budget, and allowed tools.
- Run Timeline: chronological agent actions, policy checks, approval requests, spend/provisioning events, and evidence collection.
- Approval: modal or panel requiring explicit user approval before spend/provisioning.
- ROI Ledger: cost, value estimate, confidence, decision threshold, and final recommendation.
- Memo: concise board-style kill/continue decision.
- Playbook: reusable learned pattern for future pilot evaluations.

## 4. Interaction Requirements

- The first screen is the working product, not a landing page.
- Demo operator can run the whole scripted scenario with one seeded request.
- Live progress is visible through status chips, timestamps, and event rows.
- Approval states are unmistakable: pending, approved, denied, blocked.
- Final memo is visually distinct and ready for the closing shot.

## 5. Visual Requirements

- Professional enterprise SaaS style, dense but readable.
- No decorative marketing hero page.
- Avoid single-color monotony; use restrained color coding for risk, spend, policy, and ROI.
- Buttons must have stable dimensions and clear labels/icons.
- Text must fit at desktop and mobile recording sizes.

## 6. Data Requirements

- Proposal text.
- Pilot charter fields.
- Policy envelope.
- Spend budget and current spend.
- Timeline event stream.
- Evidence metrics.
- Decision memo.
- Reusable playbook summary.

## 7. Failure States

- Missing credentials: show blocked integration with clear reason and no fake success.
- Spend denied: continue to final memo with "blocked by policy" decision.
- External API failure: show failed evidence event and fail closed.
- Model timeout: preserve existing timeline and offer rerun.

## 8. Acceptance Criteria

- A viewer can understand the full workflow from the dashboard alone.
- The run timeline updates during execution or replay from captured live traces.
- Approval gating is visible before any spend/provisioning event.
- The final screen clearly shows kill/continue, ROI, spend, and evidence.

