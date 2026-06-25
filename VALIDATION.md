# Validation Checklist

Do not mark the demo complete unless every gate below passes.

## Code Gates

```bash
npm test
npm run build
npm run smoke
npm run smoke:api
npm run smoke:browser
npm run submission:preflight
npm run public:export
```

## Final Video Gate

```bash
npm run demo:qa:v18
npm run demo:frame-qa:v18
```

Required outputs:

- `demo-out/agent-ic-demo-final-winning-v3.mp4`
- `demo-out/stage-events-winning-v3.json`
- `demo-out/video-qa-report-winning-v3.json`
- `demo-out/frame-review-winning-v3.json`
- Image/video analysis outputs: sampled frames, contact sheets, black/freeze/silence detection, frame hashes, frame-detail metrics, and frame-difference metrics.

## Product Thesis Requirements

- The video must show Agent IC governing an agentic service purchased or trialed by an enterprise.
- The workload must be real, inspectable, or explicitly labeled rehearsal data. The primary submission workload is the public NHTSA ODI complaint snapshot under `data/nhtsa-complaints-run/`.
- The worker agent or service must perform visible work under Agent IC policy.
- Agent IC must show the service envelope, allowed tools, blocked tools, spend cap, policy receipt, evidence, and final renewal/expand/kill decision.
- The video must not read as a dataset analysis tool, claims bot, RMA copilot, or generic dashboard.

## Frame-By-Frame Requirements

- The first frames show a clean pre-run state.
- A visible cursor clicks `Run service trial`.
- Provider states do not show completed live latency before the run starts.
- Hermes proof shows either a gateway task id or a NemoHermes sandbox session id when live Hermes is claimed; otherwise the video must label the output as a Hermes-compatible playbook artifact.
- Stripe proof shows `cs_test...`, dollar-denominated test-mode authorization, and retrieve/status metadata.
- Nemotron proof shows request ID, readable rationale, and timing captured in the proof report.
- NemoHermes/OpenShell proof shows HTTP `403` only when the external sandbox receipt is present; otherwise label the visible receipt as policy-gate proof.
- Evidence import displays source, row count, hash, computed routing metrics, measured runtime, and service outcome.
- `SKILL.md` is shown and `Run from playbook` executes a second governed service trial.
- No visible local hostnames, local ports, private workspace paths, DevTools, fake/demo markers, raw keys, or full long IDs.
- No hover status bubble exposes local API URLs.
- No raw cents language appears in captions or primary UI.
- No old Atlas Freight proof-run language appears in the final submission video.
- No audio silence segment lasts 4 seconds or longer.
- Video QA must use image and video analysis tools (`ffprobe`, `ffmpeg`, and ImageMagick or equivalent). OCR is allowed only as a diagnostic aid and cannot be the primary pass/fail signal.
- Contact sheets and sampled frame-difference metrics must prove the rendered video is nonblank, varied, and progressing through the proof arc.
- Runtime is 60-180 seconds for the public submission cut; the short strict-proof cut may remain 60-90 seconds.
- The frame-review gate must report `PASS`; use ChatGPT 5.5 or the configured OpenAI-compatible vision endpoint for an independent harsh review when available.

## Fail-Closed Rules

- Missing Nemotron live request ID fails strict recording.
- Missing Hermes gateway task id or NemoHermes sandbox session id fails strict recording.
- Missing Stripe test-mode create/retrieve proof fails strict recording.
- Missing external NemoHermes/OpenShell 403 receipt fails an external-live policy claim; policy-gate proof is allowed only when labeled honestly.
- Local policy-gate output cannot satisfy an external-live policy proof claim.
- Frame review cannot be skipped for a submission candidate.
