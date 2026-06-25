# Agent IC Rate Limiting Runbook

Agent IC middleware applies mutation-route rate limiting before API handlers execute.

## Current foundation

- Local in-memory limiter for development and single-instance deployments.
- Key includes tenant, user, role, method, and route when a JWT or trusted context is available.
- Rate-limit response headers include limit, remaining, reset, retry-after on rejection, and scope metadata.

## Production configuration

Production readiness requires a shared backend configuration such as:

```bash
AGENT_IC_RATE_LIMIT_BACKEND_URL=https://ratelimit.example.com/agent-ic
# or REDIS_URL / UPSTASH_REDIS_REST_URL
```

`npm run prod:check` fails production mode if no shared backend is configured.

## Production boundary

The current middleware still enforces locally. Production deployments must wire the configured backend to the platform limiter, verify multi-instance behavior, and monitor rate-limit abuse dashboards.
