# Agent IC Key Access Policy Runbook

Agent IC includes RBAC-based key access policy enforcement that controls which roles can perform key operations.

## Permission Matrix

| Operation | owner | procurement_admin | auditor | operator | system |
|-----------|-------|-------------------|---------|----------|--------|
| key_generate | ✓ | ✓ | ✗ | ✗ | ✗ |
| key_rotate | ✓ | ✓ | ✗ | ✗ | ✗ |
| key_sign | ✓ | ✓ | ✓ | ✗ | ✗ |
| key_verify | ✓ | ✓ | ✓ | ✓ | ✗ |
| key_read_metadata | ✓ | ✓ | ✓ | ✓ | ✗ |
| key_audit | ✓ | ✓ | ✓ | ✗ | ✗ |

## Usage

```js
import { hasKeyAccess, requireKeyAccess } from './lib/keyAccessPolicy.js';

// Check permission
const canGenerate = hasKeyAccess('owner', 'key_generate'); // true
const canSign = hasKeyAccess('operator', 'key_sign'); // false

// Guard operation
const access = requireKeyAccess(principal, 'key_generate');
if (!access.ok) {
  // Access denied, audit log entry created
}
```

## KMS Adapter Integration

The KMS adapter automatically enforces key access policy on all operations:

```js
const kms = await createKmsAdapter();

// Owner can generate
await kms.generateKey({ keyId: 'my-key', principal: { role: 'owner', userId: 'alice' } });

// Operator cannot generate - throws "Access denied"
await kms.generateKey({ keyId: 'my-key', principal: { role: 'operator', userId: 'bob' } });
```

## API

### Get key access policy

```bash
GET /api/key-access/policy?tenantId=...
```

Requires `view_audit_log` permission.

Returns:

```json
{
  "policy": {
    "version": "2026-06-23-v1",
    "permissions": {
      "key_generate": ["owner", "procurement_admin"],
      ...
    }
  }
}
```

## Audit Logging

Denied access attempts are logged as `key_access_denied` audit entries with:
- Role and user ID
- Requested operation
- Timestamp and chain link

## Production Boundary

This is key access policy foundation, not a full enterprise key governance system. Production still needs:

- HSM access control integration
- Multi-factor authentication for key operations
- Key operation approval workflows
- Key access review and attestation
- Integration with enterprise IAM (SAML, OIDC)
