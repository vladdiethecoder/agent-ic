# Agent IC Key Rotation Policy Runbook

Agent IC includes automated key rotation policy enforcement that evaluates configurable rules against the current key ring and logs violations to the audit trail.

## Configuration

```bash
AGENT_IC_KEY_MAX_AGE_DAYS=90          # Maximum age of a signing key
AGENT_IC_KEY_EXPIRE_WARNING_DAYS=7    # Days before expiration to warn
AGENT_IC_KEY_MIN_ACTIVE=1             # Minimum number of active keys
AGENT_IC_KEY_ROTATION_POLICY_REQUIRED=true  # Require policy in production
```

## Policy Rules

- **no_active_keys**: No active signing keys exist.
- **insufficient_active_keys**: Active keys below `AGENT_IC_KEY_MIN_ACTIVE`.
- **key_expired**: A key has passed its `expiresAt` date.
- **key_expiring_soon**: A key expires within `AGENT_IC_KEY_EXPIRE_WARNING_DAYS`.

## Policy Check CLI

```bash
node scripts/rotation-policy-check.mjs
```

- Exit 0: Policy passes.
- Exit 1: Policy violations detected. Check audit log for details.

## API

### Get rotation policy status

```bash
GET /api/rotation-policy?tenantId=...
```

Requires `view_audit_log` permission.

Returns:

```json
{
  "status": {
    "ok": true,
    "violations": [],
    "health": { "activeKeys": 2, "expiredKeys": 0, ... },
    "config": { "maxAgeDays": 90, "expireWarningDays": 7, ... },
    "nextRotationDeadline": "2026-09-30T23:59:59Z"
  }
}
```

## Audit Logging

Every policy violation is logged as a `key_policy_violation` audit entry with:
- Violation code and message
- Key hash (never raw key material)
- Timestamp and chain link

## Production Boundary

This is policy enforcement foundation, not automated key generation. Production still needs:

- Automated key generation triggered by policy violations.
- HSM-driven rotation (keys generated in hardware).
- External key management system integration.
- Key escrow and recovery procedures.
