import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/**
 * Signing-key rotation foundation for Agent IC.
 *
 * Supports multiple active signing keys with key IDs, expiration dates,
 * and priority ordering. This is a foundation, not a full HSM/KMS integration.
 */

export function parseKeyRing(env = process.env) {
  const ring = [];
  const primaryKey = env.AGENT_IC_EXPORT_SIGNING_KEY || env.AGENT_IC_AUDIT_SIGNING_KEY;
  const primaryKeyId = env.AGENT_IC_EXPORT_SIGNING_KEY_ID || env.AGENT_IC_AUDIT_SIGNING_KEY_ID || 'default';
  if (primaryKey) {
    ring.push({ key: primaryKey, keyId: String(primaryKeyId).slice(0, 120), expiresAt: null, priority: 1 });
  }
  const json = env.AGENT_IC_SIGNING_KEY_RING;
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (entry?.key && typeof entry.key === 'string') {
            ring.push({
              key: entry.key,
              keyId: String(entry.keyId || 'unknown').slice(0, 120),
              expiresAt: entry.expiresAt || null,
              priority: Number(entry.priority) || 0,
            });
          }
        }
      }
    } catch {
      // Ignore malformed key ring JSON
    }
  }
  return ring.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

export function selectSigningKey(ring, now = new Date()) {
  const active = ring.filter((k) => !k.expiresAt || new Date(k.expiresAt) > now);
  return active[0] || null;
}

export function findVerifyingKey(ring, keyId) {
  return ring.find((k) => k.keyId === keyId) || null;
}

export function verifyWithKeyRing(ring, signatureFn, targetSignature) {
  const active = ring.filter((k) => !k.expiresAt || new Date(k.expiresAt) > new Date());
  for (const entry of active) {
    const computed = signatureFn(entry.key);
    if (safeEqual(computed, targetSignature)) return { ok: true, keyId: entry.keyId };
  }
  return { ok: false, code: 'signature_mismatch' };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function generateKey({ keyId, expiresAt, priority = 1, keySpec = 'HMAC_256' } = {}) {
  const key = randomBytes(32).toString('hex');
  return {
    key,
    keyId: keyId || `key-${createHash('sha256').update(key).digest('hex').slice(0, 8)}`,
    expiresAt: expiresAt || null,
    priority,
    keySpec,
  };
}

export function addKeyToRing(ring, newKey) {
  const updated = ring.map((k) => ({ ...k, priority: (k.priority || 0) - 1 }));
  updated.push(newKey);
  return updated.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

export function keyRingHealth(ring) {
  const now = new Date();
  const active = ring.filter((k) => !k.expiresAt || new Date(k.expiresAt) > now);
  const expired = ring.filter((k) => k.expiresAt && new Date(k.expiresAt) <= now);
  const oldest = active.length > 0 ? active.reduce((oldest, k) => {
    const kDate = k.expiresAt ? new Date(k.expiresAt) : null;
    const oDate = oldest.expiresAt ? new Date(oldest.expiresAt) : null;
    if (!oDate) return k;
    if (!kDate) return oldest;
    return kDate < oDate ? k : oldest;
  }, active[0]) : null;
  return {
    totalKeys: ring.length,
    activeKeys: active.length,
    expiredKeys: expired.length,
    oldestKeyId: oldest?.keyId || null,
    oldestExpiresAt: oldest?.expiresAt || null,
    needsRotation: active.length === 0 || (oldest?.expiresAt && new Date(oldest.expiresAt) < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
  };
}
