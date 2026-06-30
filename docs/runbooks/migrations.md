# Agent IC Migration Runbook

Agent IC uses a formal migration registry for the current tenant-store domain schema foundation. This is still a local-store foundation; production deployments must run equivalent migrations against the production database/object-store/WORM backends before traffic is shifted.

## Commands

```bash
npm run migrate:apply
npm run migrate:check
```

`migrate:apply` is idempotent. It records migration IDs, descriptions, checksums, and timestamps in the store manifest. `migrate:check` fails if any known migration is pending or if a recorded migration checksum no longer matches the source registry.

## Release gate

`npm run release:check` runs:

1. lint
2. tests
3. `migrate:apply`
4. `migrate:check`
5. build
6. production config check
7. static security scan
8. dependency audit
9. release manifest

## Current migration set

- `001_initial_tenant_store` — initializes the tenant-store manifest and tenant directory root.
- `002_domain_schema_registry` — records the current Agent IC domain collection schema registry.
- `003_release_migration_gate` — records migration-gate metadata required by release checks.

## Production note

Do not treat the local JSON migration runner as the final production database migration system. Before production launch, replace or back this runner with platform database migrations, object-store bucket policies, WORM audit provisioning, transaction boundaries, rollback plans, and a restore drill.
