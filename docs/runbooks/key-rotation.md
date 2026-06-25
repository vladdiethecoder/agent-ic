# Agent IC Signing-Key Rotation Runbook

Agent IC supports multiple active signing keys with key IDs, expiration dates, and priority ordering. This enables key rotation without breaking verification of previously signed bundles and audit entries.

## Configuration

### Single key (backward-compatible)

```bash
AGENT_IC_EXPORT_SIGNING_KEY=...
AGENT_IC_EXPORT_SIGNING_KEY_ID=primary-2026-06
```

### Key ring (rotation-enabled)

```bash
AGENT_IC_SIGNING_KEY_RING='[
  {"key":"new-key-...","keyId":"primary-2026-09","expiresAt":"2026-12-31T23:59:59Z","priority":10},
  {"key":"old-key-...","keyId":"primary-2026-06","expiresAt":"2026-09-30T23:59:59Z","priority":5}
]'
```

## Key Ring Behavior

- `parseKeyRing()` reads the single-key env vars AND the `AGENT_IC_SIGNING_KEY_RING` JSON array.
- `selectSigningKey()` picks the highest-priority non-expired key for signing.
- `verifyWithKeyRing()` tries all active keys until one verifies, returning the matching `keyId`.
- Expired keys are skipped for both signing and verification.

## Rotation CLI

```bash
node scripts/rotate-key.mjs
```

Generates a new key with:
- 90-day expiration
- Priority 10 (highest)
- Auto-demotes existing keys by -1 priority

Outputs the updated key ring JSON. Update `AGENT_IC_SIGNING_KEY_RING` in your environment.

## Key Health

`keyRingHealth(ring)` reports:
- `activeKeys`: count of non-expired keys
- `expiredKeys`: count of expired keys
- `needsRotation`: true when no active keys OR oldest key expires within 7 days

## Production Boundary

This is a key rotation foundation, not a full HSM/KMS integration. Production still needs:

- HSM or cloud KMS for key material protection.
- Automated rotation policy enforcement (e.g., rotate every 90 days).
- Key escrow and recovery procedures.
- Audit logging of all key operations.
- Integration with external key management systems.
