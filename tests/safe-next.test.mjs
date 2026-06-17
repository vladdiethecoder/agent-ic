import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('safe-next rejects unsafe mirror roots before rsync delete can run', () => {
  const result = spawnSync(process.execPath, ['scripts/safe-next.mjs', 'build'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AGENT_IC_FORCE_SAFE_COPY: '1',
      AGENT_IC_SAFE_ROOT: '/tmp/not-agent-ic-root',
    },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Refusing rsync --delete to unsafe mirror root/);
});

test('safe-next rejects unsupported commands', () => {
  const result = spawnSync(process.execPath, ['scripts/safe-next.mjs', 'deploy'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Unsupported safe-next command/);
});
