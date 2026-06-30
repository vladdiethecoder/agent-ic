import { keyRingHealth, parseKeyRing } from './keyRotation.js';
import { logKeyOperation } from './keyAudit.js';

/**
 * Key rotation policy enforcement foundation.
 *
 * Evaluates configurable policy rules against the current key ring.
 * Logs violations to the audit trail. Does not auto-generate keys.
 */

export function rotationPolicyConfig(env = process.env) {
  return {
    maxAgeDays: Number(env.AGENT_IC_KEY_MAX_AGE_DAYS || '90'),
    expireWarningDays: Number(env.AGENT_IC_KEY_EXPIRE_WARNING_DAYS || '7'),
    minActiveKeys: Number(env.AGENT_IC_KEY_MIN_ACTIVE || '1'),
    requirePolicy: env.AGENT_IC_KEY_ROTATION_POLICY_REQUIRED === 'true',
  };
}

export function evaluateRotationPolicy(ring, config = rotationPolicyConfig()) {
  const health = keyRingHealth(ring);
  const now = new Date();
  const violations = [];

  if (health.activeKeys === 0) {
    violations.push({ code: 'no_active_keys', message: 'No active signing keys' });
  }

  if (health.activeKeys < config.minActiveKeys) {
    violations.push({
      code: 'insufficient_active_keys',
      message: `Active keys (${health.activeKeys}) below minimum (${config.minActiveKeys})`,
    });
  }

  const oldestExpiresAt = health.oldestExpiresAt ? new Date(health.oldestExpiresAt) : null;
  if (oldestExpiresAt) {
    const daysUntilExpiry = (oldestExpiresAt - now) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry <= 0) {
      violations.push({
        code: 'key_expired',
        message: `Key ${health.oldestKeyId} expired`,
      });
    } else if (daysUntilExpiry <= config.expireWarningDays) {
      violations.push({
        code: 'key_expiring_soon',
        message: `Key ${health.oldestKeyId} expires in ${Math.floor(daysUntilExpiry)} days`,
      });
    }
  }

  // Check ALL keys for expiration (not just active ones)
  for (const key of ring) {
    if (key.expiresAt) {
      const expiresAt = new Date(key.expiresAt);
      const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry <= 0) {
        const alreadyReported = violations.some((v) => v.code === 'key_expired' && v.message.includes(key.keyId));
        if (!alreadyReported) {
          violations.push({
            code: 'key_expired',
            message: `Key ${key.keyId} expired`,
          });
        }
      }
    }
  }

  // Check key age if we have createdAt info (not available in current keyRingHealth)
  // For now, use expiration as proxy for age

  return {
    ok: violations.length === 0,
    violations,
    health,
    config,
    nextRotationDeadline: oldestExpiresAt || null,
  };
}

export function checkRotationPolicy(env = process.env) {
  const ring = parseKeyRing(env);
  const config = rotationPolicyConfig(env);
  const result = evaluateRotationPolicy(ring, config);

  if (!result.ok) {
    for (const violation of result.violations) {
      logKeyOperation({
        operation: 'policy_violation',
        keyId: result.health.oldestKeyId || 'unknown',
        actor: 'rotation-policy',
        detail: `${violation.code}: ${violation.message}`,
      });
    }
  }

  return result;
}
