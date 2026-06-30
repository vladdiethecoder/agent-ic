# Agent IC SLO Review Runbook

Agent IC exposes a local SLO/error-budget foundation at `/api/slo` and in the Admin Console. The current SLOs are derived from in-process metrics and alerts; production deployments must back these with external metrics and dashboards.

## SLOs

- Governed trial success ratio — target 99%.
- Audit integrity — target 100% with zero audit-chain failures.
- Stripe webhook acceptance — target 99.5%.
- Policy enforcement — target 100% with zero bypass attempts.

## Manual review

```bash
curl -H "Authorization: Bearer <Agent IC JWT>" \
  https://agent-ic.example.com/api/slo
```

Review `status`, `successRatio`, and `errorBudgetRemaining` for every SLO. Breached SLOs require incident review and mitigation before a production release proceeds.

## Production boundary

This is an SLO calculation foundation, not a full SLO program. Production still needs externally stored metrics, dashboards, SLO ownership, error-budget policy, paging integration, incident-review cadence, and alert/fire-drill evidence.
