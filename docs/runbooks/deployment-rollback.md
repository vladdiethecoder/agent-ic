# Runbook: Deployment and Rollback

## Purpose

Define the minimum release process for Agent IC production deployments. This is a foundation runbook; real production requires environment-specific deployment manifests and tested rollback automation.

## Pre-Deploy Gates

1. `npm run release:check` passes.
2. `npm run release:manifest` generated `.agent-ic/release-manifest.json`.
3. Production env is validated with `AGENT_IC_DEPLOYMENT_MODE=production npm run prod:check` in the target environment.
4. Container image is built from `Dockerfile` and scanned.
5. Database migrations are reviewed and have rollback notes.
6. On-call owner and incident channel are confirmed.

## Deployment Steps

1. Build immutable container image from the release commit.
2. Attach release manifest as deployment artifact.
3. Deploy to staging.
4. Run staging health/readiness checks.
5. Run staging smoke checks against the deployed URL.
6. Promote the same image to production.
7. Monitor `/api/ready`, `/api/metrics`, Stripe webhooks, and audit-chain health.

## Rollback Triggers

- `/api/ready` fails.
- Auth/RBAC errors spike.
- Stripe webhook verification fails unexpectedly.
- Policy bypass or spend incident occurs.
- Audit-chain verification fails.
- Error rate exceeds alert threshold.

## Rollback Steps

1. Freeze new approvals and trial expansions if spend/policy risk exists.
2. Roll back to prior known-good container image.
3. Verify `/api/health`, `/api/ready`, and guarded API reads.
4. Verify audit-chain continuity.
5. Reconcile Stripe/webhook state for in-flight runs.
6. File incident report with release manifest, run IDs, and mitigation notes.

## Evidence Required

- Release manifest.
- Image digest.
- Deployment timestamp.
- Health/readiness output.
- Smoke result.
- Rollback decision log, if rollback occurred.
