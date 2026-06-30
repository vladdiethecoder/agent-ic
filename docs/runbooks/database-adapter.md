# Agent IC Database Adapter Runbook

Agent IC includes a minimal database adapter foundation for durable tenant-scoped storage. When `DATABASE_URL` is configured and the `pg` driver is available, the adapter provides connection pooling, tenant-scoped queries, and transaction helpers.

## Configuration

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/agentic
AGENT_IC_DB_MAX_CONNECTIONS=10
AGENT_IC_DB_IDLE_TIMEOUT_MS=30000
AGENT_IC_DB_CONNECTION_TIMEOUT_MS=5000
```

## Adapter Behavior

- `isDbAvailable()` returns `true` only when `DATABASE_URL` starts with `postgres`.
- `initDbPool()` creates a `pg.Pool` with configurable max connections, idle timeout, and connection timeout.
- `dbQuery(text, params, { tenantId })` executes a query with optional tenant isolation via `SET LOCAL`.
- `dbTransaction(fn, { tenantId })` wraps a function in `BEGIN`/`COMMIT`/`ROLLBACK`.
- `dbHealth()` pings the database and reports latency.
- `tenantTableName(baseName, tenantId)` generates a sanitized per-tenant table name.
- `hashTenantId(tenantId)` returns a deterministic 16-char hex hash.

## Migration Runner

`lib/dbMigrations.js` provides a SQL migration runner:

- Migrations live in `migrations/*.sql` ordered by filename.
- Applied migrations are tracked in `schema_migrations` with SHA-256 checksums.
- `applyMigrations()` applies pending migrations idempotently.
- `migrationStatus()` reports applied/pending/checksum_mismatch states.

If the database is unavailable, all migration functions return `{ ok: false, code: 'db_unavailable' }`.

## Production Boundary

This is a foundation adapter, not a full ORM or migration framework. Production still needs:

- Schema design and DDL for all tenant-scoped collections.
- Connection tuning, failover, and read-replica routing.
- Production migration framework (e.g., pg-migrate, Flyway, or platform-managed).
- Operational runbooks for backup, restore, and connection pooling.
- Integration of the adapter into existing store modules (gradual migration from file-based to DB-backed).
