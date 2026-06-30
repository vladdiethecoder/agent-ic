# Agent IC Incident Review Runbook

Agent IC stores tenant-scoped incident reviews and alert/fire-drill evidence through `/api/incidents` and the Admin Console.

## Create an incident review

```bash
curl -X POST \
  -H "Authorization: Bearer <Agent IC JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "action":"create",
    "tenantId":"tenant_a",
    "title":"Stripe webhook mismatch review",
    "severity":"warning",
    "sourceAlertId":"stripe-webhook-rejected",
    "runbook":"docs/runbooks/payment-incident.md",
    "summary":"Payment alert triage started."
  }' \
  https://agent-ic.example.com/api/incidents
```

## Record an alert drill

Set `drill: true` when creating the incident. Drill records close immediately as `drill_completed` and count toward drill evidence.

## Close an incident

```bash
curl -X POST \
  -H "Authorization: Bearer <Agent IC JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "action":"update",
    "tenantId":"tenant_a",
    "incidentId":"inc_...",
    "status":"closed",
    "correctiveAction":"Added dashboard and escalation owner."
  }' \
  https://agent-ic.example.com/api/incidents
```

## Production boundary

This is an incident-review evidence foundation. Production still needs incident-review ownership, periodic alert/fire drills, external ticketing or paging integration, and compliance-reviewed postmortem policy.
