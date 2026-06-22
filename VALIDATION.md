# Validation Checklist

Do not mark the demo complete unless every gate below passes.

## Code Gates

```bash
npm test
npm run build
npm run smoke
npm run smoke:browser
```

## Final Video Gate

```bash
npm run demo:video
```

Required outputs:

- `demo-out/agent-ic-demo-final.mp4`
- `demo-out/provenance-final.json`
- `demo-out/stage-events-final.json`
- `demo-out/video-qa-report-final.json`
- `demo-out/frame-review-final.json`

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
- Hermes proof shows either a gateway task id or a NemoHermes sandbox session id.
- Stripe proof shows `cs_test...`, dollar-denominated test-mode authorization, and retrieve/status metadata.
- Nemotron proof shows request ID, readable rationale, and timing captured in the proof report.
- NemoHermes/OpenShell proof shows HTTP `403` only when the external sandbox receipt is present.
- Evidence import displays source, row count, hash, computed routing metrics, measured runtime, and service outcome.
- `SKILL.md` is shown and `Run from playbook` executes a second governed service trial.
- No visible local hostnames, local ports, private workspace paths, DevTools, fake/demo markers, raw keys, or full long IDs.
- No hover status bubble exposes local API URLs.
- No raw cents language appears in captions or primary UI.
- No old Atlas Freight proof-run language appears in the final submission video.
- No audio silence segment lasts 4 seconds or longer.
- Runtime is 60-90 seconds, with the submission cut targeted near 65 seconds.
- The frame-review gate must report `PASS`; use ChatGPT 5.5 or the configured OpenAI-compatible vision endpoint for an independent harsh review when available.

## Fail-Closed Rules

- Missing Nemotron live request ID fails strict recording.
- Missing Hermes gateway task id or NemoHermes sandbox session id fails strict recording.
- Missing Stripe test-mode create/retrieve proof fails strict recording.
- Missing external NemoHermes/OpenShell 403 receipt fails strict recording.
- Local policy proxy output cannot satisfy the external-live policy proof.
- Frame review cannot be skipped for a submission candidate.
