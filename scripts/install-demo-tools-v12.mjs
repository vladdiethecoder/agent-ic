#!/usr/bin/env node
/**
 * Idempotent installer for Agent IC v12 demo CLI tooling.
 *
 * Attempts to install ttyd, vhs, the Stripe CLI, @stripe/link-cli, and mppx
 * into the project-local `tools/` directory (preferred) or `~/.local/bin`.
 * NemoClaw / Hermes CLIs are not publicly distributable; the script detects
 * them and reports whether real capture is possible.
 *
 * No secrets are written to disk. Credentials are read from the environment
 * only by the capture script.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdir, chmod, rm, writeFile, access, symlink, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, tmpdir, platform, arch } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TOOLS_BIN = resolve(ROOT, 'tools', 'bin');
const TOOLS_NPM = resolve(ROOT, 'tools', 'npm');
const HOME_LOCAL_BIN = resolve(homedir(), '.local', 'bin');
const REPORT_DIR = resolve(ROOT, 'demo-out');
const REPORT_FILE = resolve(REPORT_DIR, 'tool-install-report-v12.json');

const PLATFORM = platform();
const ARCH = arch();

const BINARY_RELEASES = {
  vhs: {
    version: 'v0.11.0',
    getUrl: (v) => `https://github.com/charmbracelet/vhs/releases/download/${v}/vhs_${v.replace(/^v/, '')}_Linux_x86_64.tar.gz`,
    binary: 'vhs',
    tarPathInside: 'vhs_0.11.0_Linux_x86_64/vhs',
  },
  ttyd: {
    version: '1.7.7',
    getUrl: (v) => `https://github.com/tsl0922/ttyd/releases/download/${v}/ttyd.x86_64`,
    binary: 'ttyd',
  },
  stripe: {
    version: 'v1.42.13',
    getUrl: (v) => `https://github.com/stripe/stripe-cli/releases/download/${v}/stripe_${v.replace(/^v/, '')}_linux_x86_64.tar.gz`,
    binary: 'stripe',
    tarPathInside: 'stripe',
  },
};

const NPM_TOOLS = ['mppx'];

const SECRET_PATTERNS = [
  /sk_(live|test)_[A-Za-z0-9]{24,}/g,
  /pk_(live|test)_[A-Za-z0-9]{24,}/g,
  /whsec_[A-Za-z0-9]{24,}/g,
  /nvapi-[A-Za-z0-9_-]{20,}/g,
  /Bearer\s+[A-Za-z0-9_.-]{20,}/g,
];

function redact(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const key of ['STRIPE_API_KEY', 'STRIPE_SECRET_KEY', 'NEMOTRON_API_KEY', 'HERMES_AGENT_TOKEN']) {
    const value = process.env[key];
    if (!value) continue;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'g'), '[REDACTED]');
  }
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg) {
  console.log(`[install-v12] ${msg}`);
}

async function pickTargetDir() {
  for (const dir of [TOOLS_BIN, HOME_LOCAL_BIN]) {
    try {
      await mkdir(dir, { recursive: true });
      await access(dir, constants.W_OK);
      return dir;
    } catch {
      // try next
    }
  }
  throw new Error('No writable target directory found');
}

function commandExists(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${name}`], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0 && Boolean(result.stdout.trim());
}

async function download(url, dest) {
  log(`downloading ${url}`);
  const result = spawnSync('curl', ['-sL', '-f', '-o', dest, url], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    throw new Error(`curl failed for ${url}: ${result.stderr || result.stdout || 'unknown'}`);
  }
}

async function extractTar(tarPath, destDir, insidePath, finalName) {
  const tmp = join(tmpdir(), `agent-ic-extract-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  const extractResult = spawnSync('tar', ['-xzf', tarPath, '-C', tmp], { encoding: 'utf8', stdio: 'pipe' });
  if (extractResult.status !== 0) {
    throw new Error(`tar extract failed: ${extractResult.stderr || extractResult.stdout}`);
  }
  const src = insidePath ? resolve(tmp, insidePath) : resolve(tmp, finalName);
  const dest = join(destDir, finalName);
  await rm(dest, { force: true }).catch(() => {});
  await spawnSync('cp', [src, dest], { encoding: 'utf8', stdio: 'pipe' });
  await chmod(dest, 0o755);
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
}

async function installBinary(toolName, targetDir, force = false) {
  if (PLATFORM !== 'linux' || ARCH !== 'x64') {
    return { name: toolName, status: 'unsupported_platform', reason: `${PLATFORM}/${ARCH} binaries not bundled` };
  }

  const spec = BINARY_RELEASES[toolName];
  const destPath = join(targetDir, spec.binary);

  if (!force) {
    try {
      await access(destPath, constants.X_OK);
      const versionResult = spawnSync(destPath, [toolName === 'ttyd' ? '--version' : '--version'], { encoding: 'utf8', stdio: 'pipe' });
      return { name: toolName, status: 'already_installed', path: destPath, version: redact(versionResult.stdout?.trim() || spec.version) };
    } catch {
      // proceed to install
    }
  }

  const tmpTar = join(tmpdir(), `${toolName}-${Date.now()}.tar.gz`);
  const tmpBin = join(tmpdir(), `${toolName}-${Date.now()}.bin`);
  try {
    const url = spec.getUrl(spec.version);
    await download(url, spec.tarPathInside ? tmpTar : tmpBin);

    await mkdir(targetDir, { recursive: true });
    if (spec.tarPathInside) {
      await extractTar(tmpTar, targetDir, spec.tarPathInside, spec.binary);
    } else {
      await rm(destPath, { force: true }).catch(() => {});
      await spawnSync('cp', [tmpBin, destPath], { encoding: 'utf8', stdio: 'pipe' });
      await chmod(destPath, 0o755);
    }

    const versionResult = spawnSync(destPath, [toolName === 'ttyd' ? '--version' : '--version'], { encoding: 'utf8', stdio: 'pipe' });
    return { name: toolName, status: 'installed', path: destPath, version: redact(versionResult.stdout?.trim() || spec.version) };
  } catch (err) {
    return { name: toolName, status: 'failed', reason: redact(err.message) };
  } finally {
    await rm(tmpTar, { force: true }).catch(() => {});
    await rm(tmpBin, { force: true }).catch(() => {});
  }
}

async function installNpmTools(targetBinDir, force = false) {
  const result = { name: 'npm-tools', status: 'installed', packages: [], path: TOOLS_NPM };
  try {
    await mkdir(TOOLS_NPM, { recursive: true });
    const args = ['install', '--prefix', TOOLS_NPM, '-g', ...NPM_TOOLS];
    if (force) args.push('--force');

    const installResult = spawnSync('npm', args, {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, NPM_CONFIG_FUND: 'false', NPM_CONFIG_AUDIT: 'false' },
      timeout: 120_000,
    });

    if (installResult.status !== 0) {
      throw new Error(`npm install failed: ${installResult.stderr || installResult.stdout}`);
    }

    const npmBin = join(TOOLS_NPM, 'bin');
    for (const pkg of NPM_TOOLS) {
      const binName = 'mppx';
      const src = join(npmBin, binName);
      const dest = join(targetBinDir, binName);
      try {
        await rm(dest, { force: true }).catch(() => {});
        await symlink(src, dest);
        const versionResult = spawnSync(dest, ['--version'], { encoding: 'utf8', stdio: 'pipe' });
        result.packages.push({ name: pkg, binary: binName, status: 'linked', version: redact(versionResult.stdout?.trim() || 'unknown') });
      } catch (err) {
        result.packages.push({ name: pkg, binary: binName, status: 'failed', reason: redact(err.message) });
      }
    }
  } catch (err) {
    result.status = 'failed';
    result.reason = redact(err.message);
  }
  return result;
}

async function detectCli(name, installUrl) {
  const exists = commandExists(name);
  return {
    name,
    status: exists ? 'available' : 'not_available',
    path: exists ? spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8', stdio: 'pipe' }).stdout.trim() : undefined,
    note: exists
      ? 'Set CAPTURE_REAL_* env vars in .env.local to enable real capture.'
      : `Not installable by this script. See ${installUrl}. Real capture will be simulated.`,
  };
}

async function writeRedactWrapper(targetDir) {
  const wrapper = join(targetDir, 'redact-run.sh');
  const script = `#!/bin/bash
# Auto-generated secret-redacting command wrapper for vhs terminal capture.
"$@" 2>&1 | sed -E \
  -e 's/sk_(live|test)_[A-Za-z0-9]{24,}/[REDACTED]/g' \
  -e 's/pk_(live|test)_[A-Za-z0-9]{24,}/[REDACTED]/g' \
  -e 's/whsec_[A-Za-z0-9]{24,}/[REDACTED]/g' \
  -e 's/nvapi-[A-Za-z0-9_-]{20,}/[REDACTED]/g' \
  -e 's/Bearer[[:space:]]+[A-Za-z0-9_.-]{20,}/Bearer [REDACTED]/g'
`;
  try {
    await writeFile(wrapper, script, { mode: 0o755 });
    return { name: 'redact-run.sh', status: 'installed', path: wrapper };
  } catch (err) {
    return { name: 'redact-run.sh', status: 'failed', reason: redact(err.message) };
  }
}

async function main() {
  const force = process.argv.includes('--force');
  const targetDir = await pickTargetDir();
  log(`target directory: ${targetDir}`);

  await mkdir(REPORT_DIR, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    targetDir,
    force,
    items: [],
  };

  report.items.push(await installBinary('vhs', targetDir, force));
  report.items.push(await installBinary('ttyd', targetDir, force));
  report.items.push(await installBinary('stripe', targetDir, force));
  report.items.push(await installNpmTools(targetDir, force));
  report.items.push(await detectCli('nemohermes', 'https://github.com/NVIDIA/nemoclaw-get-started'));
  report.items.push(await detectCli('hermes-agent', 'https://github.com/nousresearch/hermes'));
  report.items.push(await writeRedactWrapper(targetDir));

  await writeFile(REPORT_FILE, JSON.stringify(report, null, 2));

  log(`report written to ${REPORT_FILE}`);
  console.log('\nInstall summary:');
  for (const item of report.items) {
    if (item.packages) {
      for (const pkg of item.packages) {
        console.log(`  ${pkg.name}: ${pkg.status}${pkg.version ? ` (${pkg.version})` : ''}${pkg.reason ? ` — ${pkg.reason}` : ''}`);
      }
    } else {
      console.log(`  ${item.name}: ${item.status}${item.path ? ` → ${item.path}` : ''}${item.reason ? ` — ${item.reason}` : ''}`);
    }
  }

  const failures = report.items.filter((i) => i.status === 'failed');
  if (failures.length) {
    console.warn('\nSome tools failed to install. The capture script will fall back to Playwright simulation for those sessions.');
  }
}

main().catch((err) => {
  console.error(redact(err.message));
  process.exit(1);
});
