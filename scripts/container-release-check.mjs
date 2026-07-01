#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function evaluateContainerRelease({ env = process.env, dockerfileText = readIfExists('Dockerfile'), dockerignoreText = readIfExists('.dockerignore'), toolResolver = defaultToolResolver } = {}) {
  const image = env.AGENT_IC_IMAGE_REF || 'agent-ic:local-production';
  const digest = env.AGENT_IC_IMAGE_DIGEST || '<image-digest-after-build>';
  const checks = [
    check('dockerfile_present', Boolean(dockerfileText), 'Dockerfile exists'),
    check('dockerignore_present', Boolean(dockerignoreText), '.dockerignore exists'),
    check('non_root_user', /USER\s+agentic/i.test(dockerfileText), 'Runtime image uses non-root USER agentic'),
    check('healthcheck_present', /HEALTHCHECK/i.test(dockerfileText), 'Dockerfile defines a healthcheck'),
    check('no_env_copy', !/COPY\s+.*\.env/i.test(dockerfileText), 'Dockerfile does not copy env files explicitly'),
    check('dockerignore_env', /\.env/.test(dockerignoreText), '.dockerignore excludes env files'),
    check('dockerignore_state', /\.agent-ic/.test(dockerignoreText), '.dockerignore excludes local state'),
    check('dockerignore_demo', /demo-out/.test(dockerignoreText), '.dockerignore excludes rendered media outputs'),
  ];
  const tools = {
    docker: toolResolver('docker') || toolResolver('podman'),
    trivy: toolResolver('trivy'),
    cosign: toolResolver('cosign'),
    syft: toolResolver('syft'),
  };
  const plan = {
    image,
    build: `${tools.docker || 'docker'} build -t ${image} .`,
    scan: `${tools.trivy || 'trivy'} image --exit-code 1 --severity HIGH,CRITICAL ${image}`,
    sbom: `${tools.syft || 'syft'} ${image} -o spdx-json > .agent-ic/container-sbom.spdx.json`,
    sign: `${tools.cosign || 'cosign'} sign --yes ${digest}`,
    verify: `${tools.cosign || 'cosign'} verify ${digest}`,
  };
  return {
    ok: checks.every((item) => item.ok),
    generatedAt: new Date().toISOString(),
    mode: 'preflight',
    checks,
    tools,
    missingTools: Object.entries(tools).filter(([, value]) => !value).map(([key]) => key),
    plan,
    fullProductionReady: false,
    remaining: [
      'Build the image in CI using the recorded build command.',
      'Scan the built image with a vulnerability scanner such as Trivy.',
      'Generate and retain an SBOM.',
      'Sign the image digest with Cosign or the platform signing service.',
      'Publish the signed image and run deployed smoke tests against it.',
    ],
  };
}

export function writeContainerReleaseReport(result, path = process.env.AGENT_IC_CONTAINER_REPORT || '.agent-ic/container-release-preflight.json') {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  return path;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = evaluateContainerRelease();
  const report = writeContainerReleaseReport(result);
  console.log(JSON.stringify({ ok: result.ok, report, missingTools: result.missingTools, checks: result.checks }, null, 2));
  if (!result.ok) process.exit(1);
}

function check(id, ok, message) {
  return { id, ok: Boolean(ok), message };
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function defaultToolResolver(bin) {
  const result = spawnSync('bash', ['-lc', `command -v ${bin}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}
