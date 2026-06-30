# Runbook: Provider Outage

## Trigger

Nemotron, Stripe, Hermes, OpenShell, or the data source fails or times out during a governed trial.

## Immediate Actions

1. Confirm `/api/ready` status and provider fields.
2. Check `/api/metrics` for `agent_ic_trials_failed_total` and recent error events.
3. Verify no spend/action was executed without an approval and audit row.
4. If provider proof is missing, mark run as failed/blocked and do not issue expansion.

## Recovery

- Retry only if idempotency keys and approval scopes are intact.
- For Stripe failures, verify webhook/payment state before retry.
- For policy/OpenShell failures, fail closed and require security reviewer approval before re-run.

## Evidence to Preserve

- Run ID, tenant ID, provider, error, readiness response, audit-chain verification, approval ID.
