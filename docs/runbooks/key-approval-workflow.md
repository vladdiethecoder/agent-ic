# Agent IC Key Operation Approval Workflow Runbook

Agent IC includes a request/approve workflow for sensitive key operations (generate, rotate, sign with high-value data).

## Workflow

### 1. Request a key operation

```bash
POST /api/key-operations/request
```

Body:

```json
{
  "operation": "key_generate",
  "keyId": "new-signing-key",
  "justification": "Need new signing key for tenant_a"
}
```

Requires `create_trial` permission (operator, owner, procurement_admin).

Returns a pending approval request with `approvalId`.

### 2. Approve the request

```bash
POST /api/key-operations/approve
```

Body:

```json
{
  "approvalId": "key-op-..."
}
```

Requires `manage_users` permission (owner, admin).

### 3. List pending requests

```bash
GET /api/key-operations?status=pending
```

Requires `view_audit_log` permission (auditor, owner, procurement_admin).

## Approval States

- `pending`: Awaiting approval
- `approved`: Approved and ready for execution
- `rejected`: Rejected by approver

## Validation

The `requireApprovedOperation()` guard validates:

- Approval ID exists
- Tenant matches
- Status is `approved`
- Operation matches the requested operation

## Audit Logging

All workflow events are logged:

- `key_approval_request`: New request created
- `key_approval_approve`: Request approved
- `key_approval_reject`: Request rejected

## API Endpoints

| Endpoint | Method | Required Permission | Description |
|----------|--------|---------------------|-------------|
| `/api/key-operations/request` | POST | `create_trial` | Create approval request |
| `/api/key-operations/approve` | POST | `manage_users` | Approve request |
| `/api/key-operations` | GET | `view_audit_log` | List requests |

## Production Boundary

This is an approval workflow foundation, not a full enterprise key governance system. Production still needs:

- Multi-party approval (M-of-N signatures)
- HSM-backed approval attestation
- Time-bound approvals (expiration)
- Approval delegation chains
- Integration with enterprise ticketing systems
