# Agent IC API Contract Runbook

Agent IC exposes a versioned OpenAPI foundation at `/api/openapi` and validates the contract during release checks.

## Commands

```bash
npm run openapi:check
```

The command writes `.agent-ic/openapi.json` and fails on missing operation IDs, duplicate operation IDs, missing default error responses, missing success responses, or provider-secret-shaped strings.

## Contract version

The current API contract version is recorded under `info.version` and `x-agent-ic-api-version`. This is a foundation contract, not a claim that all APIs are final or fully production-paginated.

## Production boundary

Before production launch, promote this foundation into a formal API versioning policy with backwards-compatibility rules, pagination coverage for all list endpoints, SDK/client generation if needed, and deployed contract tests.
