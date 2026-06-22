# Agent IC Demo Remediation Plan - Current

**Current MP4:** `demo-out/agent-ic-demo-final.mp4`  
**Current duration:** 73.13 s  
**Current state:** deterministic gates pass; ChatGPT 5.5 review gates pass.

## Completed Remediations

- Re-rendered the final video from current source.
- Fixed the visible internal audit ID label that OCR could confuse with a port marker.
- Kept final QR target clean and decodable: `https://github.com/agent-ic`.
- Preserved professional Stripe wording: test mode, no raw cents UI.
- Preserved product framing: Agent IC buys/evaluates agentic services, governs worker-agent actions, measures productivity, and controls expansion.
- Preserved evidence derivation: public NHTSA source, row preview, source receipt, artifact hash.
- Preserved live proof surfaces: Hermes dispatch receipt, Nemotron request/rationale, Stripe test-mode receipt, external policy 403.
- Re-ran `npm test`, `npm run build`, `npm run smoke`, `npm run smoke:api`, `npm run smoke:browser`, `npm run demo:qa`, and `npm run demo:frame-qa` against the current MP4.
- Added ChatGPT 5.5 agent reviews as the active review layer.
- Switched final narration generation to Edge neural TTS via `edge-tts`.
- Replaced the Palmier Pro macOS handoff with a local open-source mcp-video final edit and verification pass without changing product proof URLs.

## Current Passing Gates

| Gate | Result |
|---|---|
| Tests | PASS, 95/95 |
| Build | PASS |
| Smoke | PASS |
| API smoke | PASS |
| Browser smoke | PASS |
| Video QA | PASS, 53/53 |
| Frame QA | PASS, 10/10 |
| Extracted frames | 2,194/2,194 |
| Audio | Edge TTS, -16.1 LUFS, no silence >= 4 s |
| QR | decodes at the end card |
| ChatGPT 5.5 specialized reviews | PASS, 20/20 |
| ChatGPT 5.5 overarching reviews | PASS, 20/20 |
| ChatGPT 5.5 product reviews | PASS, 10/10 |

## Review Commands

```bash
npm run demo:chatgpt55-20
npm run demo:chatgpt55-20:goals
npm run demo:chatgpt55-10:product
```

Reports:

- `demo-out/chatgpt55-reviews/final-20-report.json`
- `demo-out/chatgpt55-reviews/overarching-20-report.json`
- `demo-out/chatgpt55-reviews/product-10-report.json`

## Completion Rule

Do not mark a future render complete until:

- `npm run demo:video` passes.
- `npm test` passes.
- `npm run build` passes.
- `npm run smoke`, `npm run smoke:api`, and `npm run smoke:browser` pass.
- All 50 ChatGPT 5.5 review prompts pass.
- Final stale/private text scan is clean.
