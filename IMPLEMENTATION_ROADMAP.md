# Agent IC Implementation Roadmap

## 1. Gate

Implementation is gated until the user explicitly approves build work. These PRDs are the current source of truth.

## 2. Milestone 1: Service Trial Skeleton

- Create the Next.js app and dashboard shell.
- Implement agentic-service trial intake.
- Build static versions of buyer brief, service envelope, evidence ledger, decision memo, and playbook views.
- Add the spend envelope card, blocked-action banner, provider receipt strip, and saved playbook panel.
- Acceptance: the whole storyboard can be clicked through without integrations, including the blocked-action beat.

## 3. Milestone 2: Runtime Contract

- Define the service-trial state model: buyer, service, envelope, policy, run events, blocked event, workload evidence, decision, playbook.
- Implement an orchestrator that emits timeline events for the public workload evidence scenario.
- Add deterministic rehearsal mode that is clearly labeled outside the final proof path.
- Acceptance: one command starts the app and produces a complete governed service trial.

## 4. Milestone 3: Governance and Approval

- Add policy envelope generation.
- Add explicit approval gate for spend/provisioning.
- Add blocked, approved, denied, and failed event states.
- Execute or replay one denied service/tool request and surface it in the UI and audit log.
- Acceptance: over-budget and denied actions fail closed and appear in the audit trail; the blocked-action beat is rehearseable.

## 5. Milestone 4: Live Integrations

- Connect Hermes/Nemotron for one or more reasoning steps.
- Connect Stripe non-production or approved live spend/provisioning path.
- Add integration status checks and honest blocked states.
- Acceptance: a successful rehearsal shows real provider evidence without exposing secrets.

## 6. Milestone 5: Productivity Evidence and Memo

- Implement transparent productivity and cost formulas from workload receipts.
- Generate evidence-backed kill/continue/revise memo.
- Treat the memo as an operating packet: decision, receipts, audit summary, and next gate.
- Add copy/export path for the memo and board packet.
- Acceptance: final recommendation cites source rows, routing coverage, review queue, spend, policy incidents, and provider receipts; packet is forwardable.

## 7. Milestone 6: Product Polish

- Tighten UI for recording.
- Keep the final scenario on agentic-service procurement with public workload evidence.
- Rehearse the blocked-action beat until it is presenter-safe.
- Run full rehearsal loop.
- Record a 60-90 second proof video.
- Prepare product launch notes and enterprise evaluation materials.

## 8. Verification Checklist

- Local app starts cleanly.
- Agentic-service trial completes.
- Spend cannot occur without approval.
- Budget cap is enforced.
- Missing credentials fail closed.
- Audit log and workload evidence ledger agree.
- Final memo is generated.
- No secrets appear in UI or logs.
- Final recording is under 3 minutes.
