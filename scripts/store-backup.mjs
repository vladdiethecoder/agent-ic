#!/usr/bin/env node
import { createStoreBackup, restoreStoreBackup, verifyStoreBackup } from '../lib/storeBackup.js';

const [command, ...args] = process.argv.slice(2);

try {
  if (!command || command === '--help' || command === 'help') {
    console.log(`Usage:\n  npm run store:backup -- create <backup-file>\n  npm run store:backup -- verify <backup-file>\n  npm run store:backup -- restore <backup-file> <target-root> [--overwrite]`);
    process.exit(0);
  }
  if (command === 'create') {
    const outFile = args[0];
    if (!outFile) throw new Error('create requires <backup-file>');
    console.log(JSON.stringify(createStoreBackup({ outFile }), null, 2));
    process.exit(0);
  }
  if (command === 'verify') {
    const backupFile = args[0];
    if (!backupFile) throw new Error('verify requires <backup-file>');
    const result = verifyStoreBackup({ backupFile });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
  if (command === 'restore') {
    const backupFile = args[0];
    const targetRoot = args[1];
    if (!backupFile || !targetRoot) throw new Error('restore requires <backup-file> <target-root>');
    const result = restoreStoreBackup({ backupFile, targetRoot, overwrite: args.includes('--overwrite') });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
  throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
