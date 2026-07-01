#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const policyPath = process.env.AGENT_IC_DEP_AUDIT_POLICY || 'security/dependency-audit-policy.json';
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const args = ['audit', '--json'];
if (policy.omitDevDependencies !== false) args.push('--omit=dev');

const result = spawnSync('npm', args, { encoding: 'utf8' });
let report;
try {
  report = JSON.parse(result.stdout || '{}');
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: 'npm audit did not return JSON', detail: error.message, stderr: result.stderr?.slice(0, 500) }, null, 2));
  process.exit(1);
}

const vulnerabilities = Object.entries(report.vulnerabilities || {}).flatMap(([name, vuln]) => {
  const via = Array.isArray(vuln.via) ? vuln.via : [];
  const advisories = via.filter((item) => item && typeof item === 'object');
  if (advisories.length === 0) {
    return [{ name, severity: vuln.severity, title: `${name} vulnerability`, url: null, source: null }];
  }
  return advisories.map((item) => ({
    name,
    severity: item.severity || vuln.severity,
    title: item.title || `${name} vulnerability`,
    url: item.url || null,
    source: item.source || item.id || null,
  }));
});

const failSeverities = new Set(policy.failOnSeverities || ['high', 'critical']);
const allowed = new Set((policy.allowedAdvisories || []).map((item) => String(item.source || item.id || item.url || item.title)));
const blocking = vulnerabilities.filter((vuln) => failSeverities.has(vuln.severity) && !isAllowed(vuln, allowed));
const summary = {
  ok: blocking.length === 0,
  policy: policyPath,
  omitDevDependencies: policy.omitDevDependencies !== false,
  failOnSeverities: [...failSeverities],
  totalVulnerabilities: vulnerabilities.length,
  blocking,
  metadata: report.metadata || null,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(blocking.length === 0 ? 0 : 1);

function isAllowed(vuln, allowedSet) {
  return [vuln.source, vuln.url, vuln.title].some((value) => value && allowedSet.has(String(value)));
}
