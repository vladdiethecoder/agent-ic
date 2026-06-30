# Agent IC API Pagination Runbook

Agent IC list endpoints use a shared pagination foundation with backwards-compatible array fields.

## Query parameters

- `limit`: integer from 1 to 200. Defaults to 50.
- `cursor`: zero-based offset cursor. Use the `nextCursor` returned from the previous response.

## Response metadata

Paginated list responses preserve the original array field (`approvals`, `policies`, `trials`, `artifacts`, `events`, `memberships`, `tenants`, `incidents`) and add:

```json
{
  "pagination": {
    "limit": 50,
    "cursor": "0",
    "nextCursor": null,
    "total": 0,
    "hasMore": false
  }
}
```

## Current covered list endpoints

- `/api/approvals`
- `/api/policies`
- `/api/trials`
- `/api/evidence`
- `/api/payments`
- `/api/memberships`
- `/api/tenants`
- `/api/incidents`

## Production boundary

This is pagination coverage foundation. Production API governance still needs formal version/deprecation policy, contract tests for every consumer-critical query shape, and pagination coverage for future endpoints as they are added.
