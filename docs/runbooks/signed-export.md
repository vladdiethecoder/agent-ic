# Agent IC Signed Export Runbook

Agent IC evidence export bundles include a deterministic SHA-256 hash. When signing is configured, bundles are also HMAC-SHA256 signed.

## Configuration

```bash
AGENT_IC_EXPORT_SIGNING_KEY=...
AGENT_IC_EXPORT_SIGNING_KEY_ID=export-key-2026-06
AGENT_IC_EXPORT_REQUIRE_SIGNATURES=true
```

If `AGENT_IC_EXPORT_SIGNING_KEY` is absent, the export signer can fall back to `AGENT_IC_AUDIT_SIGNING_KEY` for local foundation use. Production should use a managed secret and key ID.

## Verify

- Recompute `sha256` from bundle content to detect content changes.
- Verify `signature` with the configured signing key to detect hash/signature metadata tampering.

## Production boundary

Signed export bundles are not the same as immutable storage. Production still needs immutable/WORM object storage, retention policy enforcement, key rotation, and auditor-facing verification packaging.
