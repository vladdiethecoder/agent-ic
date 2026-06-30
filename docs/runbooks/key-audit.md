# Agent IC Key Operation Audit Runbook

Agent IC logs every key lifecycle event (generate, rotate, sign, verify) as a tamper-evident audit entry. Key material is never leaked in the audit trail.

## What is audited

- **key_generate**: A new signing key is generated.
- **key_rotate**: An existing key is demoted during rotation.
- **key_sign**: A bundle or audit entry is signed with a key.
- **key_verify**: A bundle or audit chain is verified against a key.

## Audit entry format

Each key operation produces an audit entry with:

- `action`: `key_<operation>`
- `kind`: `key_operation`
- `metadata.keyHash`: SHA-256 hash of the keyId (never the raw key)
- `detail`: Human-readable summary with truncated keyHash
- `hash`: Tamper-evident chain hash
- `signature`: HMAC-SHA256 signature of the entry

## API

### List key operation audit history

```bash
GET /api/key-audit?tenantId=...
```

Requires `view_audit_log` permission (auditor, owner, procurement_admin).

Returns paginated key operation entries.

## Key material safety

- Raw signing keys never appear in audit entries.
- Only `keyId` hashes are recorded in metadata.
- The `detail` field contains truncated hashes, not key IDs.
- Audit entries themselves are signed and chain-linked.

## Production Boundary

This is key-operation audit logging, not full key lifecycle management. Production still needs:

- HSM audit integration (key generation in hardware).
- Key escrow and recovery audit logging.
- Automated rotation policy enforcement with audit trail.
- External SIEM integration for key operation alerts.
