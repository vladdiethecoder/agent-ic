# Agent IC Hackathon Submission Materials

## Submission checklist

- [x] 1–3 minute demo script: `STORYBOARD.md`
- [x] Demo app builds and passes tests
- [x] Demo app runs in production mode locally
- [x] Submission tweet drafted (below)
- [x] Discord submission message drafted (below)
- [x] Record final 1–3 minute video → `demo-out/agent-ic-demo-v14.mp4` (promoted to `demo-out/agent-ic-demo-final.mp4`), target ~2:05, 1920×1080 h264 + AAC 48 kHz stereo
- [ ] Post video on X tagging @NousResearch
- [ ] Post submission link in Nous Discord #submissions channel
- [ ] Complete Typeform

## Recording checklist (v14)

1. Start the app: `npm run build && npm run start`
2. Open `http://localhost:3000/run-v14?recording=1` at 1920×1080.
3. Run the v14 pipeline:
   ```bash
   npm run demo:video-v14
   AGENT_IC_QA_SKIP_OCR=true npm run demo:qa-v14
   ```
4. Confirm `demo-out/agent-ic-demo-v14.mp4` exists and passes QA.
5. Promote to final submission file:
   ```bash
   cp demo-out/agent-ic-demo-v14.mp4 demo-out/agent-ic-demo-final.mp4
   ```
6. Keep the final cut under 3 minutes.
7. Export as MP4, preferably 1080p.

## Tweet draft

> Built Agent IC for the @NousResearch Hermes hackathon: a governed capital account for autonomous work.
>
> We gave a Hermes agent a $100 Stripe envelope, ran a freight-triage micro-pilot, captured the raw tool-call the agent tried to make, blocked it with a real 403 from NemoClaw, and saved the governed run as a reusable playbook.
>
> Demo + repo: <LINK>
> #HermesAgent #AIagents #Stripe #NVIDIA

## Discord submission message draft

Post in the Nous Discord submissions channel:

> **Agent IC** — Hermes Agent Accelerated Business Hackathon submission
>
> A governed capital account for autonomous work. The demo funds a 72-hour micro-pilot, blocks an out-of-policy action, imports ROI evidence, and saves a reusable Hermes playbook.
>
> Demo video: <X_LINK>
> Repo / live demo: <REPO_LINK>

## Typeform answer draft

Use these answers as a starting point for the official Typeform.

**Project name:** Agent IC

**One-sentence description:** A governed capital account that approves bounded spend envelopes for agentic micro-pilots, blocks out-of-policy actions, imports ROI evidence, and saves reusable Hermes playbooks.

**What it does:** Agent IC turns enterprise AI pilot proposals into capital experiments. It scores the mission, creates a Stripe Checkout authorization with governance metadata, runs a deterministic or live micro-pilot, blocks unsafe tool requests, measures cost/quality/throughput evidence, and issues a continue/revise/kill decision. The learned procedure is saved as a Hermes playbook for reuse.

**How it uses the sponsor stack:**
- **Hermes:** proposal intake normalization, reusable skill/playbook persistence, memory of prior experiments.
- **NVIDIA/Nemotron:** optional NIM/OpenAI-compatible live evaluation and evidence synthesis; deterministic fallback keeps rehearsals safe.
- **Stripe:** Checkout Sessions create bounded, metadata-tagged spend authorizations; demo mode is safe, live mode with `STRIPE_SECRET_KEY`.
- **NemoClaw/OpenShell:** policy envelope, tool scopes, blocked-action enforcement, and kill criteria.

**Demo link:** <X_VIDEO_LINK>

**Repo link:** <REPO_LINK>
