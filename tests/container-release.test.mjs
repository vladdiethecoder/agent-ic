import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateContainerRelease } from '../scripts/container-release-check.mjs';

test('container release preflight validates Docker hardening and emits plan', () => {
  const result = evaluateContainerRelease({
    env: { AGENT_IC_IMAGE_REF: 'registry.example.com/agent-ic:test' },
    dockerfileText: `FROM node:24-slim\nHEALTHCHECK CMD curl -f http://127.0.0.1:3000/api/health || exit 1\nUSER agentic\n`,
    dockerignoreText: `.env\n.env.*\n.agent-ic\ndemo-out\n`,
    toolResolver: (tool) => ({ docker: '/usr/bin/docker', trivy: '/usr/bin/trivy', cosign: '/usr/bin/cosign', syft: '/usr/bin/syft' })[tool] || '',
  });
  assert.equal(result.ok, true);
  assert.equal(result.plan.image, 'registry.example.com/agent-ic:test');
  assert.match(result.plan.scan, /trivy image/);
  assert.equal(result.fullProductionReady, false);
});

test('container release preflight fails unsafe Dockerfile patterns', () => {
  const result = evaluateContainerRelease({
    dockerfileText: `FROM node:24-slim\nCOPY .env .env\nCMD ["npm","start"]\n`,
    dockerignoreText: `node_modules\n`,
    toolResolver: () => '',
  });
  assert.equal(result.ok, false);
  assert.equal(result.checks.some((check) => check.id === 'non_root_user' && !check.ok), true);
  assert.equal(result.checks.some((check) => check.id === 'no_env_copy' && !check.ok), true);
  assert.ok(result.missingTools.includes('trivy'));
});
