# Agent IC v11 Demo-Video Research

Research and decisions behind the v11 demo overhaul for Agent IC.

## Executive summary

The Agent IC v11 submission video keeps the same **local-first, offline-capable** toolchain as v10, but rewires the narrative and visuals to directly answer the judge critique:

1. **UI clarity** — the dense `/run` three-column console is replaced by a stage-based `/run-v11` narrative wizard with large metric badges and one primary panel at a time.
2. **Narrative arc** — the story now opens with the enterprise problem (ungoverned AI pilot spend) and closes with explicit live-demo and repo CTAs.
3. **Real capability proof** — terminal capture clips show real NemoClaw/Hermes onboarding and Stripe/MPP payment flows where the tools are installed; deterministic simulated replays fill the gaps without breaking the visual style.
4. **Polish** — consistent dark palette, live cursor motion, non-overlapping captions, and Remotion-driven call-outs.

Toolchain:

- **Browser capture:** Playwright records the `/run-v11` wizard at 1920×1080/30 fps in headless Chromium.
- **Terminal capture:** `scripts/capture-terminal-v11.mjs` detects installed CLIs and either records real output or renders deterministic fallback sessions via a headless DOM terminal renderer.
- **Voiceover:** local TTS via **Kokoro** (primary) with edge-tts/espeak-ng fallback; output is resampled to 48 kHz stereo with FFmpeg.
- **Caption alignment:** `faster-whisper` (or `whisper.cpp`) generates word-level timestamps from the rendered WAV and the script.
- **Edit / composite:** Remotion composes the base UI recording, terminal overlays, audio, burned captions, and animated call-outs.
- **Final mux/normalization:** FFmpeg packages the render into `demo-out/agent-ic-demo-v11.mp4` (h264, AAC, 48 kHz stereo, under 3 minutes).

## Why this stack for v11

1. **No cloud API keys are required** for the default render path, keeping rehearsals presenter-safe.
2. **Every asset is reproducible** from `demo/voiceover-v11.txt`, the seeded proposal payload, and the deterministic decision engine.
3. **The pipeline is scriptable** end-to-end (`npm run demo:video-v11`), which matters for regenerating the final cut close to deadline.
4. **Playwright captures the real app**, not a screen recorder, so the video stays in sync with code changes.
5. **Terminal clips are source-controlled fallbacks**, so the render never blocks on external CLI availability.

## v11 narrative beats

```mermaid
timeline
    title Agent IC v11 — Problem → Onboard → Evaluate → Fund → Govern → Measure → Decide
    section Problem
        0:00-0:20   : Ungoverned AI pilot spend
                    : Agent IC as investment committee
    section Onboard
        0:20-0:50   : NemoClaw installs Hermes sandbox
                    : Network policy + proposal normalization
    section Evaluate + Fund
        0:50-1:20   : Nemotron scores the pilot
                    : $185k budget · ~$35k cap · 38-day payback · 2.36× ROI
                    : Stripe bounded authorization
    section Govern + Measure
        1:20-1:55   : Week 2 / 4 / 6 / 8 evidence timeline
                    : Kill/continue gates
                    : NemoClaw 403 block
    section Decide + CTA
        1:55-2:42   : Continue verdict
                    : Saved Hermes playbook
                    : Live demo / source links
```

Target total length: **2:42**. The 350-word voiceover is read at roughly 130 wpm with deliberate pauses between beats.

## Terminal capture approach

| Approach | Pros | Cons | v11 use |
|---|---|---|---|
| **Headless DOM terminal renderer (xterm.js + Playwright)** | Full styling control, deterministic replay, no external agg dependency, 1080p WebM output | Requires a small rendering harness | **Primary** |
| **asciinema + agg** | Mature, faithful terminal rendering | Requires both tools installed; `agg` install is environment-specific | Fallback if already installed |
| **termtosvg / svg-term** | SVG vector output | Harder to composite into Remotion; text can overlap | Not used |

Agent IC v11 uses the headless DOM renderer as the default because it keeps the pipeline self-contained and the fallback sessions visually identical to real CLI output. The script labels simulated frames with "SIMULATED" so the audience knows which clips are real capability proof and which are deterministic stand-ins.

## Primary-source links

- Hermes Agent optional skills catalog (payments, skills system): https://hermes-agent.nousresearch.com/docs/reference/optional-skills-catalog
- NVIDIA NemoClaw overview / quickstart: https://nemoclawai.io/docs/about/overview/
- NVIDIA NIM LLM API reference (`/v1/chat/completions`): https://docs.api.nvidia.com/nim/reference/llm-apis
- NVIDIA Nemotron developer page: https://www.nvidia.com/en-us/ai/nemotron/
- Stripe Checkout Sessions API: https://docs.stripe.com/api/checkout/sessions/create
- Stripe Checkout quickstart: https://docs.stripe.com/payments/quickstart-checkout-sessions
- Stripe Link CLI docs: https://docs.stripe.com/payments/link/cli
- Stripe Projects CLI docs: https://docs.stripe.com/stripe-cli/projects
- Playwright video recording docs: https://playwright.dev/docs/videos
- FFmpeg documentation: https://ffmpeg.org/documentation.html
- faster-whisper repository: https://github.com/SYSTRAN/faster-whisper
- Kokoro repository: https://github.com/hexgrad/kokoro
- whisper.cpp repository: https://github.com/ggml-org/whisper.cpp

---

*Last updated for Agent IC v11 demo overhaul.*
