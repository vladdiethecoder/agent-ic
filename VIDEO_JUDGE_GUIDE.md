# Agent IC Video Judge Guide

Use this guide while watching `demo-out/agent-ic-demo-final-winning-v3.mp4`.

Video SHA-256: `5da9da4f9b200fe4f304698d8325d225f5965119d5e98c9682c3c82e0fa14726`

Runtime: 114.84 seconds

Public repo: `https://github.com/vladdiethecoder/agent-ic`

Immutable public release tag: `hackathon-submission-2026-06-25-final-v4`

## Fast Watch Map

| Time | What To Look For | Judging Signal |
|---|---|---|
| 00:00-00:15 | Agent IC frames the problem and evaluates RouteGuard AI before a $14,400 contract. | Usefulness: governed enterprise buying decision, not a generic agent demo. |
| 00:15-00:27 | Stripe test-mode $100 envelope, public NHTSA workload, governed worker, OpenShell policy boundary. | Viability: real integrations, public data, bounded spend, policy control. |
| 00:27-00:56 | The run executes in-frame: mission analysis, vendor matching, complaint fetch, Nemotron classification, tracked pattern extension. | Presentation: live proof arc with moving counters and no hidden magic. |
| 00:56-01:19 | Agent IC checks guardrails, computes value/waste/ROI/renewal posture, then lands `CONTINUE`. | Usefulness: finance/security decision output from measured evidence. |
| 01:20-01:35 | Metrics stay visible, then the $150 CARFAX request is blocked against the $100 cap. | Viability: enforceable spend/tool policy with HTTP `403` evidence. |
| 01:36-01:48 | Evidence ledger preserves route counts, policy result, playbook, and provider receipts. | Viability: auditability and repeatability. |
| 01:49-01:55 | Renewal ledger carries evidence forward across monthly decisions and four domains. | Usefulness: procurement system, not a one-off workflow. |

## Proof Receipts

- Stripe: test-mode Checkout Session, `$100` spend envelope, masked `cs_test_...` receipt.
- Workload: `330` public NHTSA ODI complaint rows.
- Nemotron: live request id `chatcmpl-513c5e27-3b49-4a16-b22d-252964084a26`.
- Policy: `$150` CARFAX request blocked against `$100` cap with HTTP `403`.
- Hermes: live NemoHermes sandbox receipt with output SHA-256 `52919f00f4a99d7e2db94864649c1b6a1817f41b97bcc4096f1b272c960d8d2a`.
- Decision: `CONTINUE`, `301` auto-routed, `29` human-review, `4x` risk-adjusted ROI.

## QA Basis

Video QA is based on image and video analysis tools, not OCR pass/fail:

- `ffprobe` and `ffmpeg` validate duration, codecs, audio, black/frozen intervals, scene changes, and frame extraction.
- ImageMagick validates contact sheets, nonblank frames, texture, and frame-difference metrics.
- OCR is diagnostic only and is not used as a pass/fail signal.

Current reports:

- `demo-out/video-qa-report-winning-v3.json`: PASS, `65/65`.
- `demo-out/frame-review-winning-v3.json`: PASS, `16/16`, `2871/2871` frames extracted.

## Voiceover Transcript

Agent IC is the control plane that decides which AI agents deserve your budget.

RouteGuard AI claims ninety percent accuracy on complaint triage. Before signing a fourteen-thousand-four-hundred-dollar annual contract, Agent IC runs a governed trial.

The run starts by funding a one-hundred-dollar Stripe envelope. It fetches public NHTSA complaints, opens a governed worker run, and puts NVIDIA OpenShell policy between the agent and every tool.

This is the procurement run as it happens: mission analysis, vendor matching, spend envelope creation, worker dispatch, complaint fetch, model classification, policy enforcement, and decision synthesis.

The counters keep moving because the trial is still running. Three hundred thirty public complaints are flowing through the worker. Nemotron classifies a sample set, then the pattern extension is tracked separately instead of hidden inside a vanity score.

The policy layer stays active through the run. Agent IC checks spend rules, allowed tools, and network boundaries before any result can become a procurement decision. Every receipt stays visible while it runs. No jump cut.

With the guardrails checked, Agent IC computes value, waste, ROI, and renewal posture before showing the procurement decision.

Decision lands: continue.

Three hundred one auto-routed; twenty-nine human review. Metrics stay in view for the buyer first.

Now the policy evidence: CARFAX requested one hundred fifty dollars against a one-hundred-dollar cap. Agent IC records the block.

The evidence ledger preserves the route counts, policy result, playbook, and provider receipts.

Renewal ledger carries evidence forward: high performers get larger envelopes; others stay constrained until the next cycle.

Four domains, four vendors, one control plane. Agent IC: fund the right pilots. Stop the wrong ones.
