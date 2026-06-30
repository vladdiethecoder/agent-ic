import { readFileSync } from 'node:fs';
import { verifyExportBundle } from '../lib/verifyExportBundle.js';
import { verifyAuditChain } from '../lib/verifyAuditChain.js';
import { logKeyOperation } from '../lib/keyAudit.js';

/**
 * Auditor-facing offline verification CLI.
 *
 * Usage:
 *   node scripts/verify-evidence.mjs <bundle-file.json>
 *   AGENT_IC_EXPORT_SIGNING_KEY=... node scripts/verify-evidence.mjs <bundle-file.json>
 *   AGENT_IC_AUDIT_SIGNING_KEY=... node scripts/verify-evidence.mjs <bundle-file.json> --audit
 *
 * The tool never prints the signing key.
 */

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const auditMode = args.includes('--audit');
  const requireSignature = args.includes('--require-signature');

  if (!file) {
    console.error('Usage: node scripts/verify-evidence.mjs <bundle-file.json> [--audit] [--require-signature]');
    process.exit(1);
  }

  let bundle;
  try {
    bundle = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: 'read_failed', message: error.message }));
    process.exit(1);
  }

  const key = process.env.AGENT_IC_EXPORT_SIGNING_KEY || process.env.AGENT_IC_AUDIT_SIGNING_KEY || '';
  const report = {
    ok: true,
    file,
    bundle: verifyExportBundle(bundle, { key, requireSignature }),
  };

  if (auditMode && bundle?.contents?.auditChain?.ok !== undefined) {
    const auditEntries = bundle.contents.auditRows || [];
    report.audit = verifyAuditChain(auditEntries, { key, requireSignature });
  }

  report.ok = report.bundle.ok && (!report.audit || report.audit.ok);

  const keyId = bundle?.signatureKeyId || 'unknown';
  logKeyOperation({ operation: 'verify', keyId, actor: 'verify-cli', detail: `file=${file} ok=${report.ok} hash=${bundle?.sha256?.slice(0, 16)}...` });

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main();
