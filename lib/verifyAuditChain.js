import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { parseKeyRing, verifyWithKeyRing } from './keyRotation.js';

/**
 * Offline audit chain verification.
 *
 * Verifies hash links and HMAC-SHA256 signatures for an array of audit entries
 * without requiring a running server. Supports key ring verification.
 */

const ROOT_HASH = '0'.repeat(64);

export function verifyAuditEntryHash(entry) {
  const { hash, signature, signatureAlg, signatureKeyId, signedAt, ...withoutIntegrityFields } = entry || {};
  const computed = createHash('sha256').update(stableStringify(withoutIntegrityFields)).digest('hex');
  return { ok: computed === entry?.hash, computed, expected: entry?.hash };
}

export function verifyAuditEntrySignature(entry, keyOrRing) {
  if (!entry?.signature) return { ok: false, code: 'signature_missing' };
  const ring = Array.isArray(keyOrRing) ? keyOrRing : keyOrRing ? [{ key: keyOrRing, keyId: 'default', priority: 1 }] : [];
  if (ring.length === 0) return { ok: false, code: 'signature_key_missing' };
  const expected = (key) => createHmac('sha256', key).update(stableStringify({ hash: entry.hash, signatureAlg: entry.signatureAlg || 'HMAC-SHA256', signatureKeyId: entry.signatureKeyId || 'default' })).digest('hex');
  return verifyWithKeyRing(ring, expected, entry.signature);
}

export function verifyAuditChain(entries, { key, keyRing, requireSignature = false } = {}) {
  if (!Array.isArray(entries)) return { ok: false, code: 'invalid_input', checked: 0, failures: [] };
  const ring = keyRing || (key ? [{ key, keyId: 'default', priority: 1 }] : []);
  const failures = [];
  const sorted = entries.slice().sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));

  for (let i = 0; i < sorted.length; i += 1) {
    const entry = sorted[i];
    const hashCheck = verifyAuditEntryHash(entry);
    if (!hashCheck.ok) failures.push({ id: entry.id, code: 'hash_mismatch', expected: hashCheck.expected, computed: hashCheck.computed });

    const signatureCheck = verifyAuditEntrySignature(entry, ring);
    if (requireSignature && !signatureCheck.ok) {
      failures.push({ id: entry.id, code: signatureCheck.code });
    } else if (!requireSignature && !signatureCheck.ok && signatureCheck.code !== 'signature_missing') {
      failures.push({ id: entry.id, code: signatureCheck.code });
    }

    const prev = sorted[i - 1];
    if (prev && entry.previousHash !== prev.hash) {
      failures.push({ id: entry.id, code: 'previous_hash_mismatch', expected: prev.hash, actual: entry.previousHash });
    }
    if (i === 0 && entry.previousHash !== ROOT_HASH && sorted.length > 1) {
      failures.push({ id: entry.id, code: 'root_hash_mismatch', expected: ROOT_HASH, actual: entry.previousHash });
    }
  }

  return {
    ok: failures.length === 0,
    code: failures.length === 0 ? 'ok' : 'verification_failed',
    checked: sorted.length,
    failures,
    signedCount: sorted.filter((e) => e.signature).length,
  };
}

function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}
