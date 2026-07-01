import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('release manifest records proof commands and avoids removed public-export gate', () => {
  const out = `.agent-ic/test-release-manifest-${Date.now()}-${Math.random()}.json`;
  execFileSync('node', ['scripts/release-manifest.mjs'], {
    env: { ...process.env, AGENT_IC_RELEASE_MANIFEST: out },
    encoding: 'utf8',
  });
  const manifest = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(manifest.scripts.proofProductionAccess, 'node scripts/agent-ic-proof.mjs proof production-access');
  assert.equal(manifest.gates.proofProductionAccess, 'npm run proof:production-access');
  assert.equal(Object.hasOwn(manifest.scripts, 'publicExport'), false);
  assert.equal(Object.hasOwn(manifest.gates, 'publicExport'), false);
  assert.equal(manifest.productionReadiness.strictProofRequiredInProduction, true);
  assert.ok(manifest.productionReadiness.proofSurfaces.includes('production-access'));
  assert.ok(manifest.artifacts['scripts/agent-ic-proof.mjs']?.sha256);
});
