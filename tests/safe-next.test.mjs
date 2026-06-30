import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSafeRoot,
  isStaleProcessScopedSafeRoot,
  isSafeMirrorRoot,
  isSupportedCommand,
  rsyncMirrorArgs,
  unsafeMirrorRootMessage,
  unsupportedCommandMessage,
} from '../scripts/safe-next.mjs';

test('safe-next rejects unsafe mirror roots before rsync delete can run', () => {
  assert.equal(isSafeMirrorRoot('/tmp/not-agent-ic-root', {}), false);
  assert.equal(isSafeMirrorRoot('/tmp/agent-ic-build', {}), false);
  assert.equal(isSafeMirrorRoot('/tmp/agent-ic-userdata', {}), false);
  assert.equal(isSafeMirrorRoot('/tmp/agent-ic-build-12345', {}), true);
  assert.equal(isSafeMirrorRoot('/tmp/agent-ic-dev-12345', {}), true);
  assert.equal(isSafeMirrorRoot('/tmp/agent-ic-start-12345', {}), true);
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
  assert.equal(isSafeMirrorRoot(defaultSafeRoot('build', 12345, { AGENT_IC_SAFE_ROOT: '/tmp/agent-ic-fixed' }), {}), false);
  assert.equal(isStaleProcessScopedSafeRoot('/tmp/agent-ic-build-12345', '/tmp/agent-ic-build-99999', () => false), true);
  assert.equal(isStaleProcessScopedSafeRoot('/tmp/agent-ic-build-12345', '/tmp/agent-ic-build-99999', () => true), false);
  assert.equal(isStaleProcessScopedSafeRoot('/tmp/agent-ic-build-12345', '/tmp/agent-ic-build-12345', () => false), false);
  assert.equal(isStaleProcessScopedSafeRoot('/tmp/agent-ic-dev-12345', '/tmp/agent-ic-build-99999', () => false), true);
  assert.equal(isStaleProcessScopedSafeRoot('/tmp/agent-ic-start-12345', '/tmp/agent-ic-build-99999', () => false), true);
  assert.equal(isStaleProcessScopedSafeRoot('/tmp/agent-ic-random-12345', '/tmp/agent-ic-build-99999', () => false), false);
});

test('safe-next mirror excludes heavyweight generated artifacts', () => {
  const args = rsyncMirrorArgs('/workspace', '/tmp/agent-ic-build-test');
  assert.deepEqual(args.slice(-2), ['/workspace/', '/tmp/agent-ic-build-test/']);
  assert.equal(args.includes('demo-out'), true);
  assert.equal(args.includes('models'), true);
  assert.equal(args.includes('node_modules'), true);
  assert.equal(args.includes('.agent-ic'), true);
});
