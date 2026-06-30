# Validation Checklist

Use this checklist before calling a local Agent IC build healthy.

## Code gates

```bash
npm run lint
npm test
npm run build
```

## Live local smoke gates

Start the app first, then run:

```bash
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:api
AGENT_IC_BASE_URL=http://localhost:<port> npm run smoke:browser
```

## Release hardening gate

```bash
npm run release:check
```

## Product invariants

- Agent IC is the governance/procurement layer, not the vendor agent.
- A governed trial must show buyer, vendor, contract at risk, spend envelope, policy rules, evidence, ROI, and decision.
- At least one allowlisted action and one denied action must be evaluated for a proof run.
- Missing or malformed evidence cannot silently produce an approved/expanded result.
- Stripe live-money movement is not claimed from non-production receipts.
- OpenShell proof is claimed only from observed sandbox/policy enforcement receipts.
- Hermes proof is claimed only from an observed Hermes gateway, sandbox, or CLI receipt.
- Nemotron proof is claimed only from per-run provider request IDs.
- Public data snapshots must include source, row count, and hash provenance.
