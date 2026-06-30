import { checkRotationPolicy } from '../lib/rotationPolicy.js';

/**
 * Key rotation policy check CLI.
 *
 * Usage:
 *   node scripts/rotation-policy-check.mjs
 *
 * Evaluates rotation policy, logs violations, and exits non-zero
 * when rotation is required.
 */

function main() {
  const result = checkRotationPolicy();

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error('Rotation policy violations detected. Run scripts/rotate-key.mjs to rotate.');
    process.exit(1);
  }

  process.exit(0);
}

main();
