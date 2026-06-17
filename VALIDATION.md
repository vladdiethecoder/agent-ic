# Agent IC v16 validation checklist

Run these before recording or submitting the v16 demo.

## 1. Install and build

```bash
npm install
npm test
npm run build
```

Pass condition: Node test runner exits 0. The suite covers decision math, evidence gates, audit retention/redaction, malformed JSON, unknown proposal IDs, KILL-spend blocking, Stripe cents/dollars conversion, live Stripe dry-run idempotency, provider failure sanitization, Hermes dispatch fallback, NVIDIA NIM fallback, NemoClaw policy gating, run-capital-experiment-v8 orchestration, counterfactual decisions, webhook signature verification, Stripe session-status polling, save-playbook SKILL.md write (now to `skills/` and `demo-out/artifacts/`), and safe-next mirror guardrails. Next.js production build exits 0 and reports compiled routes including `/api/playbook`.

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
- save-playbook writes `skills/bounded-capital-experiment-v1.SKILL.md` **and** `demo-out/artifacts/bounded-capital-experiment-v1.SKILL.md` and returns `ok=true`
- With `STRIPE_SECRET_KEY` and `AGENT_IC_DEMO_MODE=false`, the Stripe route returns `mode=live` and a real `cs_test_...` session id

## 3. UI demo path (v16 live screencast)

At `http://localhost:3000/run-v14`:

1. Run console opens on **Problem** stage with hook copy and live-trace sidecar.
2. Click **Run capital experiment** to start the live v8 orchestration.
3. Confirm **Proposal** stage shows Atlas Freight proposal, provider status strip, and metadata. The visible ask is the micro-pilot ask (`$12,500`).
4. Confirm **Evaluate** stage shows metric badges and `CONTINUE`.
5. Confirm **Fund** stage shows bounded Stripe authorization with a real `cs_test_...` session id and `$100` spend cap.
6. Confirm **Govern** stage shows the blocked-action card, a full-screen red vignette flash, the raw tool-call intercept overlay, and the live-trace sidecar streaming the blocked request/response.
7. Confirm **Decide** stage shows saved playbook, next cap (`$250`), autonomy label `HUMAN-IN-LOOP`, ROI bar chart, and real CTA URLs.
8. Confirm the artifact shot panel opens and scrolls the actual `SKILL.md` content.

Pass condition:

- No browser console errors.
- Numbers are computed from the seeded proposal, not hard-coded literals.
- Stripe result shows a real test-mode session id when keys are set; otherwise demo-safe.
- Audit rows include evaluation, Stripe, blocked, and evidence events.
- NemoClaw / OpenShell log shows `403 Forbidden`.
- SSE stream stays open and emits provider receipts without leaking secrets.
- The `SIMULATED` badge is no longer shown in the UI.
- Red color is used only for the security violation; budget guardrails use amber/yellow.
- The red vignette overlay fires exactly once during the Govern stage.

## 4. Live proof artifacts

Ensure the terminal static server is running from `demo-out/terminals-v16/` on port 4000 (or run `python3 -m http.server 4000` there).

Pass condition:

- `demo-out/terminals-v16/` contains:
  - `terminal-boot.html`
  - `stripe-checkout.html`
  - `nemoclaw-gate-403.html`
  - `nvidia-smi.html`
  - `cat-playbook.html`
  - `ls-skills.html`
  - `provenance.json` with `mode: live`
- `provenance.json` records real IDs: Stripe `cs_test_...`, Nemotron `requestId`, NemoClaw `sandbox` ID.
- The Stripe page shows a real `cs_test_...` Checkout Session id, `$100` cap, and no secrets.
- The NemoClaw page shows payload `amount: 150`, `cap: 100`, and HTTP 403.
- The nvidia-smi page shows the RTX 5090 and a live Nemotron inference summary.
- The playbook pages show the saved `bounded-capital-experiment-v1.SKILL.md` file and directory listing.

## 5. Live screencast recording pipeline

```bash
npm run demo:record-v16
```

Pass condition:

- Script exits 0.
- Output: `demo-out/agent-ic-demo-v16-raw.webm` (single-take browser recording, 1920×1080).
- Recording is event-driven: stage pill transitions match actual SSE audit events.
- Cursor path is humanized (cubic Bézier + jitter) and includes ≥ 6 clicks.
- The browser switches to real proof terminal pages during the appropriate beats.
- The red vignette flash is visible during the Govern stage.
- The artifact shot panel is visible during the Decide stage.
- No `SIMULATED` badge appears.
- Provider status strip shows live states when keys are configured.

## 6. Post-production pipeline

```bash
npm run demo:post-produce-v16
```

Pass condition:

- Script exits 0.
- Output: `demo-out/agent-ic-demo-v16.mp4`.
- Intro + main + outro total duration ≤ 90 s.
- h264 video, 1920×1080, 30 fps.
- AAC audio, 48 kHz stereo.
- Captions are burned in and align with the final cut.
- Audio is trimmed/faded from the existing mastered WAV.

## 7. Final render and QA (v16)

```bash
npm run demo:video-v16
```

Pass condition:

- `demo-out/agent-ic-demo-final.mp4` is created (1920×1080, h264 + AAC 48 kHz stereo, ≤ 90 s).
- `scripts/video-qa-v16.mjs` reports `QA PASSED`.
- `demo-out/video-qa-report-v16.json` is written and `overall` is `PASS`.
- `demo-out/video-qa-report-final.json` is a copy of the v16 report.
- `demo-out/final-video-metadata.json` matches the actual final MP4 duration/size/codec.
- The playbook artifact exists on disk at both `skills/bounded-capital-experiment-v1.SKILL.md` and `demo-out/artifacts/bounded-capital-experiment-v1.SKILL.md`.
- No `SIMULATED` badge or `[mock]` / `[fallback]` / `SIMULATED` markers are detected in source data or extracted frames.
- Required text (`Agent IC`, `BLOCKED`, `403`, `Nemotron`, `Stripe`, `cs_test_`, `SKILL.md`, `GitHub`) is present.

## 8. Live integration path

Same as v15: copy `.env.example` to `.env.local` and fill only the services you want to activate.

### Stripe Checkout

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `AGENT_IC_DEMO_MODE=false`.

Pass condition:

- API response has `stripe.mode=live`.
- Stripe returns a real test-mode Checkout Session with a hosted `url` beginning with `cs_test_`.
- Checkout metadata includes proposal id, governance policy, and spend cap dollars.
- No secret key is rendered in the page, logs, or audit row.

### NVIDIA NIM / Nemotron

Set `NEMOTRON_BASE_URL`, `NEMOTRON_API_KEY`, `NEMOTRON_MODEL`, and `AGENT_IC_DEMO_MODE=false`.

Pass condition:

- Response `nim.state` is `live` and `nim.provider` is `NVIDIA NIM`.
- A live inference call to `nvidia/nemotron-3-super-120b-a12b` succeeds and returns a `requestId`.
- If the model call fails, the response still succeeds with deterministic fallback and `liveError` is sanitized.

### Hermes dispatch

Set `HERMES_AGENT_URL`, `HERMES_AGENT_TOKEN`, and `AGENT_IC_DEMO_MODE=false`.

Pass condition:

- Response `hermes.state` is `live` and includes `taskId`/`skillPlan`/`playbook`.
- If the gateway is not configured, the UI honestly shows `HERMES LOCAL` and the playbook is saved locally.

### NemoClaw / OpenShell policy proxy

Start `node scripts/nemoclaw-proxy.mjs` and set `NEMOCLAW_PROXY_URL` plus `AGENT_IC_DEMO_MODE=false`.

Pass condition:

- Response `blocked.state` is `live` and `blocked.status` is `403`.
- `blocked.reason` names the cap violation (`per_authorization_cap_exceeded`).
- The local proxy policy `perCallCap` matches the demo envelope cap (`100`).

## 9. Final submission recording checklist

- Final file is `demo-out/agent-ic-demo-v16.mp4`, promoted to `demo-out/agent-ic-demo-final.mp4` after validation passes.
- Render pipeline: `npm run demo:video-v16` (record → post-produce → QA → promote → metadata sync).
- Final runtime ≤ 90 s (final render is 84 s).
- The video is a single-take live browser screencast with real API integrations.
- Red vignette flash occurs on the blocked spend event.
- Artifact shot displays the generated `SKILL.md` content.
- Cursor path is humanized and includes multiple clicks.
- Captions are burned in for social-feed viewing.
- CTA buttons use real URLs.

Verify with:

```bash
ffprobe -show_streams demo-out/agent-ic-demo-final.mp4
```

Pass condition: the output contains a video stream (h264, 1920×1080) and an audio stream (aac, 48 kHz, stereo) and the duration is ≤ 90 s.

Recommended sanity playback:

```bash
ffplay demo-out/agent-ic-demo-final.mp4
```

Check that audio and video remain in sync, the narrative arc is clear, and the live-trace sidecar updates without flickering.
