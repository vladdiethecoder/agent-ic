# Agent IC v11 submission storyboard

Target length: **2:42**, hard cap **3 minutes**. Rendered at 1920×1080/30 fps.

Audio source: `demo/voiceover-v11.txt` → `remotion/public/voiceover-v11.wav` (Kokoro TTS, resampled to 48 kHz stereo).  
Base UI recording: `remotion/public/ui-v11.webm` (captured from `http://localhost:3000/run-v11?recording=1` with Playwright).  
Terminal overlay clips: `demo-out/terminals-v11/*.webm`.  
Edit plan: `remotion/edit-plan-v11.json` (stage timestamps + captions + callouts).  
Final artifact: `demo-out/agent-ic-demo-v11.mp4`.

Narrative arc: **Problem → Onboard → Evaluate → Fund → Govern → Measure → Decide → CTA**.

> The v10 pipeline remains runnable via `npm run demo:video` as a fallback until v11 is promoted to `agent-ic-demo-final.mp4`.

---

## 0:00–0:20 — Problem

**Voiceover:**

> Enterprises are about to launch thousands of AI pilots. The failure mode is not the demos — it is ungoverned spend with no proof of return. Every agent wants a budget, tools, and production access, but most teams have no investment committee for autonomous work. Agent IC is that committee.

**Show:**

- Intro title card: Agent IC logo + tagline "The investment committee for autonomous agents."
- Subtitle: "Agents that earn, spend, and run operations need governed capital."
- Animated call-out: *Problem — ungoverned AI pilot spend with no ROI proof.*

**Terminal clip:** None.

---

## 0:20–0:50 — Onboard

**Voiceover:**

> We start by giving the agent a safe home. NemoClaw installs a Hermes sandbox, scopes its network policy, and names it for the Atlas Freight pilot. Hermes normalizes the raw proposal into a business, evidence, and governance schema so the agent can be reviewed like any other capital request.

**Show:**

- Cut to `/run-v11` wizard, stage panel on **Problem → Proposal**.
- Workbench shows Atlas Freight proposal card (company, tickets, SLA, problem statement).
- Provider status strip updates: NemoClaw "live" or "simulated", Hermes "connected".
- Terminal drawer slides open, displaying `nemohermes onboard` + `hermes-agent` dispatch output.
- Animated call-out: *Onboard — NemoClaw sandbox + Hermes intake.*

**Terminal clip:**

- `demo-out/terminals-v11/nemoclaw-onboard.webm` (real if `nemohermes` installed and env set; otherwise deterministic simulated session labeled in frame).
- `demo-out/terminals-v11/hermes-dispatch.webm` (real if Hermes gateway reachable; otherwise simulated).

---

## 0:50–1:20 — Evaluate + Fund

**Voiceover:**

> Agent IC evaluates the pilot the same way a CFO would. Nemotron scores usefulness, viability, risk, and ROI proof. The verdict is not a vague yes — it is Continue, with a one-hundred-eighty-five-thousand-dollar pilot budget, a roughly thirty-five-thousand-dollar autonomous spend cap, thirty-eight-day payback, and two-point-three-six-times ninety-day ROI. When the agent asks to spend, Stripe authorizes a bounded checkout session with the proposal metadata and policy envelope baked in. Demo mode is safe; with a test key this becomes a real hosted Checkout Session.

**Show:**

- Wizard advances to **Evaluate → Fund**.
- Large metric badges appear: `$185,000` budget, `~$35,000` cap, `38-day` payback, `2.36×` ROI.
- Decision badge flips to `CONTINUE`.
- Stripe authorization card: mock session id beginning `cs_test_agent_ic_`, metadata fields, spend cap.
- Terminal drawer shows Stripe Link CLI / MPP / Projects spend flow.
- Animated call-out: *Evaluate — Nemotron scores the pilot.*
- Animated call-out: *Fund — bounded Stripe authorization, no session, no spend.*

**Terminal clip:**

- `demo-out/terminals-v11/stripe-link-spend.webm` (real if `link-cli` installed; otherwise simulated).
- `demo-out/terminals-v11/mpp-payment.webm` (real if `mppx` installed; otherwise simulated).
- `demo-out/terminals-v11/stripe-projects-provision.webm` (real if `stripe` CLI installed; otherwise simulated).

---

## 1:20–1:55 — Govern + Measure

**Voiceover:**

> Funding is conditional. The pilot keeps capital only by producing evidence. We advance the ROI timeline through week two, week four, week six, and week eight. Agent IC tracks gross impact, spend consumed, net value, evidence grade, and kill criteria. At week four a weak result would trigger Kill. Here it holds. Now watch the policy envelope block an out-of-policy tool call — NemoClaw returns four-oh-three Forbidden before any money moves.

**Show:**

- Wizard advances to **Govern → Measure**.
- ROI evidence timeline animates: week 2, week 4, week 6, week 8.
- Evidence counters update: cases processed, auto-triaged, QA agreement, hours saved, gross value, net value, critical incidents, spend consumed.
- Week 4 gate shows `OBSERVE` (or `KILL` if weak evidence selected).
- Week 8 gate shows `CONTINUE`.
- Blocked action card: `DENIED`, attempted tool, amount, cap, policy reason.
- Terminal drawer shows out-of-policy HTTP call returning `403 Forbidden`.
- Animated call-out: *Govern — evidence gates decide continuation.*
- Animated call-out: *Measure — NemoClaw blocks out-of-policy tool call.*

**Terminal clip:**

- `demo-out/terminals-v11/blocked-tool-403.webm` (real if NemoClaw proxy running; otherwise deterministic replay labeled in frame).

---

## 1:55–2:42 — Decide + CTA

**Voiceover:**

> By week eight Atlas has enough proof for a finance-readable Continue decision. The committee saves a reusable Hermes playbook so the next bounded capital experiment runs the same way. This matters because agents that earn, spend, and run operations need governance, not just prompts. Agent IC runs locally with deterministic fallbacks, then upgrades to NVIDIA NIM, Hermes, and Stripe by adding environment variables. Open the live demo, read the source, and see how every pilot becomes an investment decision.

**Show:**

- Wizard advances to **Decide**.
- Verdict card: `CONTINUE`, saved playbook name `bounded-capital-experiment-v1`, next cap, autonomy level.
- Saved playbook panel: `skills/bounded-capital-experiment-v1.SKILL.md`.
- Outro card with CTAs: "See live demo", "View source", hackathon relevance: "Agents operate with money. You keep control."
- Closing tagline: "Agent IC — Hermes × NVIDIA NIM × Stripe."
- Animated call-out: *Decide — Continue, reusable playbook saved.*
- Animated call-out: *Every pilot becomes an investment decision.*

**Terminal clip:** None.

---

## Why this is submittable

- Seeded inputs, not hard-coded outcomes.
- Every number is computed by the policy, spend, evidence, and decision engines.
- Terminal sessions are real where tools are installed; visually identical simulated replays where they are not, clearly labeled in-frame.
- A Stripe Checkout Session is created live with policy metadata and spend-cap in cents when `STRIPE_SECRET_KEY` is set.
- Hermes Agent dispatch and NIM scoring are wired with deterministic fallbacks for presenter safety.
- A real `SKILL.md` playbook artifact is written to disk.
- The narrative follows a single investment-committee loop: Problem → Onboard → Evaluate → Fund → Govern → Measure → Decide.
- The v11 wizard streams live SSE audit events as the experiment executes.
- Remotion adds cinematic intro/outro, animated call-outs, and burned captions for silent social feeds.
- Voiceover is generated locally with Kokoro and resampled to 48 kHz stereo.
