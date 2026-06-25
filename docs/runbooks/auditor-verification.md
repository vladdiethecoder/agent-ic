# Agent IC Auditor Verification Package Runbook

Agent IC includes an offline auditor-facing verification CLI that can verify signed export bundles and audit chains without requiring a running server or live database.

## Usage

### Verify an export bundle

```bash
node scripts/verify-evidence.mjs export-bundle.json
```

### Verify with audit chain included

```bash
node scripts/verify-evidence.mjs export-bundle.json --audit
```

### Require signatures (fail closed)

```bash
node scripts/verify-evidence.mjs export-bundle.json --require-signature
```

### Provide signing key

```bash
AGENT_IC_EXPORT_SIGNING_KEY=... node scripts/verify-evidence.mjs export-bundle.json
```

The tool never prints the signing key in output.

## What it verifies

- **Bundle hash**: Recomputes SHA-256 from bundle content (excluding integrity fields).
- **Bundle signature**: Verifies HMAC-SHA256 signature against the provided key.
- **Audit chain** (with `--audit`): Verifies hash links between consecutive entries and entry signatures.

## Output format

Structured JSON report:

```json
{
  "ok": true,
  "file": "export-bundle.json",
  "bundle": {
    "ok": true,
    "hash": { "ok": true, "computed": "...", "expected": "..." },
    "signature": { "ok": true }
  },
  "audit": {
    "ok": true,
    "checked": 42,
    "failures": [],
    "signedCount": 42
  }
}
```

Exit code 0 on success, 1 on verification failure.

## Production Boundary

This is an offline verification tool, not a full auditor workflow or legal review process. Production still needs:

- Auditor identity verification and access control.
- Integration with legal hold and retention policy workflows.
- Multi-key verification for rotated signing keys.
- Formal audit report generation with timestamps and signatures.
