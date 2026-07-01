# Runbook: Payment / Spend Incident

## Trigger

Unexpected Stripe status, duplicate Checkout Session, missing approval, cap mismatch, webhook verification failure, or suspected unauthorized spend.

## Immediate Actions

1. Stop expansion/renewal decision for the affected run.
2. Verify approval ID, tenant ID, case ID, cap, and audit hash chain.
3. Check Stripe dashboard/test/live mode and reconcile the Checkout Session.
4. If production money is involved, notify finance approver and owner.

## Recovery

- Never reuse a rejected or mismatched approval.
- Retry only with a fresh idempotency key and verified webhook state.
- Document final state in audit evidence.
