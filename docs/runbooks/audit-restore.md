# Runbook: Audit / Evidence Restore

## Trigger

Audit file corruption, suspected tampering, data loss, restore drill, or disaster recovery event.

## Immediate Actions

1. Stop destructive/admin operations.
2. Run audit-chain verification from the proof report or internal tooling.
3. Preserve the current audit artifact before attempting repair.
4. Restore from the most recent known-good backup.

## Production Requirement

Current local JSONL audit is a foundation only. Full production requires a durable DB/WORM audit backend, backup schedule, restore drill evidence, retention policy, and legal-hold process.

## Store Backup Commands

Create a tenant-store backup bundle:

```bash
npm run store:backup -- create .agent-ic/backups/store-backup.json
```

Verify a backup bundle before restore:

```bash
npm run store:backup -- verify .agent-ic/backups/store-backup.json
```

Restore into a target root for drill/testing:

```bash
npm run store:backup -- restore .agent-ic/backups/store-backup.json .agent-ic/restore-drill
```

Use `--overwrite` only for an explicit restore drill or disaster-recovery action after preserving the current store.
