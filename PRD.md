# Agent IC System PRD

## 1. Summary

Agent IC is a live hackathon demo for the Hermes Agent Accelerated Business Hackathon. It is a **governed capital account for autonomous work**: it receives a proposed agentic mission, approves a bounded spend envelope, runs or simulates a 72-hour micro-pilot under policy, blocks unsafe actions, imports measurable evidence, and issues a continue/revise/kill decision backed by an audit packet and a reusable Hermes playbook.

The submission thesis is: enterprises do not need another isolated AI agent; they need a governed function that decides which agents deserve capital, constrains how they spend it, and proves whether the work earned more.

## 2. Goals

- Deliver a 1–3 minute top-3-caliber demo showing an agent that can earn, spend, and run real operations under governance.
- Demonstrate a live **bounded capital experiment**: a micro-pilot receives a hard spend envelope, runs work, hits a policy block, imports evidence, and reaches a capital decision.
- Show Stripe-backed scoped spend, NVIDIA/Nemotron-backed reasoning or evaluation, and Hermes skill/memory reuse.
- Make the blocked-action beat visible: at least one out-of-policy tool request is denied before any live spend is authorized.
- Produce a clear audit trail: mission, hypothesis, envelope, policy, approvals, blocked events, evidence, ROI, and kill/continue decision.
- Save the learned procedure as a reusable Hermes playbook so the experiment ends with an operating asset, not just a memo.
- Keep the final recorded demo reliable enough to run fully live with rehearsed deterministic inputs.

## 3. Non-Goals

- Do not build a generic procurement platform.
- Do not build a full enterprise GRC suite.
- Do not support arbitrary real-money autonomous spending without explicit approval gates.
- Do not claim production compliance, SOC2 readiness, or real enterprise legal review.
- Do not claim live always-on agent execution unless credentials and environments are actually present.
- Do not build every possible enterprise function; one excellent micro-pilot controller is enough.

## 4. Target Users

- Primary: enterprise innovation, ops, or finance leader deciding which agentic pilots deserve capital and autonomy.
- Secondary: solo founder or operator who wants a framework for disciplined agent spending.
- Judge persona: Nous/NVIDIA/Stripe evaluators looking for usefulness, viability, and presentation.

## 5. Core Demo Scenario

The demo operator enters a messy request:

> "Resolve 100 Atlas Freight late-freight exception tickets this week with a governed Hermes agent. Keep spend under $100 and only continue if the pilot saves at least 10 support hours with zero critical incidents."

Agent IC:

1. Parses the request into a micro-pilot charter (mission, success metric, hard envelope).
2. Defines the policy envelope: allowed tools, spend cap, merchant/category restrictions, expiry.
3. Creates a Stripe Checkout authorization for the envelope with proposal metadata and governance tags.
4. Starts the pilot run: a deterministic or low-cost real service execution (seeded by default, real Browserbase/Make tier if credentials exist).
5. Blocks one out-of-policy action, such as an attempt to purchase a non-approved SaaS or exceed the per-authorization cap.
6. Imports evidence: cases processed, hours saved, cost incurred, quality/latency metric.
7. Makes a continue/revise/kill decision that cites the evidence, not model opinion.
8. Saves the learned review pattern as a reusable Hermes pilot-evaluation playbook.

## 6. Required Product Surface

- Proposal/mission intake form with one-click seeded examples.
- Spend envelope card showing mission, cap, approver, expiry, and policy rules.
- Blocked action banner that surfaces the denied tool request and the policy invariant that blocked it.
- Provider receipt strip showing Nemotron, Stripe, Hermes, and governance states.
- Live run timeline with agent actions, tool calls, policy checks, blocked events, and spend events.
- Approval modal for any spend/provisioning step.
- ROI ledger showing expected value, actual cost, confidence, and decision.
- Final memo view optimized for recording and sharing.
- Saved playbook panel showing the reusable Hermes procedure generated from the experiment.

## 7. Integrations

- Hermes Agent: orchestration, skills, memory/playbook reuse.
- NVIDIA/Nemotron: reasoning or evaluation path for mission analysis and evidence synthesis.
- NemoClaw/OpenShell-style governance: policy envelope, tool permissions, blocked-action enforcement, and runtime constraints.
- Stripe: scoped spend authorization via Checkout, session reconciliation IDs, spend controls, and ledger proof.
- Optional real micro-pilot execution: one low-risk SaaS/API path (e.g., Browserbase, Make) if credentials are available.

## 8. Hard Invariants

- No spend or provisioning occurs without visible user approval.
- Every spend-capable action has a budget, purpose, and audit log entry.
- At least one out-of-policy action is demonstrably blocked before any live spend is released.
- The system must preserve a complete event trail for the demo run.
- Kill/continue decisions must cite evidence, not just model opinion.
- The demo must never expose real secrets, cards, tokens, or private account data.
- The system must fail closed if credentials, policy, or payment steps are unavailable.

## 9. Success Metrics

- The 1–3 minute video clearly communicates the problem and the solution within the first 20 seconds.
- The demo shows a mission, a spend envelope, a governed approval, at least one blocked action, imported evidence, and a kill/continue decision.
- A judge can name the mission, envelope, blocked action, and evidence in one sentence after watching.
- The implementation can be rehearsed live from a clean starting state.
- All demo artifacts are reproducible from seeded data if external APIs fail during rehearsal.
- The demo ends with a visible saved Hermes playbook or operating packet.

## 10. Open Decisions

- Exact Stripe capability available: test payment, Link flow, Projects provisioning, MCP action, or ledger-only proof.
- Exact NVIDIA/Hermes access available in the local environment.
- Whether the final run uses a real external service under $100 or a deterministic seeded equivalent.
- Final product name: Agent IC, Pilot IC, or Agent Investment Committee.
