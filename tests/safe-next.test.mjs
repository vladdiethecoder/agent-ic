import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSafeRoot,
  isSafeMirrorRoot,
  isSupportedCommand,
  unsafeMirrorRootMessage,
  unsupportedCommandMessage,
} from '../scripts/safe-next.mjs';

test('safe-next rejects unsafe mirror roots before rsync delete can run', () => {
  assert.equal(isSafeMirrorRoot('/tmp/not-agent-ic-root', {}), false);
  assert.equal(isSafeMirrorRoot('/tmp/agent-ic-build', {}), true);
  assert.equal(
    isSafeMirrorRoot('/tmp/not-agent-ic-root', { AGENT_IC_ALLOW_UNSAFE_SAFE_ROOT: 'true' }),
    true
  );
  assert.match(unsafeMirrorRootMessage('/tmp/not-agent-ic-root'), /Refusing rsync --delete to unsafe mirror root/);
});

test('safe-next rejects unsupported commands', () => {
  assert.equal(isSupportedCommand('dev'), true);
  assert.equal(isSupportedCommand('build'), true);
  assert.equal(isSupportedCommand('start'), true);
  assert.equal(isSupportedCommand('deploy'), false);
  assert.match(unsupportedCommandMessage('deploy'), /Unsupported safe-next command/);
});

test('safe-next default mirror roots are process-scoped unless overridden', () => {
  assert.equal(defaultSafeRoot('build', 12345, {}), '/tmp/agent-ic-build-12345');
  assert.equal(defaultSafeRoot('dev', 23456, {}), '/tmp/agent-ic-dev-23456');
  assert.equal(
    defaultSafeRoot('build', 12345, { AGENT_IC_SAFE_ROOT: '/tmp/agent-ic-fixed' }),
    '/tmp/agent-ic-fixed'
  );
  assert.equal(isSafeMirrorRoot(defaultSafeRoot('build', 12345, {}), {}), true);
});
