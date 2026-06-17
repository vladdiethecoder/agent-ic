# Agent IC v10 Demo-Video Research

Research and decisions behind the final local-first demo-video pipeline for Agent IC.

## Executive summary

The Agent IC v10 submission video is produced with a **local-first, offline-capable** toolchain:

- **Browser capture:** Playwright records the `/run` operator console at 1920×1080/30 fps in headless Chromium.
- **Voiceover:** local TTS via **Kokoro** (primary) with an **edge-tts / espeak-ng** fallback; output is resampled to 48 kHz stereo with FFmpeg.
- **Caption alignment:** `faster-whisper` (or `whisper.cpp`) generates word-level timestamps from the rendered WAV and the script.
- **Edit / composite:** Remotion composes the base UI recording, audio, burned captions, and animated call-outs.
- **Final mux/normalization:** FFmpeg packages the render into `demo-out/agent-ic-demo-final.mp4` (h264, AAC, 48 kHz stereo, under 3 minutes).
- **Optional overlays:** MoviePy can be inserted for quick programmatic motion graphics if Remotion call-outs are insufficient.

Why this stack:

1. **No cloud API keys are required** for the default render path, keeping rehearsals presenter-safe.
2. **Every asset is reproducible** from `demo/voiceover-final.txt`, the seeded proposal payload, and the deterministic decision engine.
3. **The pipeline is scriptable** end-to-end (`npm run demo:video`), which matters for a hackathon where the final cut may need to be regenerated hours before submission.
4. **Playwright captures the real app**, not a screen recorder, so the video stays in sync with code changes.

## TTS comparison

| Model | Quality | Latency | RTX optimization | Install complexity | License | Best use |
|---|---|---|---|---|---|---|
| **Fish Speech S2 Pro** | Excellent; natural prosody, 80+ languages, inline emotion tags | RTF ~0.2 on H200; needs large GPU | SGLang/CUDA; very fast on datacenter GPUs | High; ~4B + 400M Dual-AR, Python env, model download | Fish Audio Research License | High-fidelity narration, multilingual demos, voice cloning |
| **Chatterbox Turbo** | Very good; 350M params, expressive tags, fast | Low; designed for throughput | CUDA/ROCm/MPS; RTX friendly | Medium; Python env + HF model, ~2 GB | MIT (engine); model license varies | Fast local narration, expressive agents, audiobook-scale text |
| **Kokoro** | Very good for its size; 82M params, natural English | Very low; CPU-realtime | CUDA optional; runs great on RTX with ONNX | Low; `pip install kokoro`, optional ONNX weights | Apache-2.0 weights; MIT inference code | **Default for Agent IC**: local, fast, permissively licensed |
| **XTTS-v2** | Excellent voice cloning; good multi-speaker TTS | ~1× RT on RTX 4090, slower on CPU | CUDA strongly recommended | Medium; `pip install coqui-tts`, auto-downloads | Coqui Public Model License (non-commercial) | Internal demos, voice-cloned personas, non-commercial use |
| **Piper** | Good; lightweight, deterministic | Very low; real-time on Raspberry Pi | ONNX Runtime; CUDA optional | Very low; single binary + ONNX voice | MIT | Embedded/edge, accessibility, low-resource environments |

**Agent IC choice:** Kokoro is the default because it is the best balance of quality, speed, license, and install simplicity for a single-narrator English demo. Fish Speech S2 Pro and Chatterbox Turbo are reserved as upgrade paths if voice cloning or richer prosody become required.

## Editing-pipeline comparison

| Pipeline | Capabilities | Local/offline | Maturity | Risks | Recommendation |
|---|---|---|---|---|---|
| **Playwright + Remotion + FFmpeg** | Programmatic React-based compositions: intro/outro cards, animated call-outs, burned captions, precise frame timing | Fully local once assets exist | High; Remotion is production-grade | Requires TypeScript/React expertise; render time depends on CPU/GPU | **Primary pipeline for Agent IC v10** |
| **Playwright + faster-whisper + FFmpeg** | Direct transcription → SRT/VTT → FFmpeg burn-in; lightweight, no React | Fully local | High; battle-tested ASR | Manual layout/animation; harder to make cinematic call-outs | Good for quick subtitle-only cuts, not for polished final demo |
| **Playwright + MoviePy + FFmpeg** | Python-driven programmatic overlays, cuts, text, transitions | Fully local | Medium; mature but less typed | GIL/performance limits; fewer safety rails than Remotion | Useful for throwaway motion graphics or when the team is Python-first |

**Agent IC choice:** Remotion is the composition layer because the demo needs staged animations (mission → envelope → blocked → evidence → decision → counterfactual) and precise caption/callout timing. faster-whisper feeds caption data into Remotion. FFmpeg is the final encoder. MoviePy is documented as an optional escape hatch.

## Atlas Freight demo beats

```mermaid
timeline
    title Agent IC Atlas Freight — Evaluate → Fund → Govern → Measure → Decide
    section Evaluate
        0:00-0:25 : Hook & workbench
                  : Atlas Freight proposal
                  : Hermes normalizes intake
                  : Nemotron-style evaluation
    section Fund
        0:25-0:55 : $185,000 pilot budget
                  : ~$35,000 autonomous spend cap
                  : 38-day payback, 2.36× 90-day ROI
                  : Stripe bounded authorization
    section Govern
        0:55-1:25 : Policy envelope
                  : Model, Hermes, SaaS, Stripe, evidence scopes
                  : Blocked out-of-policy action
                  : Audit log as product
    section Measure
        1:25-2:00 : Week 2 / 4 / 6 / 8 evidence timeline
                  : Gross impact, spend consumed, net value
                  : Evidence grade and kill criteria
    section Decide
        2:00-2:42 : Week 8 Continue decision
                  : Finance-readable ledger
                  : Saved Hermes playbook
                  : Why it wins/usefulness/viability/presentation
```

Target total length: **2:42–2:48**. The 347-word voiceover is read at roughly 125 wpm with deliberate pauses between beats.

## Primary-source links

- Hermes Agent optional skills catalog (payments, skills system): https://hermes-agent.nousresearch.com/docs/reference/optional-skills-catalog
- NVIDIA NemoClaw overview / quickstart: https://nemoclawai.io/docs/about/overview/
- NVIDIA NIM LLM API reference (`/v1/chat/completions`): https://docs.api.nvidia.com/nim/reference/llm-apis
- Stripe Checkout Sessions API: https://docs.stripe.com/api/checkout/sessions/create
- Stripe Checkout quickstart: https://docs.stripe.com/payments/quickstart-checkout-sessions
- Playwright video recording docs: https://playwright.dev/docs/videos
- FFmpeg documentation: https://ffmpeg.org/documentation.html
- faster-whisper repository: https://github.com/SYSTRAN/faster-whisper
- Kokoro repository: https://github.com/hexgrad/kokoro
- Chatterbox TTS / Resemble AI: https://github.com/resemble-ai/chatterbox (model) / https://github.com/devnen/Chatterbox-TTS-Server (server)
- whisper.cpp repository: https://github.com/ggml-org/whisper.cpp

---

*Last updated for Agent IC v10 final submission.*
