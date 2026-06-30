import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { parseKeyRing, verifyWithKeyRing } from './keyRotation.js';

/**
 * Offline export bundle verification.
 *
 * Recomputes SHA-256 hash and verifies HMAC-SHA256 signature without
 * requiring a running server. Uses only Node.js crypto (no external deps).
 * Supports key ring verification for rotated keys.
 */

export function verifyBundleHash(bundle) {
  const { sha256, signature, signatureAlg, signatureKeyId, signedAt, ...withoutIntegrityFields } = bundle || {};
  const computed = createHash('sha256').update(stableStringify(withoutIntegrityFields)).digest('hex');
  return { ok: computed === bundle?.sha256, computed, expected: bundle?.sha256 };
}

export function verifyBundleSignature(bundle, keyOrRing) {
  if (!bundle?.signature) return { ok: false, code: 'signature_missing' };
  const ring = Array.isArray(keyOrRing) ? keyOrRing : keyOrRing ? [{ key: keyOrRing, keyId: 'default', priority: 1 }] : [];
  if (ring.length === 0) return { ok: false, code: 'signature_key_missing' };
  const expected = (key) => createHmac('sha256', key).update(stableStringify({ sha256: bundle.sha256, signatureAlg: bundle.signatureAlg || 'HMAC-SHA256', signatureKeyId: bundle.signatureKeyId || 'default' })).digest('hex');
  return verifyWithKeyRing(ring, expected, bundle.signature);
}

export function verifyExportBundle(bundle, { key, keyRing, requireSignature = false } = {}) {
  const ring = keyRing || (key ? [{ key, keyId: 'default', priority: 1 }] : []);
  const hash = verifyBundleHash(bundle);
  const signature = verifyBundleSignature(bundle, ring);
  if (requireSignature && !signature.ok) {
    return { ok: false, code: signature.code, hash, signature };
  }
  return { ok: hash.ok && signature.ok, hash, signature };
}

function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}
