# Agent IC v18 — Full Rebuild Plan

## Executive Summary

Transform Agent IC from a single-shot complaint-triage demo into a real procurement control plane where Agent IC governs a genuine external worker agent inside NVIDIA OpenShell sandboxes, with monthly renewal cycles and finance-grade ROI.

**Deadline:** EOD June 30 2026. **Philosophy:** Quality over speed.

---

## Current State → Target State

| Dimension | Current (v17) | Target (v18) |
|-----------|--------------|--------------|
| Worker agent | Simulated harness inside Agent IC | Real external agent process making real API calls |
| Policy gate | Localhost proxy (127.0.0.1:9000) | NVIDIA OpenShell runtime (genuine engine enforcement) |
| Decision flow | Single trial → CONTINUE | Trial → evidence → monthly renewal → expand → accumulate |
| ROI | Deterministic from seeded data | Transparent methodology, every number traceable to a receipt |
| UI | Dark enterprise dashboard (dense) | Niche procurement/governance aesthetic, clean hero moments |
| Voiceover | ElevenLabs TTS (basic) | Higher-quality ElevenLabs voice/preset |
| Audit QR | Dead (github.com/agent-ic, 0 repos) | Stripped public repo pushed before submission |

---

## Phase 0: Foundation & Architecture Decisions (Day 1)

### 0.1 OpenShell Feasibility Assessment
- Research complete integration path for NVIDIA OpenShell on this Fedora x86_64 machine
- Determine: CLI-based vs REST API vs Python SDK
- Test: Can OpenShell enforce network-level policy (block specific outbound HTTP)?
- If OpenShell requires DGX Spark hardware: design alternative real-external policy broker
- **Deliverable:** Feasibility verdict + integration architecture document
- **Acceptance:** Clear yes/no on OpenShell, with concrete API contract if yes

### 0.2 Real Worker Agent Architecture
- Design a standalone worker agent process that:
  - Receives a mission via HTTP dispatch from Agent IC
  - Fetches real NHTSA ODI complaint data via the public API
  - Uses NVIDIA Nemotron (NIM) to classify/route each complaint
  - Attempts paid enrichment calls (CARFAX) that should be blocked
  - Reports evidence back to Agent IC
- Decide: Node.js worker vs Python worker vs Hermes Agent sub-process
- **Deliverable:** Worker agent interface spec (request/response contracts)
- **Acceptance:** Agent IC can dispatch a mission and receive structured results

### 0.3 Product Flow Redesign
- New end-to-end flow:
  1. Buyer submits problem statement ("Triage 330 vehicle safety complaints")
  2. Agent IC registers the service trial (buyer, service, mission, envelope)
  3. Agent IC creates OpenShell sandbox with policy (allowed tools, spend cap, network rules)
  4. Agent IC funds Stripe test-mode envelope ($100)
  5. Agent IC dispatches the real worker agent into the sandbox
  6. Worker processes complaints, makes real Nemotron classification calls
  7. Worker attempts CARFAX enrichment ($150) → OpenShell blocks with genuine 403
  8. Worker returns evidence (rows processed, routing, runtime, incidents)
  9. Agent IC imports evidence, runs Nemotron decision synthesis
  10. Agent IC issues CONTINUE with next cap, saves playbook
  11. Renewal view shows accumulating evidence across trial cycles
- **Deliverable:** Updated PRD with new flow, API contracts, state model

### 0.4 UI Design Direction
- Aesthetic: "Governance Ledger" — not cliche AI SaaS
  - Think: financial audit surface meets procurement control plane
  - Monospace accents for receipt/audit data (terminal/ledger authority)
  - Clean sans-serif for product surfaces
  - Color system: deep institutional navy/charcoal base, amber for financial, red for denied, green for governance pass
  - Every number has a source footnote or receipt link
  - Structured layouts that feel like procurement documents, not dashboards
- Design hero moments for: blocked action, decision, renewal
- **Deliverable:** Design system spec (colors, typography, component patterns)

---

## Phase 1: Real External Worker Agent (Day 2-3)

### 1.1 Worker Agent Service
- Create `worker/` directory with a standalone agent process
- The worker:
  - `POST /dispatch` — receives mission (problem statement, data source, allowed tools, cap)
  - Fetches real NHTSA ODI data via `https://api.nhtsa.gov/complaints/complaintsByVehicle`
  - Calls Nemotron NIM for each complaint classification (real LLM reasoning, not keyword matching)
  - Routes complaints into queues (technical, safety-review, critical, manual)
  - Attempts CARFAX enrichment call (the blocked action)
  - Returns structured evidence payload (rows, routing, runtime, QA agreement, incidents)
- All outbound calls route through the OpenShell policy proxy (Phase 2)
- **Files:** `worker/agent.mjs`, `worker/classifier.mjs`, `worker/nhtsa-client.mjs`
- **Acceptance:** Worker runs standalone, processes real data, returns structured results

### 1.2 Agent IC Dispatch Integration
- New route: `POST /api/dispatch-worker`
- Agent IC sends mission to worker, receives real-time evidence stream
- Worker progress streams via SSE to the run console (replaces deterministic timeline)
- **Files:** `app/api/dispatch-worker/route.js`, update `lib/hermesClient.js`
- **Acceptance:** Agent IC dispatches to real worker, receives real results, no simulated data

### 1.3 Hermes Integration (Worker as Hermes Task)
- If feasible: dispatch the worker AS a Hermes Agent task
- Agent IC calls Hermes to run the triage mission
- Hermes runs the worker inside its environment
- Agent IC records the Hermes task receipt
- **Acceptance:** Hermes dispatch receipt is genuine, not a local artifact

---

## Phase 2: Real OpenShell Integration (Day 3-5)

### 2.1 OpenShell Runtime Setup
- Install/configure NVIDIA OpenShell on the dev machine
- Create a sandbox for the worker agent
- Configure policy:
  - Allow: NHTSA API, Nemotron NIM, Agent IC audit endpoint
  - Block: CARFAX (or any call exceeding the spend cap)
  - Network isolation: deny-all except allow-listed
- **Acceptance:** OpenShell sandbox runs, policy is enforced

### 2.2 Policy Gate Integration
- Replace `lib/nemoclawClient.js` localhost proxy with real OpenShell API calls
- The blocked CARFAX call produces a genuine NVIDIA-engine 403
- Audit trail records: OpenShell sandbox ID, policy version, enforcement receipt
- **Files:** Update `lib/nemoclawClient.js`, `lib/providerStatus.js`
- **Acceptance:** The 403 in the video is a real OpenShell enforcement, verifiable by sandbox ID

### 2.3 Honest Provenance
- Provenance JSON records real OpenShell details:
  - `policyEngine: "NVIDIA OpenShell"` (not "NemoClaw/OpenShell broker")
  - Real sandbox ID from OpenShell
  - Real policy version hash
  - Genuine enforcement status code
- Remove all false `externalLive: true` claims that were actually localhost
- **Acceptance:** Provenance is fully defensible under judge scrutiny

---

## Phase 3: Renewal / Expansion Loop (Day 5-7)

### 3.1 Multi-Cycle State Model
- New data model: Trial Cycle
  - Each cycle has: envelope, evidence, decision, next cap
  - Cycles accumulate evidence over time
  - Monthly renewal decision based on accumulated evidence
- **Files:** `lib/trialCycle.js`, update `lib/demoData.js`

### 3.2 Renewal Decision UI
- New view: `/renewals` or renewal panel in run console
- Shows: trial history, accumulated evidence, spend trend, incident log
- Monthly cadence: Cycle 1 ($100) → CONTINUE → Cycle 2 ($250) → CONTINUE → Cycle 3 ($500)
- Each cycle has real evidence, not just bigger numbers
- **Files:** `app/renewals/page.jsx`, `components/AgentICRenewalPanel.jsx`

### 3.3 Accumulating Evidence Ledger
- Evidence persists across cycles in a local store (JSON or SQLite)
- Shows: cumulative rows processed, cumulative hours saved, cumulative incidents, cost trend
- The buyer can see the service getting better (or worse) over time
- **Files:** `lib/evidenceLedger.js`
- **Acceptance:** Multiple trial cycles produce a real renewal decision with accumulated evidence

---

## Phase 4: Defensible ROI (Day 7-8)

### 4.1 Transparent Cost Methodology
- Every ROI number traces to a specific receipt:
  - Baseline cost = (manual minutes per case × cases × loaded hourly rate) — sourced from BLS data or stated assumption
  - Agent cost = (envelope spend + human review hours × hourly rate) — from Stripe receipt + measured review time
  - Productivity = (cases per hour agent) / (cases per hour manual) — measured, not assumed
- Each number in the UI has a tooltip or footnote showing the formula and source
- **Files:** `lib/roiMethodology.js`, update `lib/nhtsaEvidence.js`

### 4.2 Finance-Grade Evidence Cards
- Redesign evidence display as a financial audit table:
  - Line items with source, formula, value
  - Sensitivity analysis (what if QA drops to 80%? what if hourly cost is $75?)
  - Counterfactual: what does KILL look like?
- **Acceptance:** A finance judge can trace every dollar to a receipt and reproduce the math

---

## Phase 5: UI Redesign (Day 8-10)

### 5.1 Design System
- New CSS architecture: `app/globals-v18.css` or new component CSS
- Typography: Inter (sans) + JetBrains Mono (receipts/audit data)
- Color palette:
  - Base: #0a0e14 (deep institutional navy-black)
  - Surface: rgba(255,255,255,0.03) panels with 1px borders
  - Primary: #d4a017 (amber/gold — financial authority)
  - Danger: #e5484d (red — denied/blocked)
  - Success: #46a758 (green — governance pass)
  - Muted: #8b949e (gray — secondary data)
- Component patterns: ledger rows, receipt cards, policy badges, audit timeline

### 5.2 Run Console Redesign
- Clean hero moments for key beats:
  - Blocked action: full-screen red callout with policy details
  - Decision: large verdict badge with evidence summary
  - Renewal: timeline view showing trial progression
- Density where it belongs (audit trail, evidence table)
- Clarity where it matters (decision, blocked action, envelope)
- **Files:** New `components/AgentICRunConsole-v18.jsx`, `components/run-console-v18.css`

### 5.3 Proof Strip
- Persistent footer/header showing live provider states:
  - OpenShell: sandbox active, policy v2, enforcement live
  - Nemotron: model, request ID, latency
  - Stripe: cs_test session, test mode, cap
  - Hermes: dispatch receipt
- **Acceptance:** A judge can verify all four sponsors at a glance

---

## Phase 6: Recording & Submission (Day 10)

### 6.1 Voiceover
- Rewrite voiceover for the new flow (problem → trial → block → evidence → renewal)
- Use higher-quality ElevenLabs voice preset (deeper, more authoritative)
- Re-time captions to the new flow
- **Files:** `demo/voiceover-v18.txt`, update `scripts/make-voiceover.sh`

### 6.2 Record Final Demo
- Record the new flow from `/run`
- Show: real worker dispatch, real OpenShell 403, real Nemotron reasoning, real Stripe session, renewal loop
- Duration: 60-90 seconds
- **Files:** Update `scripts/record-live-demo.mjs`

### 6.3 Push Public Repo
- Strip `.env.local`, secrets, API keys from the codebase
- Push to `github.com/agent-ic` as a public repo
- Verify QR resolves to actual source + proof artifacts
- **Acceptance:** QR scan opens real public repo with source, SKILL.md, proof-report

### 6.4 Fix Tests
- Update `tests/demo-presentation-contract.test.mjs` to match new voiceover
- Ensure `npm test` passes 100/100
- **Acceptance:** Green test suite

### 6.5 Final Validation
- `npm test` — all pass
- `npm run build` — passes
- `npm run demo:video` — produces final video
- Video QA + frame QA — both PASS
- Manual frame-by-frame review

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| OpenShell requires NVIDIA hardware | Fall back to a real external policy broker (standalone service on a different port/machine, still genuinely external) |
| Worker agent too slow for real-time demo | Pre-fetch NHTSA data, use streaming for progressive results |
| Nemotron rate limits during multi-complaint classification | Batch classify, cache within a single trial run |
| 10 days insufficient for full rebuild | Priority order: OpenShell 403 → real worker → UI → renewal → ROI |
| UI redesign breaks existing tests | Keep v17 as fallback, build v18 in parallel |

---

## Dependency Order

```
Phase 0 (research) → Phase 2 (OpenShell) ─┐
                 → Phase 1 (worker) ───────┤→ Phase 3 (renewal) → Phase 5 (UI) → Phase 6 (record)
                 → Phase 4 (ROI) ──────────┘
```

Phases 1, 2, and 4 can be developed in parallel after Phase 0 research completes.
Phase 3 depends on 1+2. Phase 5 depends on 1+2+3+4. Phase 6 depends on everything.
