# Agent IC KMS Integration Runbook

Agent IC includes a pluggable Key Management System (KMS) adapter that supports multiple backends with graceful fallback to local Node.js crypto.

## Supported Backends

| Backend | Env Var | SDK | Fallback |
|---------|---------|-----|----------|
| Local (default) | `AGENT_IC_KMS_BACKEND=local` | Node.js crypto | Never |
| AWS KMS | `AGENT_IC_KMS_BACKEND=aws` | `@aws-sdk/client-kms` | Local |
| Google Cloud KMS | `AGENT_IC_KMS_BACKEND=gcp` | `@google-cloud/kms` | Local |
| HashiCorp Vault | `AGENT_IC_KMS_BACKEND=vault` | `node-vault` | Local |

## Configuration

```bash
AGENT_IC_KMS_BACKEND=local          # or aws, gcp, vault
AGENT_IC_KMS_REQUIRED=false         # Set true to require KMS in production
AGENT_IC_KMS_REGION=us-east-1       # AWS region or default
AGENT_IC_KMS_KEY_SPEC=HMAC_256    # Key specification
```

## Usage

```js
import { createKmsAdapter } from './lib/kmsAdapter.js';

const kms = await createKmsAdapter();

// Generate a key
const key = await kms.generateKey({ keyId: 'my-key', keySpec: 'HMAC_256' });

// Sign data
const signature = await kms.sign('data-to-sign', 'my-key');

// Verify signature
const ok = await kms.verify(signature, 'data-to-sign', 'my-key');

// Get metadata
const meta = await kms.getKeyMetadata('my-key');

// List keys
const keys = await kms.listKeys();

// Rotate key
const rotated = await kms.rotateKey({ keyId: 'my-key' });
```

## Graceful Fallback

When an external SDK is not installed or configured, the adapter automatically falls back to the local backend. This ensures:

- No hard dependency on cloud SDKs
- Development environments work without credentials
- Production can be upgraded to external KMS without code changes

## Audit Logging

All KMS operations (generate, sign, verify, rotate) are logged to the audit trail with:
- Operation type and key ID
- Backend name
- Timestamp and chain link
- No key material leakage

## Production Boundary

This is a KMS adapter foundation, not a full production HSM deployment. Production still needs:

- Actual cloud KMS credentials and key rings
- HSM-backed key generation (AWS CloudHSM, Azure Dedicated HSM)
- Key escrow and recovery procedures
- Multi-region key replication
- Key access policy enforcement
