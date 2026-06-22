# Agent IC Demo Video - Current-State Audit

**Video:** `demo-out/agent-ic-demo-final.mp4`  
**Render duration:** 73.13 s  
**Frames:** 2,194 at 30 fps  
**Resolution:** 1920x1080  
**Audio:** Edge TTS voiceover, AAC, -16.1 LUFS, no silence >= 4 s  
**Date:** 2026-06-19

## Verdict

The current MP4 passes the deterministic video/frame gates, build/test gates, and the ChatGPT 5.5 agent review layer.

## Gate Results

| Gate | Result |
|---|---|
| `npm test` | PASS, 95/95 |
| `npm run build` | PASS |
| `npm run smoke` | PASS |
| `npm run smoke:api` | PASS |
| `npm run smoke:browser` | PASS |
| `demo-out/video-qa-report-final.json` | PASS, 53/53 |
| `demo-out/frame-review-final.json` | PASS, 10/10 |
| Frame extraction | 2,194/2,194 |
| Contact-sheet OCR | clean |
| Vision frame review | not enabled in deterministic frame gate; covered by ChatGPT 5.5 review suites |
| QR decode | `https://github.com/agent-ic` at the final end card |
| ChatGPT 5.5 specialized reviews | PASS, 20/20 |
| ChatGPT 5.5 overarching reviews | PASS, 20/20 |
| ChatGPT 5.5 product reviews | PASS, 10/10 |

## Current Proof State

| Area | Current evidence |
|---|---|
| Hermes | masked `hermes-session...11e4`, `task-dispatched`, sandbox `agent-ic-hermes` |
| Nemotron | live `nvidia/nemotron-3-super-120b-a12b`, masked request ID, rationale shown |
| Stripe | masked `cs_test` Checkout Session, explicitly test mode |
| Policy gate | external live proof, HTTP 403, `NemoClaw/OpenShell broker` |
| Blocked action | CARFAX vehicle-history report, `$150` attempted against `$100` cap |
| Evidence | public NHTSA ODI workload, source URL, row preview, artifact hash |
| Playbook | `skills/governed-agentic-service-trial-v1.SKILL.md` |

## Product Metrics

| Metric | Value |
|---|---:|
| Public workload rows | 330 |
| Routed by service | 283 |
| Human review queue | 47 |
| Routing coverage | 100% |
| QA agreement | 86% |
| Critical incidents | 0 |
| Review hours avoided | 28.3 |
| Human queue cost | `$3,036` |
| Agent IC governed cost | `$532` |
| Net value | `$2,504` |
| Productivity lift | 7.0x |

## Timing

| Stage | Offset |
|---|---:|
| Proposal | 8.61 s |
| Evaluate | 10.43 s |
| Fund | 12.26 s |
| Govern | 14.46 s |
| Decide | 18.89 s |

The stage timing is ahead of the relevant narration beats. The prior visible lag, where narration described model or policy work before the UI reached it, is resolved.

## ChatGPT 5.5 Review State

| Suite | Current result |
|---|---|
| 20 specialized prompts | PASS, 20/20 |
| 20 overarching prompts | PASS, 20/20 |
| 10 product-specific prompts | PASS, 10/10 |

Reports:

- `demo-out/chatgpt55-reviews/final-20-report.json`
- `demo-out/chatgpt55-reviews/overarching-20-report.json`
- `demo-out/chatgpt55-reviews/product-10-report.json`

## mcp-video Edit Handoff

mcp-video is the open-source local video-editing MCP/CLI now used for the final pass. It runs in this Linux validation environment through `uvx --from mcp-video mcp-video`, exposes 119 direct MCP tools, and keeps final checks local/inspectable:

- `docs/mcp-video-final-edit-pass.md`
- `demo-out/mcp-video-final-edit-pass.json`

The handoff inspects the final MP4, extracts proof frames, runs mcp-video quality checks, verifies ffprobe metadata, and keeps captions above bottom proof UI fail-closed.

## Current Known Blocker

None in the current acceptance evidence. If the MP4 is re-rendered, rerun the video/frame gates and all ChatGPT 5.5 review suites from the new artifacts.
