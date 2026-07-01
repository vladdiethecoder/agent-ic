# Agent IC Export Archive Runbook

Agent IC can persist signed evidence export bundles into a tenant-scoped, content-addressed write-once archive. This is the foundation for immutable export storage; full WORM/object storage integration remains a production boundary.

## Archive Behavior

- Archives are keyed by the bundle's SHA-256 hash (content-addressed).
- Writing the same hash twice is a safe replay (returns `replay: true`).
- Writing a different bundle with the same hash is rejected (`immutable_archive_conflict`).
- Tampered bundles fail signature verification before archiving.
- Archived bundles can be retrieved and re-verified on demand.

## API

### Generate and archive a bundle

```bash
POST /api/export?tenantId=...
```

Returns `201` on first archive, `200` on replay. Response includes `bundle` and `archive` metadata.

### List archived exports

```bash
GET /api/export/archives?tenantId=...
```

Returns paginated archive records (no bundle content by default).

### Retrieve a specific archive

```bash
GET /api/export/archives/:sha256?tenantId=...
```

Add `includeBundle=true` to include the full bundle and live verification result.

## Verification

Archived bundles are verified on retrieval:

- Recompute `sha256` from bundle content.
- Verify `signature` against the configured signing key.
- Both must pass for `verification.ok` to be `true`.

## Production Boundary

This is a local file-system archive foundation. Production still needs:

- WORM/object storage backend (S3 Object Lock, GCS retention, Azure Immutable Blob).
- `AGENT_IC_EXPORT_ARCHIVE_URL` configured to point at the immutable store.
- Signing-key rotation and multi-key verification.
- Auditor-facing verification package (offline CLI tool).
- Approved purge-before-delete workflow with legal hold awareness.

## Configuration

```bash
AGENT_IC_EXPORT_SIGNING_KEY=...
AGENT_IC_EXPORT_SIGNING_KEY_ID=export-key-2026-06
AGENT_IC_EXPORT_REQUIRE_SIGNATURES=true
AGENT_IC_EXPORT_ARCHIVE_URL=https://archive.example.com/agent-ic  # production boundary
```
