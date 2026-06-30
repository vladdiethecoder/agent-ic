import { createHash } from 'node:crypto';
import { appendAudit } from './auditStore.js';

/**
 * Key operation audit logging.
 *
 * Logs key lifecycle events (generate, rotate, sign, verify, expire)
 * as tamper-evident audit entries. Never leaks raw key material.
 */

export function logKeyOperation({ operation, keyId, actor = 'system', detail = '', tenantId = 'system' } = {}) {
  if (!operation || !keyId) throw new Error('operation and keyId are required');
  const keyHash = hashKeyId(keyId);
  return appendAudit({
    tenantId,
    userId: actor,
    role: 'system',
    action: `key_${operation}`,
    kind: 'key_operation',
    detail: `${operation} keyHash=${keyHash.slice(0, 16)}... ${detail}`,
    metadata: { operation, keyHash },
  });
}

export function hashKeyId(keyId) {
  return createHash('sha256').update(String(keyId)).digest('hex');
}

export function hashKeyMaterial(key) {
  return createHash('sha256').update(String(key)).digest('hex');
}
