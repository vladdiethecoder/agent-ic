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
  const localScript = `${command}:local`;
  const unsafePath = /[#\0]/.test(source);

  if (!isSupportedCommand(command)) {
    console.error(unsupportedCommandMessage(command));
    process.exit(1);
  }

  const safeRoot = resolve(defaultSafeRoot(command));

  if (!unsafePath && !process.env.AGENT_IC_FORCE_SAFE_COPY) {
    run('npm', ['run', localScript], source);
    process.exit(0);
  }

  assertSafeMirrorRoot(safeRoot);
  cleanupStaleSafeMirrors(safeRoot);

  console.log(`[agent-ic] Workspace path contains a character that breaks Next build tracing: ${source}`);
  console.log(`[agent-ic] Mirroring project to safe runtime path: ${safeRoot}`);
  mirrorWithRsync(source, safeRoot);
  ensureInstall(safeRoot);
  run('npm', ['run', localScript], safeRoot);
}

export function isSupportedCommand(command) {
  return ['dev', 'build', 'start'].includes(command);
}

export function defaultSafeRoot(command, pid = process.pid, env = process.env) {
  if (env.AGENT_IC_SAFE_ROOT) return env.AGENT_IC_SAFE_ROOT;
  return `/tmp/agent-ic-${command}-${pid}`;
}

export function unsupportedCommandMessage(command) {
  return `Unsupported safe-next command: ${command}`;
}

export function isSafeMirrorRoot(dir, env = process.env) {
  if (env.AGENT_IC_ALLOW_UNSAFE_SAFE_ROOT === 'true') return true;
  return /^\/tmp\/agent-ic-(build|dev|start)-\d+$/.test(String(dir || ''));
}

export function unsafeMirrorRootMessage(dir) {
  return `[agent-ic] Refusing rsync --delete to unsafe mirror root: ${dir}`;
}

export function isStaleProcessScopedSafeRoot(dir, currentRoot, procExists = existsSync) {
  const resolved = resolve(dir || '');
  if (resolved === resolve(currentRoot || '')) return false;
  const match = resolved.match(/^\/tmp\/agent-ic-(?:build|dev|start)-(\d+)$/);
  if (!match) return false;
  return !procExists(`/proc/${match[1]}`);
}

function cleanupStaleSafeMirrors(currentRoot, tmpDir = '/tmp') {
  for (const entry of readdirSync(tmpDir)) {
    const candidate = join(tmpDir, entry);
    if (!isStaleProcessScopedSafeRoot(candidate, currentRoot)) continue;
    try {
      rmSync(candidate, { recursive: true, force: true });
      console.log(`[agent-ic] Removed stale safe runtime mirror: ${candidate}`);
    } catch (error) {
      console.warn(`[agent-ic] Could not remove stale safe runtime mirror ${candidate}: ${error.message}`);
    }
  }
}

function assertSafeMirrorRoot(dir) {
  if (!isSafeMirrorRoot(dir)) {
    console.error(unsafeMirrorRootMessage(dir));
    console.error('[agent-ic] Use the default process-scoped /tmp/agent-ic-(build|dev|start)-<pid> root, or set AGENT_IC_ALLOW_UNSAFE_SAFE_ROOT=true intentionally.');
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
  const result = spawnSync('rsync', rsyncMirrorArgs(from, to), { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error('[agent-ic] rsync failed; check that rsync is installed and source path is readable.');
    process.exit(result.status || 1);
  }
}

export function rsyncMirrorArgs(from, to) {
  return [
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
    '--exclude', 'models',
    `${from}/`,
    `${to}/`,
  ];
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
