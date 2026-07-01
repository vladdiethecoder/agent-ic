import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseKeyRing, addKeyToRing, generateKey, keyRingHealth } from '../lib/keyRotation.js';
import { logKeyOperation } from '../lib/keyAudit.js';

/**
 * Signing-key rotation CLI.
 *
 * Usage:
 *   node scripts/rotate-key.mjs
 *
 * Generates a new key, adds it to the key ring with highest priority,
 * and demotes existing keys. Prints the new key ring JSON to stdout.
 * The operator must update the environment variable manually.
 */

function main() {
  const env = process.env;
  const ring = parseKeyRing(env);
  const health = keyRingHealth(ring);

  const newKey = generateKey({
    keyId: `key-${new Date().toISOString().slice(0, 10)}`,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    priority: 10,
  });

  logKeyOperation({ operation: 'generate', keyId: newKey.keyId, actor: 'rotate-cli', detail: `priority=${newKey.priority} expires=${newKey.expiresAt}` });

  const updated = addKeyToRing(ring, newKey);

  for (const oldKey of ring) {
    logKeyOperation({ operation: 'rotate', keyId: oldKey.keyId, actor: 'rotate-cli', detail: `demoted to priority=${updated.find(k => k.keyId === oldKey.keyId)?.priority || 0}` });
  }

  const output = JSON.stringify(updated, null, 2);

  console.log(output);

  if (health.needsRotation) {
    console.error('WARNING: Key rotation was overdue. Update AGENT_IC_SIGNING_KEY_RING immediately.');
    process.exit(2);
  }

  process.exit(0);
}

main();
