## 1. Timeline of Technical Vulnerabilities & Red Flags

| Timestamp | Visual/Audio Element | Why This Fails / Suspected Hardcoding | Tier-1 Corrective Action |
|---|---|---|---|
| 00:00 | Product-only browser capture with no URL bar, no terminal, no network tab. Top badges read `HERMES READY`, `NIM / NEMOTRON READY`, `PAYMENTS READY`, `POLICY GATE READY`; CTA is `Run service trial`. | Leak-safe, but judge-hostile: the entire proof surface is inside the same app that is making the claims. No independent browser chrome, shell, Stripe dashboard, or raw network trace anchors the run as live. `scripts/record-live-demo.mjs` intentionally hides URL bar/DevTools; `video-qa-report-final.json` passes that as provenance, not visual proof. | Keep leak-safe capture, but add a visible independent proof gutter: run id, wall-clock elapsed timer, SSE event sequence, masked raw provider request ids, and a `/api/proof-report` hash/QR pane. One app card is not enough for first-place authenticity. |
| 00:00-00:01 | Clean pre-run state shows many placeholder cards already laid out (`Waiting for run`, `awaiting tool call`, `waiting for click`, proof stream waiting). | The layout is clean, but visually resembles a precomposed dashboard template. A judge cannot yet distinguish real event appends from a staged state machine. | Before click, show an empty append-only event log with row count `0`, `last_event=null`, and a run id minted only after click. Make the state transition visible, not just styled. |
| 00:02-00:08 | UI advances into `Registering the agentic service under Agent IC` and then `Nemotron is evaluating the service trial`; caption says Northstar is testing NHTSA complaints. | This is the strongest live-looking section, but the stage advancement is too compressed. The first real model wait is only briefly visible; there is no raw NIM request payload/response or stream token evidence. | Hold the Nemotron wait for 2-3 seconds with a masked request body summary and `POST /chat/completions` start/end timestamps. Add request id after response, not before. |
| 00:08-00:10 | In roughly two seconds, the screen jumps from Nemotron wait to final decision: `The service earns the next governed cap`; top row already shows Hermes live, Nemotron live, Payments test mode, NemoClaw live, policy block `403`, next cap `$250`. | This is the highest pre-baked-data risk. Multiple independent operations appear resolved nearly simultaneously: Hermes dispatch, Nemotron rationale, Stripe checkout, OpenShell 403, evidence import, and decision. Even if real, the video pacing makes it look like a seeded payload reveal. | Do not reveal final decision until the viewer sees each receipt land sequentially. Use a strict event cascade: Hermes -> Nemotron -> Stripe create/retrieve -> policy 403 -> evidence import -> decision. Minimum 1.0-1.5s visual dwell per receipt. |
| 00:10 | CTA changes to `Trial recorded`; final verdict appears while narration says, `The envelope is $100. No payment moves, no policy opens, until receipts land.` | Narrative order and visual order are mismatched. The screen has already landed receipts and the decision while the voiceover is still explaining prerequisites. This makes the final state feel post-recorded rather than currently executing. | Align voiceover timing to UI states. At this narration line, screen should still show pending fund/govern states; decision should appear only after the policy/evidence narration. |
| 00:10-00:23 | Final decision screen remains mostly static while narration says, `Hermes dispatch is in. I wait for Nemotron; the card shows the request ID and rationale.` | By this time the screen already displays the final cap, 403, evidence, and decision. The phrase `I wait for Nemotron` is contradicted by the fully-resolved UI. | Either move the voiceover earlier or keep the UI on the Nemotron wait panel until the line completes. Judges notice timing mismatch immediately. |
| 00:10-00:24 | `Decision assembled from receipts` cards show `MODEL RECEIPT`, `PAYMENT ENVELOPE`, `POLICY BOUNDARY HTTP 403`, `WORKLOAD EVIDENCE 330 rows`, `PRODUCTIVITY MATCH $3,036 -> $532`; side panel shows masked Nemotron/Stripe ids. | Strong proof vocabulary, but it is still rendered by the product itself. IDs are heavily masked; no external dashboard or raw retrieval proof is visible. A malicious demo could render identical cards from JSON. | Add a revealable proof drawer with hashed raw responses and a one-line independent verification command: `curl /api/proof-report | jq .receipts.stripe.sessionIdSha256`. Show this in-video for 2 seconds. |
| 00:24-00:31 | Stripe caption is honest: `Stripe is test mode on purpose`; UI shows `cs_test_a1CY2n...CNIC` / test-mode Checkout. | Good honesty, but still no hosted Stripe Checkout page, dashboard event, webhook receipt, or retrieval JSON. It proves a test-mode session id exists in the app, not visually that Stripe received/retrieved it. Code supports real API creation/retrieval (`lib/stripeAdapter.js:44-96`, `app/api/run-capital-experiment-v8/route.js:288-304`), but the video does not show the external Stripe surface. | Insert one zoomed proof beat: Stripe API create + retrieve statuses, metadata match, `cs_test` id hash, and `payment_status=unpaid`/test-mode label. Do not need full dashboard, but show more than an in-app card. |
| 00:29-00:40 | Worker asks for `$150 CARFAX vehicle-history report`; `$100` cap blocks it; `HTTP 403 blocked`; OpenShell/NemoHermes policy card appears. | This is the best story beat and should be the hero. Current implementation buries it in a dense top panel and side log. It is red, but not cinematic enough for the core product moment. | Freeze/zoom this beat full-screen: request amount, cap, policy rule checks, broker, 403 response, and `externalLive=true`. This should be the most memorable 5 seconds of the video. |
| 00:30-00:40 | `Run from playbook replay running` then `Replay complete` appears without a second visible user click. | The replay can look automated/staged. More importantly, code shows `/api/run-from-playbook` invokes the v8 route with `skipNemotron: true` and `requireLiveProof: false` (`app/api/run-from-playbook/route.js:27-30`). Calling it `Not a prettier approval. A second receipt.` overstates strict-live equivalence. | Either make replay strict (`requireLiveProof: true`, fresh Nemotron/Stripe/policy receipts) or label it explicitly as `bounded local playbook replay`. If it stays local, do not call it the same proof class as the first run. |
| 00:39-00:47 | Voiceover: `That block is the product`; screen still shows decision/evidence/playbook. | Correct product thesis, but visually the block is no longer dominant. The viewer’s eye goes to many green receipt cards instead of the red denied action. | Make the blocked action remain pinned as a large red receipt while downstream cards appear below it. The judge should remember `150 > 100 => 403`, not hunt for it. |
| 00:45-00:52 | Narration claims a second service replay. UI shows `Northstar Safety Ops Recall-priority worker-agent service... verdict CONTINUE`, then moves into cost card. | This is useful, but weakly evidenced. The route can run without live proof, and the visual does not show a new independent run id, provider ids, or policy result for the second service. | Add a second-run mini receipt: `runId=playbook-replay-*`, proposal id, strict/live flags, new Stripe/Nemotron/policy ids or explicit `local replay` label. |
| 00:48-00:60 | View scrolls down. Left column contains Hermes receipt, playbook proof, and cost card; right ~60% of viewport is mostly blank dark background. | Presentation failure. The most commercially persuasive card (`$3,036` vs `$532`) is small and off-left while the screen wastes huge space. This fails the 15-second scannability test on a judge’s laptop. | Re-layout final section as a centered full-width board: cost delta, NHTSA rows, policy block, next cap. Avoid scrolling a left rail through empty space. |
| 00:48-00:61 | `Hermes execution receipt` card shows `hermes-session-2...11e4`, official payment skills, NemoHermes sandbox summary, and tool calls. | Good evidence but too small. The important sponsor proof is unreadable in the rendered 1080p Twitter player without pausing. | Zoom into the Hermes receipt for 2 seconds or use large type: `skillSource=nemohermes-sandbox`, `session hash`, selected Stripe skills, `checkout_session_created`, `blocked`, `recorded`. |
| 00:52-00:60 | Evidence and ROI are presented after the verdict. Voiceover: `Evidence: 330 NHTSA complaints, 283 routed, 47 left for people.` | The evidence is real/inspectable (`data/nhtsa-complaints-run/SOURCE.md:3-13`), but the workload is a local snapshot fetched before the run (`Fetched: 2026-06-18T15:27:53.782Z`). The video does not show live NHTSA fetch/import at run time. | Label this honestly as `public NHTSA snapshot imported during trial` or show a live fetch/proof hash generation step. Do not let judges infer that the agent fetched fresh data during the recording unless it did. |
| 00:59-00:66 | Cost card: `$3,036` human queue vs `$532` governed run. | The business value is good, but calculation assumptions are tiny text and deterministic (`lib/nhtsaEvidence.js:32-36`, `81-87`). It risks looking like a made-up ROI number because the math is not visually auditable. | Put the formula on screen in large type: `330 × 6 min × $92/hr = $3,036`; `47 × 6 min × $92/hr + $100 = $532`. |
| 00:61-00:72 | `HERMES-COMPATIBLE SKILL.MD PACKAGE` appears; code block is shown in a small scroll area. | Source proof exists, but the key playbook content is too small and partly clipped. A judge cannot read the actual policy/evidence/cap rules quickly. | Replace with a full-screen SKILL.md proof card showing only 5 highlighted lines: name, cap rule, evidence checks, blocked paid vendor, human-in-loop expansion. |
| 00:64-00:73 | Final screen still has a lot of small receipt UI, bottom captions, event ticker, side buttons, and blank right space. | Visual hierarchy is noisy: proof, cost, playbook, source, and CTA all compete. The product is real-looking, but the late segment is not optimized for first-place presentation. | Build a dedicated `/submit` or `/recording-final` layout for the final 15 seconds: one panel per claim, no scrollbars, no tiny code blocks. |
| 00:74-00:76 | QR card: `Audit the Agent IC source profile`, `github.com/agent-ic`; verified separately as HTTP 200. | Good public handoff, but 2-3 seconds is short for scanning. It says source and receipts are prepared, but the visible URL is a repo/profile, not a direct proof-report permalink. | Hold QR for 5 seconds and include a short URL plus `proof-report.json`, `SOURCE.md`, `SKILL.md`, and video hash in plain text. |
| Entire video | Automated QA passes: codec, OCR forbidden text, no leaks, proof artifacts, frame extraction. | QA pass is necessary but not sufficient. `frame-review-final.json` says vision review was skipped (`AGENT_IC_REQUIRE_VISION_FRAME_QA is not true`), and the current risks are presentation/authenticity risks, not codec/OCR risks. | Add a mandatory adversarial visual QA gate that scores: external proof visibility, stage/narration sync, readable sponsor receipts, second-run strictness, and 15-second scannability. |
| Entire video | No obvious secrets, local URLs, raw keys, or localhost visible. | This is a strength, but it also removed common authenticity anchors. The demo must compensate with independent, legible, masked proof surfaces. | Keep leak hygiene. Add masked external receipts rather than browser chrome if chrome is too risky. |

## 2. Sponsor Alignment Gap Analysis

NVIDIA / Nemotron / NemoClaw:

- Verdict: LIVE-BY-PROVENANCE, PARTLY UNDER-SHOWN IN VIDEO.
- Evidence found:
  - `lib/nimClient.js:6-23` calls `https://integrate.api.nvidia.com/v1/chat/completions` with model default `nvidia/nemotron-3-super-120b-a12b`.
  - `demo-out/provenance-final.json:41-49` records `requestIdMasked: chatcmpl-b8508...d9c5`, model `nvidia/nemotron-3-super-120b-a12b`, state `live`, latency `3647ms`, rationale, confidence.
  - `lib/nemoclawClient.js:226-266` runs `nemohermes ... exec ... curl ...` and treats HTTP 403 / policy denial as the external gate receipt.
  - `demo-out/provenance-final.json:79-83` records `externalLive: true`, `status: 403`, actor `NemoClaw/OpenShell broker`.
- Gaps:
  - The video shows in-app receipts, not raw NIM response, not raw OpenShell command output, and not an independent sandbox status screen.
  - NemoClaw/OpenShell is visually compressed into a small card. A judge can miss the external-live distinction and assume local policy theater.
  - The most important technical moment, `$150 request vs $100 cap => 403`, is present but not dominant enough.
- Corrective bar:
  - Show one enlarged `NVIDIA NIM` receipt with model, masked request id, latency, and response hash.
  - Show one enlarged `NemoHermes/OpenShell broker` receipt with sandbox id, target host, method, status `403`, and output hash.

Stripe:

- Verdict: TEST-MODE-LIVE, HONESTLY LABELED, BUT NO EXTERNAL STRIPE SURFACE.
- Evidence found:
  - `lib/stripeAdapter.js:44-96` creates a real Checkout Session through `https://api.stripe.com/v1/checkout/sessions` when `STRIPE_SECRET_KEY` is set and demo mode is false.
  - `app/api/run-capital-experiment-v8/route.js:288-304` retrieves the session again for status proof.
  - `demo-out/provenance-final.json:29-31` records masked `cs_test_a1CY2n...CNIC`, `testMode: true`.
  - The narration explicitly says test mode and not production charge.
- Gaps:
  - The video does not show hosted Checkout, Stripe Dashboard, webhook event, or raw create/retrieve JSON.
  - The in-app receipt is plausible but not independently convincing under hostile judging.
  - Payment is `unpaid` / authorization-style session; that is fine for bounded trial proof, but should be impossible to confuse with production spend.
- Corrective bar:
  - Add a 2-second Stripe proof zoom: `mode=stripe-api-test`, `createdStatus=open`, `retrievedStatus=open`, `metadata.proposal_id`, `metadata.autonomous_spend_cap_dollars=100`, `sessionIdSha256`.

Nous Research / Hermes:

- Verdict: LIVE HERMES DISPATCH FOR PRIMARY RUN; SECOND PLAYBOOK REPLAY IS WEAKER THAN THE VIDEO LANGUAGE.
- Evidence found:
  - `lib/hermesClient.js:129-206` dispatches to NemoHermes sandbox via `hermes --pass-session-id -z` and records a `hermes-session-*` task id plus output hash.
  - `demo-out/provenance-final.json:33-40` records `skillSource: nemohermes-sandbox`, sandbox id `agent-ic-hermes`, state `task-dispatched`, and output SHA-256.
  - UI shows Hermes execution receipt, official payment skills, and SKILL.md handoff.
- Gaps:
  - Fallback paths exist in `lib/hermesClient.js:37-47`, `77-87`, `95-125`; strict primary proof prevents fallback from passing, but judges cannot see that fail-closed logic in the video.
  - `/api/run-from-playbook` explicitly calls the v8 route with `skipNemotron: true` and `requireLiveProof: false` (`app/api/run-from-playbook/route.js:27-30`). The video calls it a second receipt, but it is not visibly a second strict-live Hermes/Nemotron/NemoClaw proof.
  - Hermes evidence is too small to read at 1080p Twitter playback.
- Corrective bar:
  - Primary run: show fail-closed condition or proof summary from `buildLiveProofFailures` in one readable card.
  - Replay run: either make it strict-live or label it as local bounded replay. Do not imply same proof strength unless it actually re-runs live provider gates.

Workload / enterprise usefulness:

- Verdict: USEFUL AND COHERENT, BUT SNAPSHOT-BASED.
- Evidence found:
  - `data/nhtsa-complaints-run/SOURCE.md:3-13` gives public NHTSA ODI URL, vehicle query, fetch timestamp, 330 rows, and rows SHA-256.
  - `lib/nhtsaEvidence.js:38-87` derives routing, human queue, hours saved, and cost metrics from local rows.
- Gaps:
  - The workload is a repository snapshot, not visibly fetched live during the demo.
  - Routing logic is deterministic and not itself an external worker-agent service. The product claim is governance around the worker, so this is acceptable only if labeled as a controlled service trial harness.
- Corrective bar:
  - Put `snapshot fetched`, `rows hash`, and `routing formula` in large type, or add a live `fetch NHTSA -> hash -> import` step.

## 3. UI/UX & Scannability Roast

- The core mechanism is there, but it is visually overpacked. At 10 seconds the screen contains sponsor badges, phase pills, stage cards, three policy columns, a decision hero, five receipt cards, side event cards, an event ticker, CTA buttons, and subtitles. A judge can understand the category, but not audit the mechanism without pausing.
- The first 15 seconds violate story order. The screen lands the final decision while the voiceover is still explaining prerequisites. That reads like post-produced state reveal, not a causal run.
- The best beat is the blocked `$150` CARFAX request, but the composition does not treat it as the hero. The red 403 cards are visually smaller than the green success cards. For this hackathon, the block is the product; it needs to dominate the frame.
- The late scroll is a presentation regression. From 48s onward, the most important enterprise-value evidence sits in a narrow left column while the right side is mostly blank. This looks like a real app being screen-recorded, but not like a first-place demo edit.
- Text is too small for Twitter compression. `Hermes Agent v0.14.0`, official skills, SKILL.md content, hashes, and audit cards are the exact proof judges care about, but they are barely legible in the video frame.
- Color semantics are overloaded. Green means ready, live, success, selected, proof, CTA, and source; red means blocked and risk; yellow means pending/test. It is cohesive but not instantly decodable.
- The video avoids dangerous leaks well: no localhost, no private path, no raw keys, no full ids. But the cost is authenticity. Since no browser chrome/terminal is visible, the app must expose stronger independent proof inside the UI.
- The narration is honest and better than typical TTS demos, but several lines are out of sync with the visual state. `I wait for Nemotron` over a finished decision screen is the biggest offender.
- The QR ending is credible and reachable, but too short. It should be a proof handoff, not a blink-and-you-miss-it outro.

## 4. Final First-Place Optimization Checklist

Must-Do (engineering / proof integrity):

- Make `/api/run-from-playbook` strict-live or relabel it. Current code sets `skipNemotron: true` and `requireLiveProof: false`; do not sell that as the same proof class as the first run.
- Add a first-class proof report card to the video: video SHA-256, run id, Stripe session hash, Nemotron request hash, Hermes session hash, policy 403 hash, NHTSA rows hash.
- Add visible sequential event timing. The current jump from Nemotron wait to fully resolved decision is too fast and too easy to read as pre-baked.
- Make the policy block the hero. Full-screen card: `worker request $150 CARFAX`, `approved envelope $100`, `human approval missing`, `OpenShell/NemoClaw 403`, `decision: block`.
- Show that NHTSA evidence is a public snapshot, not magic fresh data. Either live-fetch it during the run or label snapshot fetch time and hash clearly.
- Enlarge sponsor receipts. If a judge cannot read `nvidia/nemotron-3-super-120b-a12b`, `cs_test`, `nemohermes-sandbox`, selected Stripe skills, and `HTTP 403`, they will discount the integration.

Should-Do (presentation / video edit):

- Re-time the edit so final decision does not appear before narration establishes payment/policy/evidence gates.
- Replace the late left-column scroll with centered full-width proof boards.
- Hold the QR/source card for at least 5 seconds and include a direct proof URL, not only `github.com/agent-ic`.
- Add one controlled zoom per sponsor: NVIDIA/Nemotron, Stripe, Hermes/NemoHermes, policy gate.
- Reduce on-screen text density by 40-60%. Use one claim per beat, not eight simultaneous proof cards.
- Keep the no-leak policy, but compensate with masked hashes and independent proof summaries.

Nice-to-Have (narrative / competitive polish):

- Add a one-line opening thesis in the first 3 seconds: `Agent IC buys agentic services only after spend, policy, and evidence receipts pass.`
- Add a mini before/after: `without Agent IC: worker buys $150 report`; `with Agent IC: 403 + human-in-loop next cap`.
- Add a second genuinely live proposal only if it can remain within 90 seconds; otherwise remove the second-run claim or mark it local replay.
- Add a public `/api/proof-report` permalink in the QR destination if the repo supports it.
- Add adversarial visual QA to CI: fail if proof text is under a readable pixel threshold, if final decision appears before policy/evidence stages, or if vision review is skipped.

Audit artifacts produced:

- `/run/media/vdubrov/NVMe-Storage/Hackathon Submission #1/demo-out/audit-final-sha256.txt`
- `/run/media/vdubrov/NVMe-Storage/Hackathon Submission #1/demo-out/audit-ffprobe-final.json`
- `/run/media/vdubrov/NVMe-Storage/Hackathon Submission #1/demo-out/audit-frames-final/`
- `/run/media/vdubrov/NVMe-Storage/Hackathon Submission #1/docs/hackathon-demo-final-technical-audit.md`
