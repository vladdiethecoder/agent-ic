import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (isDirectRun()) {
  main();
}

function main() {
  const command = process.argv[2] || 'dev';
  const source = process.cwd();
  const safeRoot = resolve(process.env.AGENT_IC_SAFE_ROOT || (command === 'dev' ? '/tmp/agent-ic-dev' : '/tmp/agent-ic-build'));
  const localScript = `${command}:local`;
  const unsafePath = /[#\0]/.test(source);

  if (!isSupportedCommand(command)) {
    console.error(unsupportedCommandMessage(command));
    process.exit(1);
  }

  if (!unsafePath && !process.env.AGENT_IC_FORCE_SAFE_COPY) {
    run('npm', ['run', localScript], source);
    process.exit(0);
  }

  assertSafeMirrorRoot(safeRoot);

  console.log(`[agent-ic] Workspace path contains a character that breaks Next build tracing: ${source}`);
  console.log(`[agent-ic] Mirroring project to safe runtime path: ${safeRoot}`);
  mirrorWithRsync(source, safeRoot);
  ensureInstall(safeRoot);
  run('npm', ['run', localScript], safeRoot);
}

export function isSupportedCommand(command) {
  return ['dev', 'build', 'start'].includes(command);
}

export function unsupportedCommandMessage(command) {
  return `Unsupported safe-next command: ${command}`;
}

export function isSafeMirrorRoot(dir, env = process.env) {
  if (env.AGENT_IC_ALLOW_UNSAFE_SAFE_ROOT === 'true') return true;
  return String(dir || '').startsWith('/tmp/agent-ic-');
}

export function unsafeMirrorRootMessage(dir) {
  return `[agent-ic] Refusing rsync --delete to unsafe mirror root: ${dir}`;
}

function assertSafeMirrorRoot(dir) {
  if (!isSafeMirrorRoot(dir)) {
    console.error(unsafeMirrorRootMessage(dir));
    console.error('[agent-ic] Use /tmp/agent-ic-* or set AGENT_IC_ALLOW_UNSAFE_SAFE_ROOT=true intentionally.');
    process.exit(1);
  }
}

function isDirectRun() {
  return import.meta.url === pathToFileURL(process.argv[1] || '').href;
}

function mirrorWithRsync(from, to) {
  mkdirSync(to, { recursive: true });
  rmSync(join(to, '.agent-ic'), { recursive: true, force: true });
  removeRuntimeEnvFiles(to);
  const result = spawnSync(
    'rsync',
    [
      '-a',
      '--delete',
      '--exclude', 'node_modules',
      '--exclude', '.next',
      '--exclude', '.git',
      '--exclude', '.agent-ic',
      '--include', '.env.example',
      '--include', '.env.local',
      '--exclude', '.env',
      '--exclude', '.env.*',
      '--exclude', '.venv',
      '--exclude', '.venv*',
      '--exclude', '.cache',
      '--exclude', 'demo-out',
      `${from}/`,
      `${to}/`,
    ],
    { stdio: 'inherit' }
  );
  if (result.error || result.status !== 0) {
    console.error('[agent-ic] rsync failed; check that rsync is installed and source path is readable.');
    process.exit(result.status || 1);
  }
}

function removeRuntimeEnvFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.env' || (entry.startsWith('.env.') && entry !== '.env.example')) {
      rmSync(join(dir, entry), { force: true });
    }
  }
}

function ensureInstall(dir) {
  const nodeModules = join(dir, 'node_modules');
  const lock = join(dir, 'package-lock.json');
  const stamp = join(nodeModules, '.agent-ic-install-stamp');
  const needsInstall =
    !existsSync(nodeModules) ||
    !existsSync(stamp) ||
    (existsSync(lock) && statSync(lock).mtimeMs > statSync(stamp).mtimeMs);

  if (!needsInstall) return;
  run('npm', ['install', '--force'], dir);
  mkdirSync(nodeModules, { recursive: true });
  spawnSync(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(stamp)}, new Date().toISOString())`], {
    stdio: 'inherit',
  });
}

function run(bin, args, cwd) {
  const result = spawnSync(bin, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  process.exitCode = result.status || 0;
  if (result.status) process.exit(result.status);
}
