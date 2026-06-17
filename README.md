# Agent IC — Hermes / NVIDIA NIM / Stripe governed capital account for autonomous work

Agent IC is a live Next.js hackathon demo for the Nous × NVIDIA × Stripe Hermes Agent challenge.

It is a governed capital account for autonomous work: a micro-pilot receives a bounded spend envelope, runs work inside a policy envelope, gets blocked from unsafe actions, imports evidence, and reaches a continue/revise/kill decision with a reusable Hermes playbook.

1. Hermes-style intake dispatches a real agent task and normalizes the proposal into a business/evidence/governance schema.
2. NVIDIA NIM / Nemotron scoring evaluates usefulness, viability, governance, ROI proof, and risk.
3. Agent IC scopes budget lines and autonomous spend caps.
4. Stripe Checkout authorizes the governed pilot spend path with policy metadata.
5. A NemoClaw / OpenShell-style policy envelope constrains tools, spend, approvals, and kill criteria.
6. ROI evidence advances through week 0/2/4/6/8 and triggers kill/continue decisions.
7. Every dispatch, model call, spend action, blocked tool call, and evidence gate appends an audit entry streamed live to the `/run` console.

Default mode is fully local and safe: no API keys, no model calls, no real Stripe spend.

The v16 demo is a single-take, live browser screencast of the governed capital loop. The stage-based run console (Problem → Proposal → Evaluate → Fund → Govern → Decide) advances from real SSE audit events, while the right panel streams the raw audit and live-trace log. A humanized cursor starts the experiment, the backend creates a $100 Stripe test-mode Checkout Session, scores the pilot through NVIDIA Nemotron, a $150 out-of-policy tool call is blocked by a local NemoClaw proxy with a structured 403 (full-screen red vignette flash), and the final CONTINUE decision is backed by evidence, an artifact shot that scrolls the actual generated SKILL.md, and a saved Hermes playbook. The playbook is written to both `skills/` and `demo-out/artifacts/` so it survives test cleanup and is included in the submission bundle.

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

This workspace path contains `#`, which breaks Next.js output tracing when run in-place. The npm scripts intentionally mirror the app to `/tmp/agent-ic-dev` or `/tmp/agent-ic-build` before invoking Next, so the commands above are the supported path.

Health check:

```bash
curl -s http://localhost:3000/api/health | python3 -m json.tool
```

Production build:

```bash
npm run build
npm run start
```

Smoke and regression checks after starting the server:

```bash
npm test
npm run smoke
npm run smoke:api
npm run smoke:browser
```

## Live integration path

Copy `.env.example` to `.env.local` and fill only the services you want to activate. Each integration has its own live/fallback flag, so you can run NIM live while Stripe stays mocked, Hermes live while NIM stays deterministic, etc.

```bash
cp .env.example .env.local
```

### NVIDIA NIM / Nemotron

NVIDIA NIM for LLMs exposes an OpenAI-compatible inference path at `/v1/chat/completions`.

Set:

```bash
NEMOTRON_BASE_URL=https://integrate.api.nvidia.com/v1
NEMOTRON_API_KEY=nvapi-...
NEMOTRON_MODEL=nvidia/nemotron-3-super-120b-a12b
AGENT_IC_DEMO_MODE=false
```

Then click `Evaluate with Agent IC` or call `/api/run-capital-experiment-v8`. If the live call fails, the API records the error and falls back to the deterministic evaluator so the demo remains presenter-safe.

### Stripe Checkout

Stripe Checkout Sessions are created server-side through `POST /api/stripe-session` and reconciled via `POST /api/stripe-webhook` and `GET /api/stripe-session-status`.

Set:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
AGENT_IC_DEMO_MODE=false
```

Then click `Authorize Stripe spend` or run the v8 experiment. Live mode creates a hosted Checkout Session with:

- `client_reference_id`: proposal id
- `metadata[proposal_id]`
- `metadata[governance_policy]`
- `metadata[autonomous_spend_cap_dollars]`
- one line item named `Agent IC governed pilot authorization — <company>`

Without `STRIPE_SECRET_KEY`, the route returns a mock `cs_test_agent_ic_*` session and the UI links to `/mock-stripe-checkout`.

### Hermes handoff

The v8 orchestration dispatches to a Hermes-compatible gateway during the experiment.

Set:

```bash
HERMES_AGENT_URL=http://localhost:8080/webhooks/agent-ic-evaluate
HERMES_AGENT_TOKEN=...
AGENT_IC_DEMO_MODE=false
```

Call `/api/run-capital-experiment-v8`. If the gateway is unreachable, the route falls back to deterministic `taskId`/`skillPlan`/`playbook` values.

### NemoClaw / OpenShell policy proxy

A local policy proxy demonstrates a real 403 block on an out-of-policy tool call.

Start it:

```bash
node scripts/nemoclaw-proxy.mjs
```

Set:

```bash
NEMOCLAW_PROXY_URL=http://localhost:9000
AGENT_IC_DEMO_MODE=false
```

The v8 route calls the proxy for the blocked tool action. If the proxy is not running, the route returns a deterministic replay so the demo still records the policy block.

## Seeded demo scenario

Primary scenario: `Atlas Freight — Autonomous RMA + claims copilot for late freight exceptions`.

Expected baseline deterministic result:

- Decision: `CONTINUE`
- Budget: `$185,000`
- Autonomous spend cap: about `$35,000`
- Payback: `38 days`
- 90-day ROI: `2.36x`

Other seeded proposals show re-scope/kill-style contrast for regulated KYC and retail revenue operations.

## Demo video pipeline (v16 final)

The final submission video is a single-take, live browser screencast captured and post-produced end-to-end from local assets plus live test-mode integrations:

```bash
npm run demo:video
```

This runs:

1. `demo:record-v16` — event-driven Playwright capture of `/run-v14` plus real proof terminal pages (`localhost:4000/*`) in a visible Chromium window at 1920×1080, with a humanized cursor and real clicks → `demo-out/agent-ic-demo-v16-raw.webm`.
2. `demo:post-produce-v16` — ffmpeg pipeline: transcode to h264, prepend/append intro/outro cards, burn captions, and trim/fade audio → `demo-out/agent-ic-demo-v16.mp4`.
3. `demo:qa-v16` — validate the final render, artifact locations, and provenance.
4. Promote `demo-out/agent-ic-demo-v16.mp4` to `demo-out/agent-ic-demo-final.mp4` and sync `final-video-metadata.json`.

The v16 audio reuses the v13 Kokoro voiceover (`demo-out/agent-ic-audio-mastered-v13.wav`), trimmed and faded to match the new ~84 s runtime.

Final artifact: `demo-out/agent-ic-demo-v16.mp4` (promoted to `demo-out/agent-ic-demo-final.mp4` for submission), 1920×1080, 30 fps, h264 + AAC 48 kHz stereo, target ≤ 90 s.

Earlier pipelines remain available as `npm run demo:video-v11`, `npm run demo:video-v12`, `npm run demo:video-v13`, `npm run demo:video-v14`, and `npm run demo:video-v15` for reference and comparison.

The pipeline is safe by default: without API keys it renders an honest demo/local mode video. With `STRIPE_SECRET_KEY`, `NEMOTRON_API_KEY`, and `NEMOCLAW_PROXY_URL` set plus `AGENT_IC_DEMO_MODE=false`, the v16 render uses real test-mode Stripe Checkout Sessions, live NVIDIA Nemotron inference, and a local NemoClaw proxy returning HTTP 403. No real card spend occurs because Stripe test mode is used.

## Important files

- `app/run-v14/page.jsx` — v14 split-screen run console entry page
- `components/AgentICRunConsole-v14.jsx` — split-screen console with live-trace sidecar, red vignette, artifact shot, and real CTAs
- `components/run-console-v14.css` — v14/v16 run console styles
- `app/api/live-trace/route.js` — SSE endpoint streaming raw blocked request/response traces
- `app/api/playbook/route.js` — returns the generated `SKILL.md` content to the artifact shot panel
- `scripts/capture-terminal-v16.mjs` — real terminal clip pipeline with honest replay fallback
- `scripts/record-live-screencast-v16.mjs` — single-take live browser screencast recorder with humanized cursor
- `scripts/post-produce-v16.mjs` — ffmpeg post-production (transcode, intro/outro, captions, audio)
- `scripts/video-qa-v16.mjs` — v16 final render QA gate
- `demo-out/terminals-v16/` — real proof terminal pages (Stripe, NemoClaw, NVIDIA, playbook)
- `demo-out/artifacts/` — submission copy of `bounded-capital-experiment-v1.SKILL.md`
- `demo/voiceover-v13.txt` — voiceover script (trimmed for v16)
- `STORYBOARD.md` — v16 shot-by-shot storyboard
- `VALIDATION.md` — v16 validation checklist
- `lib/demoData.js` — seeded proposals, governance policy, rubric mapping
- `lib/decisionEngine.js` — deterministic evaluator and budget/ROI decision logic
- `lib/proofEngine.js` — OpenShell sandbox, Stripe skill, and Hermès skills payload builder
- `lib/hermesClient.js` — Hermes gateway dispatch client
- `lib/nimClient.js` — NVIDIA NIM / OpenAI-compatible inference client
- `lib/nemoclawClient.js` — NemoClaw policy proxy client
- `lib/providerStatus.js` — per-service live/fallback flags
- `lib/validation.js` — shared request validation helpers
- `lib/auditStore.js` — append-only local audit log
- `app/api/run-capital-experiment-v8/route.js` — full orchestration route used by the v11 wizard
- `app/api/stripe-session/route.js` — Stripe live/mock spend path
- `app/api/stripe-webhook/route.js` — Stripe webhook signature verification + audit append
- `app/api/events/route.js` — SSE audit/event stream
- `PRODUCT_CONTRACT.md` — real-product acceptance criteria and edge-case matrix
- `docs/demo-video-research-v11.md` — v11 toolchain and source research

## Source grounding

Primary-source facts used for the integration story:

- Hackathon announcement screenshot in this workspace: build business tooling on Hermes Agent; agents can earn/spend/run operations; judged on usefulness, viability, presentation.
- Cerebral Valley event page: entries judged by Nous staff on creativity, usefulness, and presentation; tweet with 1–3 minute demo/video writeup.
- NVIDIA NIM LLM API reference: NIM exposes OpenAI-compatible `/v1/chat/completions` and model/health endpoints.
- NVIDIA Nemotron developer page: Nemotron is a family of open models for specialized agentic AI applications, with NIM/OpenRouter/Hugging Face access paths.
- Stripe Checkout Sessions API reference: server creates a Checkout Session, redirects to session `url`, and uses session/payment status for reconciliation.
