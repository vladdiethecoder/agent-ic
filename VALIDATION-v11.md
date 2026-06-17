# Agent IC v11 validation checklist

Run these before recording or submitting the v11 demo overhaul.

## 1. Install and build

```bash
npm install
cd remotion && npm install && cd ..
npm test
npm run build
```

Pass condition: Node test runner exits 0, covering decision math, evidence gates, audit retention/redaction, malformed JSON, unknown proposal IDs, KILL-spend blocking, Stripe cents/dollars conversion, live Stripe dry-run idempotency, provider failure sanitization, Hermes dispatch fallback, NVIDIA NIM fallback, NemoClaw policy gating, run-capital-experiment-v8 orchestration, counterfactual decisions, webhook signature verification, Stripe session-status polling, save-playbook SKILL.md write, and safe-next mirror guardrails. Next.js production build exits 0 and reports compiled routes including:

- `/`
- `/submit`
- `/run`
- `/run-v11`
- `/api/evaluate`
- `/api/run-capital-experiment`
- `/api/run-capital-experiment-v8`
- `/api/save-playbook`
- `/api/stripe-session`
- `/api/stripe-session-status`
- `/api/stripe-webhook`
- `/api/audit`
- `/api/events`
- `/api/health`
- `/mock-stripe-checkout`

## 2. Local server smoke

```bash
npm run dev
curl -s http://localhost:3000/api/health | python3 -m json.tool
npm run smoke
npm run smoke:api
npm run smoke:browser
```

Pass condition:

- health `ok=true`
- evaluation returns seeded proposal, `decision`, `recommendedBudget`, `governance`, `evidenceTimeline`, `audit`
- run-capital-experiment returns `decision.verdict`, `envelope`, `stripe`, `blocked`, `evidence`, `hermesPlaybook`, `stages`, `sandbox`, `stripeSkill`, `skills`, `nemotron`, and audit rows
- run-capital-experiment-v8 returns `decision.verdict`, `envelope`, `stripe`, `blocked`, `evidence`, `hermes`, `nim`, `nemoclaw`, `stages`, `audit`, and `providerReceipts`
- save-playbook writes `skills/bounded-capital-experiment-v1.SKILL.md` and returns `ok=true`
- Stripe route returns `mode=demo` and `checkout.id` beginning with `cs_test_agent_ic_` when no key is set

## 3. UI demo path (v11 wizard)

At `http://localhost:3000/run-v11`:

1. Wizard opens on **Problem** stage with title "The investment committee for autonomous agents."
2. Click **Next** or **Run capital experiment** to advance through Proposal, Evaluate, Fund, Govern, Measure, and Decide.
3. Confirm **Evaluate** stage shows Atlas Freight proposal, provider status strip (Hermes / NIM / Stripe / NemoClaw), and metric badges for budget, cap, payback, ROI, risk score.
4. Confirm **Fund** stage shows decision `CONTINUE`, `$185,000` budget, `~$35,000` autonomous spend cap, `38 days` payback, `2.36x` 90-day ROI.
5. Confirm Stripe result card shows a mock session id beginning with `cs_test_agent_ic_`, plus proposal metadata, governance policy, and spend cap.
6. Confirm **Govern + Measure** stage advances the ROI timeline through weeks 2, 4, 6, and 8.
7. Confirm final evidence gate shows `CONTINUE` backed by gross impact, spend consumed, net observed value, and evidence grade.
8. Confirm **Decide** stage shows saved playbook `skills/bounded-capital-experiment-v1.SKILL.md` and CTAs to open live demo / view source.
9. Confirm terminal drawer opens during Onboard, Fund, and Govern stages.

Pass condition:

- No browser console errors.
- Numbers are computed from the seeded proposal, not hard-coded literals.
- Stripe result is demo-safe; no real secret or card is shown.
- Audit rows include evaluation, Stripe, and evidence events.
- NemoClaw / OpenShell log shows `403 Forbidden`.
- SSE stream stays open and emits provider receipts without leaking secrets.

## 4. Terminal capture pipeline

```bash
node scripts/capture-terminal-v11.mjs
```

Pass condition:

- Script exits 0 even if every CLI tool is missing.
- Output directory `demo-out/terminals-v11/` contains:
  - `nemoclaw-onboard.webm`
  - `hermes-dispatch.webm`
  - `mpp-payment.webm`
  - `stripe-link-spend.webm`
  - `stripe-projects-provision.webm`
  - `blocked-tool-403.webm`
- Each clip is 1920×1080 WebM, visually consistent, and labeled "SIMULATED" when fallback mode is used.
- No secrets, API keys, or tokens appear in clip frames or captured stdout/stderr.
- Script logs which clips are real vs simulated to stdout.

## 5. Live Stripe test mode

With a Stripe test secret key:

```bash
cp .env.example .env.local
# edit .env.local:
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# AGENT_IC_DEMO_MODE=false
npm run dev
```

Click **Run capital experiment** or call `/api/run-capital-experiment-v8`.

Pass condition:

- API response has `stripe.mode=live`.
- Stripe returns a Checkout Session with a hosted `url`.
- Checkout metadata includes proposal id, governance policy, and spend cap dollars.
- No secret key is rendered in the page, logs, or audit row.
- Webhook route (`/api/stripe-webhook`) verifies signatures and appends audit rows.
- `/api/stripe-session-status?id=cs_test_...` returns `paid` status.

## 6. Live NVIDIA NIM / Nemotron path

With an NVIDIA/NIM-compatible API key:

```bash
# .env.local
NEMOTRON_BASE_URL=https://integrate.api.nvidia.com/v1
NEMOTRON_API_KEY=nvapi-...
NEMOTRON_MODEL=nvidia/nemotron-3-super-120b-a12b
AGENT_IC_DEMO_MODE=false
npm run dev
```

Call `/api/run-capital-experiment-v8`.

Pass condition:

- Response `nim.state` is `live` and `nim.provider` is `NVIDIA NIM`.
- If the model call fails, the response still succeeds with deterministic fallback and `liveError` is sanitized.
- The UI remains usable in both cases.

## 7. Live Hermes dispatch

With a Hermes-compatible gateway:

```bash
# .env.local
HERMES_AGENT_URL=http://localhost:8080/webhooks/agent-ic-evaluate
HERMES_AGENT_TOKEN=...
AGENT_IC_DEMO_MODE=false
npm run dev
```

Call `/api/run-capital-experiment-v8`.

Pass condition:

- Response `hermes.state` is `live` and includes `taskId`/`skillPlan`/`playbook`.
- If the gateway errors or is unreachable, the response falls back to deterministic values.

## 8. Live NemoClaw policy proxy

Start the local policy proxy:

```bash
node scripts/nemoclaw-proxy.mjs
# listens on NEMOCLAW_PROXY_URL (default http://localhost:9000)
```

Then with the proxy running:

```bash
# .env.local
NEMOCLAW_PROXY_URL=http://localhost:9000
AGENT_IC_DEMO_MODE=false
npm run dev
```

Call `/api/run-capital-experiment-v8`.

Pass condition:

- Response `blocked.state` is `live` and `blocked.status` is `403`.
- `blocked.reason` names the unapproved merchant and/or cap violation.
- If the proxy is down, the route falls back to deterministic replay.

## 9. Final submission recording checklist

- Final file is `demo-out/agent-ic-demo-v11.mp4` (promoted to `demo-out/agent-ic-demo-final.mp4` after validation passes).
- Render pipeline: `npm run demo:video-v11` (reset → Kokoro voiceover → record v11 wizard → script-aligned captions → Remotion render).
- Composition is defined for `DemoVideoV11`: 1920×1080, 30 fps, dynamic duration from `remotion/edit-plan-v11.json`.
- Intro and outro cards are rendered by Remotion.
- Animated call-outs highlight Problem, Onboard, Evaluate, Fund, Govern, Measure, and Decide beats.
- Captions are burned in by Remotion for social-feed viewing.
- Base UI recording is captured from `http://localhost:3000/run-v11?recording=1` with Playwright and trimmed inside the composition.
- Voiceover script is `demo/voiceover-v11.txt` and targets 2:42 total runtime.

Verify with:

```bash
ffprobe -show_streams demo-out/agent-ic-demo-v11.mp4
```

Pass condition: the output contains both a video stream (h264, 1920×1080) and an audio stream (aac, 48 kHz, stereo) and the duration is under 3 minutes.

Recommended sanity playback:

```bash
ffplay demo-out/agent-ic-demo-v11.mp4
```

Check that audio and video remain in sync and the narrative arc (Problem → Onboard → Evaluate → Fund → Govern → Measure → Decide) is clear without reading captions.
