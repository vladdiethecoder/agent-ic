# Agent IC Judge Scorecard

## 30-Second Verdict

Agent IC is a governed buying control plane for enterprise AI agents. It funds bounded vendor trials, controls spend and tool access, blocks unsafe actions, measures real evidence, and turns the result into a continue/revise/kill procurement decision.

Public repo: `https://github.com/vladdiethecoder/agent-ic`

Immutable public release tag: `hackathon-submission-2026-06-25-final`

Release tag URL: `https://github.com/vladdiethecoder/agent-ic/tree/hackathon-submission-2026-06-25-final`

Timestamped video guide: `VIDEO_JUDGE_GUIDE.md`

Primary demo video: `demo-out/agent-ic-demo-final-winning-v3.mp4`

Video SHA-256: `5da9da4f9b200fe4f304698d8325d225f5965119d5e98c9682c3c82e0fa14726`

Optional X cover: `demo-out/agent-ic-x-cover-proof.jpg`

Cover SHA-256: `d54a90f93ae9e11330cb0087df4633e70dbf284e32f6ed1e03c5b2fea0d48be1`

## Criteria Map

| Criterion | Judge-Facing Claim | Proof To Look For |
|---|---|---|
| Usefulness | Enterprise buyers need a way to decide which vendor agents deserve budget, tools, and production access before a contract expands. | $100 Stripe test-mode spend envelope, 330 public NHTSA ODI rows, $150 CARFAX policy block, ROI/waste/vendor-claim metrics, renewal ledger evidence. |
| Viability | The app is a working Next.js control plane with proof gates, receipts, validators, and honest production boundaries. | `npm run judge:check`, `npm run release:check`, masked `/api/proof-report`, Nemotron request evidence, NemoHermes sandbox receipt, public workload hash, signed/export proof docs. |
| Presentation | The video is short, clean, and proof-first, with the product URL and decision arc visible in-frame. | 114.84 second 1920x1080 H.264/AAC MP4, final posting packet, optional X cover, video/frame QA reports, image/video QA tooling with OCR diagnostic only. |

## What To Run First

In a public clone:

```bash
npm ci
npm run judge:check
```

In the private submission workspace with generated media present:

```bash
npm run submission:cover
npm run submission:preflight
npm run demo:qa:v18
npm run demo:frame-qa:v18
```

## Honesty Boundaries

- Stripe evidence is test-mode Checkout Session evidence, not production money movement.
- Agent IC is an enterprise-grade prototype and control-plane framework, not a fully deployed production SaaS.
- Generated videos, frame dumps, browser profiles, local state, `.env.local`, and private proof artifacts are intentionally excluded from the public repo.
- OCR is diagnostic only; video QA uses `ffprobe`, `ffmpeg`, ImageMagick, frame hashes, detail metrics, and frame-difference analysis as pass/fail signals.

## Submission Artifacts

- `JUDGE_QUICKSTART.md` is the fastest repo entry point.
- `VIDEO_JUDGE_GUIDE.md` is the timestamped video watch map and transcript.
- `SUBMISSION_MANIFEST.json` is the machine-readable proof map.
- `FINAL_SUBMISSION_PACKET.md` is the full evidence packet.
- `POSTING_PACKET.md` contains the X copy, alt text, Discord copy, Typeform answers, and final account checklist.
- `demo-out/agent-ic-demo-final-winning-v3.mp4` should be attached to the X post.
- `demo-out/agent-ic-x-cover-proof.jpg` is the optional custom X cover image.
