# Agent IC Implementation Roadmap

## 1. Gate

Implementation is gated until the user explicitly approves build work. These PRDs are the current source of truth.

## 2. Milestone 1: Demo Skeleton

- Create the Next.js app and dashboard shell.
- Implement the seeded proposal/mission intake.
- Build static versions of charter, timeline, ROI ledger, memo, and playbook views.
- Add the spend envelope card, blocked-action banner, provider receipt strip, and saved playbook panel.
- Acceptance: the whole storyboard can be clicked through without integrations, including the blocked-action beat.

## 3. Milestone 2: Runtime Contract

- Define the capital-experiment state model: mission, envelope, policy, run events, blocked event, evidence, decision, playbook.
- Implement a local orchestrator that emits timeline events for the seeded micro-pilot scenario.
- Add deterministic seeded run mode for rehearsals.
- Acceptance: one command starts the app and produces a complete bounded capital experiment.

## 4. Milestone 3: Governance and Approval

- Add policy envelope generation.
- Add explicit approval gate for spend/provisioning.
- Add blocked, approved, denied, and failed event states.
- Simulate one denied tool request and surface it in the UI and audit log.
- Acceptance: over-budget and denied actions fail closed and appear in the audit trail; the blocked-action beat is rehearseable.

## 5. Milestone 4: Live Integrations

- Connect Hermes/Nemotron for one or more reasoning steps.
- Connect Stripe test-mode or approved live spend/provisioning path.
- Add integration status checks and honest blocked states.
- Acceptance: a successful rehearsal shows real provider evidence without exposing secrets.

## 6. Milestone 5: ROI and Memo

- Implement transparent ROI formula.
- Generate evidence-backed kill/continue/revise memo.
- Treat the memo as an operating packet: decision, receipts, audit summary, and next gate.
- Add copy/export path for the memo and board packet.
- Acceptance: final recommendation cites evidence and ledger values; packet is forwardable.

## 7. Milestone 6: Submission Polish

- Tighten UI for recording.
- Add final seeded micro-pilot scenario content.
- Rehearse the blocked-action beat until it is presenter-safe.
- Run full rehearsal loop.
- Record 1–3 minute video.
- Prepare tweet, Discord submission link, and Typeform responses.

## 8. Verification Checklist

- Local app starts cleanly.
- Seeded scenario completes.
- Spend cannot occur without approval.
- Budget cap is enforced.
- Missing credentials fail closed.
- Audit log and ROI ledger agree.
- Final memo is generated.
- No secrets appear in UI or logs.
- Final recording is under 3 minutes.

