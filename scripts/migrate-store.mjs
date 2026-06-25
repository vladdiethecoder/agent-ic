#!/usr/bin/env node
import { applyMigrations, assertMigrationsCurrent, migrationStatus } from '../lib/migrationRunner.js';

const command = process.argv[2] || 'status';
let result;
let exitCode = 0;

if (command === 'status') {
  result = migrationStatus();
} else if (command === 'apply') {
  result = applyMigrations();
  exitCode = result.ok ? 0 : 1;
} else if (command === 'check') {
  result = assertMigrationsCurrent();
  exitCode = result.ok ? 0 : 1;
} else {
  console.error(`Unknown migration command: ${command}`);
  console.error('Usage: node scripts/migrate-store.mjs [status|apply|check]');
  process.exit(2);
}

console.log(JSON.stringify(result, null, 2));
process.exit(exitCode);
