# Agent IC Telemetry Export Runbook

Agent IC exposes a foundation for exporting redacted metrics, recent events, and alert summaries to an external observability endpoint.

## Configuration

```bash
AGENT_IC_TELEMETRY_EXPORT_URL=https://telemetry.example.com/agent-ic
AGENT_IC_TELEMETRY_EXPORT_TOKEN=...
AGENT_IC_TELEMETRY_EXPORT_TIMEOUT_MS=8000
```

Production deployments must use HTTPS. Tokens must live in the platform secret manager and should be rotated alongside other production secrets.

## Manual dry-run

```bash
curl -H "Authorization: Bearer <Agent IC JWT>" \
  https://agent-ic.example.com/api/telemetry/export
```

or from the Admin Console, use **Telemetry Export → Dry-run export**.

## Manual export

```bash
curl -X POST \
  -H "Authorization: Bearer <Agent IC JWT>" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":false}' \
  https://agent-ic.example.com/api/telemetry/export
```

## Production boundary

This is not a full observability backend. Production still needs an external metrics/log/alert backend, dashboards, paging integration, SLOs, incident review, and alert drills.
