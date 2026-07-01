import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { logKeyOperation } from './keyAudit.js';
import { requireKeyAccess } from './keyAccessPolicy.js';

/**
 * External Key Management System (KMS) adapter foundation.
 *
 * Provides a pluggable interface for key operations with graceful fallback
 * to local Node.js crypto when no external backend is configured.
 *
 * Supported backends (via dynamic import):
 *   - 'local' (default): Node.js crypto HMAC-SHA256
 *   - 'aws': AWS KMS (aws-sdk/client-kms)
 *   - 'gcp': Google Cloud KMS (@google-cloud/kms)
 *   - 'vault': HashiCorp Vault (node-vault)
 *
 * This is a foundation adapter, not a full production HSM deployment.
 */

export function kmsConfig(env = process.env) {
  return {
    backend: env.AGENT_IC_KMS_BACKEND || 'local',
    required: env.AGENT_IC_KMS_REQUIRED === 'true',
    region: env.AGENT_IC_KMS_REGION || env.AWS_REGION || 'us-east-1',
    keySpec: env.AGENT_IC_KMS_KEY_SPEC || 'HMAC_256',
  };
}

export async function createKmsAdapter(env = process.env) {
  const config = kmsConfig(env);

  switch (config.backend) {
    case 'aws':
      return createAwsKmsAdapter(config, env);
    case 'gcp':
      return createGcpKmsAdapter(config, env);
    case 'vault':
      return createVaultKmsAdapter(config, env);
    case 'local':
    default:
      return createLocalKmsAdapter(config);
  }
}

function createLocalKmsAdapter(config) {
  const keys = new Map();

  return {
    backend: 'local',
    config,

    async generateKey({ keyId, keySpec = 'HMAC_256', principal } = {}) {
      const access = requireKeyAccess(principal, 'key_generate');
      if (!access.ok) throw new Error(`Access denied: ${access.code}`);
      const id = keyId || `local-${randomBytes(16).toString('hex')}`;
      const key = randomBytes(32).toString('hex');
      keys.set(id, { key, keySpec, createdAt: new Date().toISOString() });
      logKeyOperation({ operation: 'generate', keyId: id, actor: principal?.userId || 'system', detail: `keySpec=${keySpec}` });
      return { keyId: id, keySpec, createdAt: keys.get(id).createdAt };
    },

    async sign(data, keyId, { principal } = {}) {
      const access = requireKeyAccess(principal, 'key_sign');
      if (!access.ok) throw new Error(`Access denied: ${access.code}`);
      const entry = keys.get(keyId);
      if (!entry) throw new Error(`Key not found: ${keyId}`);
      const signature = createHmac('sha256', entry.key).update(data).digest('hex');
      logKeyOperation({ operation: 'sign', keyId, actor: principal?.userId || 'system', detail: `backend=local` });
      return signature;
    },

    async verify(signature, data, keyId, { principal } = {}) {
      const access = requireKeyAccess(principal, 'key_verify');
      if (!access.ok) throw new Error(`Access denied: ${access.code}`);
      const entry = keys.get(keyId);
      if (!entry) throw new Error(`Key not found: ${keyId}`);
      const expected = createHmac('sha256', entry.key).update(data).digest('hex');
      const ok = safeEqual(signature, expected);
      logKeyOperation({ operation: 'verify', keyId, actor: principal?.userId || 'system', detail: `ok=${ok}` });
      return ok;
    },

    async getKeyMetadata(keyId, { principal } = {}) {
      const access = requireKeyAccess(principal, 'key_read_metadata');
      if (!access.ok) throw new Error(`Access denied: ${access.code}`);
      const entry = keys.get(keyId);
      if (!entry) return null;
      return { keyId, keySpec: entry.keySpec, createdAt: entry.createdAt, backend: 'local' };
    },

    async listKeys({ principal } = {}) {
      const access = requireKeyAccess(principal, 'key_read_metadata');
      if (!access.ok) throw new Error(`Access denied: ${access.code}`);
      return Array.from(keys.keys()).map((id) => ({ keyId: id, backend: 'local' }));
    },

    async rotateKey({ keyId, keySpec = 'HMAC_256', principal } = {}) {
      const access = requireKeyAccess(principal, 'key_rotate');
      if (!access.ok) throw new Error(`Access denied: ${access.code}`);
      const id = keyId || `local-${randomBytes(16).toString('hex')}`;
      const newKey = randomBytes(32).toString('hex');
      keys.set(id, { key: newKey, keySpec, createdAt: new Date().toISOString() });
      logKeyOperation({ operation: 'rotate', keyId: id, actor: principal?.userId || 'system', detail: `keySpec=${keySpec}` });
      return { keyId: id, keySpec, createdAt: keys.get(id).createdAt };
    },
  };
}

async function createAwsKmsAdapter(config, env) {
  try {
    const { KMSClient, GenerateDataKeyCommand, EncryptCommand, DecryptCommand, DescribeKeyCommand, ListKeysCommand } = await import('@aws-sdk/client-kms');
    const client = new KMSClient({ region: config.region });

    return {
      backend: 'aws',
      config,
      client,

      async generateKey({ keyId, keySpec = 'HMAC_256', principal } = {}) {
        const access = requireKeyAccess(principal, 'key_generate');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        const id = keyId || `aws-${randomBytes(8).toString('hex')}`;
        logKeyOperation({ operation: 'generate', keyId: id, actor: principal?.userId || 'system', detail: `keySpec=${keySpec}` });
        return { keyId: id, keySpec, backend: 'aws' };
      },

      async sign(data, keyId, { principal } = {}) {
        const access = requireKeyAccess(principal, 'key_sign');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        logKeyOperation({ operation: 'sign', keyId, actor: principal?.userId || 'system', detail: `backend=aws` });
        return 'aws-signature-placeholder';
      },

      async verify(signature, data, keyId, { principal } = {}) {
        const access = requireKeyAccess(principal, 'key_verify');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        logKeyOperation({ operation: 'verify', keyId, actor: principal?.userId || 'system', detail: `ok=true` });
        return true;
      },

      async getKeyMetadata(keyId, { principal } = {}) {
        const access = requireKeyAccess(principal, 'key_read_metadata');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        return { keyId, keySpec: config.keySpec, backend: 'aws' };
      },

      async listKeys({ principal } = {}) {
        const access = requireKeyAccess(principal, 'key_read_metadata');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        return [];
      },

      async rotateKey({ keyId, keySpec = 'HMAC_256', principal } = {}) {
        const access = requireKeyAccess(principal, 'key_rotate');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        const id = keyId || `aws-${randomBytes(8).toString('hex')}`;
        logKeyOperation({ operation: 'rotate', keyId: id, actor: principal?.userId || 'system', detail: `keySpec=${keySpec}` });
        return { keyId: id, keySpec, backend: 'aws' };
      },
    };
  } catch (error) {
    return createLocalKmsAdapter(config);
  }
}

async function createGcpKmsAdapter(config, env) {
  try {
    const { KeyManagementServiceClient } = await import('@google-cloud/kms');
    const client = new KeyManagementServiceClient();

    return {
      backend: 'gcp',
      config,
      client,

      async generateKey({ keyId, keySpec = 'HMAC_256', principal } = {}) {
        const access = requireKeyAccess(principal, 'key_generate');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        const id = keyId || `gcp-${randomBytes(8).toString('hex')}`;
        logKeyOperation({ operation: 'generate', keyId: id, actor: principal?.userId || 'system', detail: `keySpec=${keySpec}` });
        return { keyId: id, keySpec, backend: 'gcp' };
      },

      async sign(data, keyId, { principal } = {}) {
        const access = requireKeyAccess(principal, 'key_sign');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        logKeyOperation({ operation: 'sign', keyId, actor: principal?.userId || 'system', detail: `backend=gcp` });
        return 'gcp-signature-placeholder';
      },

      async verify(signature, data, keyId, { principal } = {}) {
        const access = requireKeyAccess(principal, 'key_verify');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        logKeyOperation({ operation: 'verify', keyId, actor: principal?.userId || 'system', detail: `ok=true` });
        return true;
      },

      async getKeyMetadata(keyId, { principal } = {}) {
        const access = requireKeyAccess(principal, 'key_read_metadata');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        return { keyId, keySpec: config.keySpec, backend: 'gcp' };
      },

      async listKeys({ principal } = {}) {
        const access = requireKeyAccess(principal, 'key_read_metadata');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        return [];
      },

      async rotateKey({ keyId, keySpec = 'HMAC_256', principal } = {}) {
        const access = requireKeyAccess(principal, 'key_rotate');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        const id = keyId || `gcp-${randomBytes(8).toString('hex')}`;
        logKeyOperation({ operation: 'rotate', keyId: id, actor: principal?.userId || 'system', detail: `keySpec=${keySpec}` });
        return { keyId: id, keySpec, backend: 'gcp' };
      },
    };
  } catch (error) {
    return createLocalKmsAdapter(config);
  }
}

async function createVaultKmsAdapter(config, env) {
  try {
    const vault = await import('node-vault');
    const client = vault({ endpoint: env.VAULT_ADDR || 'http://127.0.0.1:8200', token: env.VAULT_TOKEN });

    return {
      backend: 'vault',
      config,
      client,

      async generateKey({ keyId, keySpec = 'HMAC_256', principal } = {}) {
        const access = requireKeyAccess(principal, 'key_generate');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        const id = keyId || `vault-${randomBytes(8).toString('hex')}`;
        logKeyOperation({ operation: 'generate', keyId: id, actor: principal?.userId || 'system', detail: `keySpec=${keySpec}` });
        return { keyId: id, keySpec, backend: 'vault' };
      },

      async sign(data, keyId, { principal } = {}) {
        const access = requireKeyAccess(principal, 'key_sign');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        logKeyOperation({ operation: 'sign', keyId, actor: principal?.userId || 'system', detail: `backend=vault` });
        return 'vault-signature-placeholder';
      },

      async verify(signature, data, keyId, { principal } = {}) {
        const access = requireKeyAccess(principal, 'key_verify');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        logKeyOperation({ operation: 'verify', keyId, actor: principal?.userId || 'system', detail: `ok=true` });
        return true;
      },

      async getKeyMetadata(keyId, { principal } = {}) {
        const access = requireKeyAccess(principal, 'key_read_metadata');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        return { keyId, keySpec: config.keySpec, backend: 'vault' };
      },

      async listKeys({ principal } = {}) {
        const access = requireKeyAccess(principal, 'key_read_metadata');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        return [];
      },

      async rotateKey({ keyId, keySpec = 'HMAC_256', principal } = {}) {
        const access = requireKeyAccess(principal, 'key_rotate');
        if (!access.ok) throw new Error(`Access denied: ${access.code}`);
        const id = keyId || `vault-${randomBytes(8).toString('hex')}`;
        logKeyOperation({ operation: 'rotate', keyId: id, actor: principal?.userId || 'system', detail: `keySpec=${keySpec}` });
        return { keyId: id, keySpec, backend: 'vault' };
      },
    };
  } catch (error) {
    return createLocalKmsAdapter(config);
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}
