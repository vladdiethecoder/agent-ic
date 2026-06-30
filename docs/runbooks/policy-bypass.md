# Runbook: Policy Bypass Attempt

## Trigger

A worker agent attempts an unapproved tool, network call, spend, or data export.

## Immediate Actions

1. Confirm the policy block produced HTTP 403/409 or equivalent deny receipt.
2. Verify audit chain with `/api/proof-report` and `auditChain.ok=true`.
3. Freeze renewal/expansion decision until security reviewer inspects evidence.
4. If bypass succeeded instead of being blocked, cancel the trial and revoke provider/tool credentials.

## Required Follow-Up

- Add incident note to audit/evidence packet.
- Review policy envelope and allowed tools.
- Require new approval before any retry.
