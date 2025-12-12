import * as path from 'path';
import { Buffer } from 'buffer';
import { randomBytes } from 'crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import type {
  AutoRegisterEncryptionKeyOptions,
  CipherEnvelope,
  ClientEncryptionOptions,
  DecryptCipherEnvelopeOptions,
  DeriveSharedSecretOptions,
  EncryptCipherEnvelopeOptions,
  EphemeralKeyPair,
  EnsureAgentKeyOptions,
  RegisterEncryptionKeyPayload,
  RegisterEncryptionKeyResponse,
  SharedSecretInput,
} from '../types';
import { registerEncryptionKeyResponseSchema } from '../schemas';
import { optionalImport } from '../../../utils/dynamic-import';
import {
  RegistryBrokerClient,
  type GenerateEncryptionKeyPairOptions,
} from './base-client';

type FsModule = {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  writeFileSync: (path: string, data: string) => void;
  appendFileSync: (path: string, data: string) => void;
};

const getFs = async (): Promise<FsModule | null> => {
  const fsModule = await optionalImport<Partial<FsModule>>('node:fs');

  if (
    fsModule &&
    typeof fsModule.existsSync === 'function' &&
    typeof fsModule.readFileSync === 'function' &&
    typeof fsModule.writeFileSync === 'function' &&
    typeof fsModule.appendFileSync === 'function'
  ) {
    return fsModule as FsModule;
  }

  return null;
};

declare module './base-client' {
  interface RegistryBrokerClient {
    readonly encryption: {
      registerKey: (
        payload: RegisterEncryptionKeyPayload,
      ) => Promise<RegisterEncryptionKeyResponse>;
      generateEphemeralKeyPair: () => EphemeralKeyPair;
      deriveSharedSecret: (options: DeriveSharedSecretOptions) => Buffer;
      encryptCipherEnvelope: (
        options: EncryptCipherEnvelopeOptions,
      ) => CipherEnvelope;
      decryptCipherEnvelope: (options: DecryptCipherEnvelopeOptions) => string;
      ensureAgentKey: (
        options: EnsureAgentKeyOptions,
      ) => Promise<{ publicKey: string; privateKey?: string }>;
    };

    generateEncryptionKeyPair(
      options?: GenerateEncryptionKeyPairOptions,
    ): Promise<{
      privateKey: string;
      publicKey: string;
      envPath?: string;
      envVar: string;
    }>;

    createEphemeralKeyPair(): EphemeralKeyPair;
    deriveSharedSecret(options: DeriveSharedSecretOptions): Buffer;
    buildCipherEnvelope(options: EncryptCipherEnvelopeOptions): CipherEnvelope;
    openCipherEnvelope(options: DecryptCipherEnvelopeOptions): string;
    normalizeSharedSecret(input: SharedSecretInput): Buffer;

    bootstrapEncryptionOptions(
      options?: ClientEncryptionOptions,
    ): Promise<{ publicKey: string; privateKey?: string } | null>;
  }
}

async function registerEncryptionKey(
  client: RegistryBrokerClient,
  payload: RegisterEncryptionKeyPayload,
): Promise<RegisterEncryptionKeyResponse> {
  const raw = await client.requestJson('/encryption/keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  });
  return client.parseWithSchema(
    raw,
    registerEncryptionKeyResponseSchema,
    'register encryption key response',
  );
}

function normalizeAutoRegisterIdentity(
  config: AutoRegisterEncryptionKeyOptions,
): Pick<
  RegisterEncryptionKeyPayload,
  'uaid' | 'ledgerAccountId' | 'ledgerNetwork' | 'email'
> | null {
  const identity: Pick<
    RegisterEncryptionKeyPayload,
    'uaid' | 'ledgerAccountId' | 'ledgerNetwork' | 'email'
  > = {};
  if (config.uaid) {
    identity.uaid = config.uaid;
  }
  if (config.ledgerAccountId) {
    identity.ledgerAccountId = config.ledgerAccountId;
    if (config.ledgerNetwork) {
      identity.ledgerNetwork = config.ledgerNetwork;
    }
  }
  if (config.email) {
    identity.email = config.email;
  }
  if (identity.uaid || identity.ledgerAccountId || identity.email) {
    return identity;
  }
  return null;
}

function derivePublicKeyFromPrivateKey(
  client: RegistryBrokerClient,
  privateKey: string,
): string {
  const normalized = client.hexToBuffer(privateKey);
  const publicKey = secp256k1.getPublicKey(normalized, true);
  return Buffer.from(publicKey).toString('hex');
}

async function resolveAutoRegisterKeyMaterial(
  client: RegistryBrokerClient,
  config: AutoRegisterEncryptionKeyOptions,
): Promise<{ publicKey: string; privateKey?: string } | null> {
  if (config.publicKey?.trim()) {
    return { publicKey: config.publicKey.trim() };
  }
  let privateKey = config.privateKey?.trim();
  const envVar = config.envVar ?? 'RB_ENCRYPTION_PRIVATE_KEY';
  if (!privateKey && envVar && process?.env?.[envVar]?.trim()) {
    privateKey = process.env[envVar]?.trim();
  }
  if (!privateKey && config.generateIfMissing) {
    const pair = await client.generateEncryptionKeyPair({
      keyType: config.keyType ?? 'secp256k1',
      envVar,
      envPath: config.envPath,
      overwrite: config.overwriteEnv,
    });
    if (envVar) {
      process.env[envVar] = pair.privateKey;
    }
    return { publicKey: pair.publicKey, privateKey: pair.privateKey };
  }
  if (privateKey) {
    const publicKey = derivePublicKeyFromPrivateKey(client, privateKey);
    return { publicKey, privateKey };
  }
  return null;
}

async function autoRegisterEncryptionKey(
  client: RegistryBrokerClient,
  config: AutoRegisterEncryptionKeyOptions,
): Promise<{ publicKey: string; privateKey?: string }> {
  const identity = normalizeAutoRegisterIdentity(config);
  if (!identity) {
    throw new Error(
      'Auto-registration requires uaid, ledgerAccountId, or email',
    );
  }
  const material = await resolveAutoRegisterKeyMaterial(client, config);
  if (!material) {
    throw new Error(
      'Unable to resolve encryption public key for auto-registration',
    );
  }
  await registerEncryptionKey(client, {
    keyType: config.keyType ?? 'secp256k1',
    publicKey: material.publicKey,
    ...identity,
  });
  return material;
}

async function ensureAgentEncryptionKey(
  client: RegistryBrokerClient,
  options: EnsureAgentKeyOptions,
): Promise<{ publicKey: string; privateKey?: string }> {
  return autoRegisterEncryptionKey(client, {
    ...options,
    uaid: options.uaid,
    enabled: true,
  });
}

const encryptionApis = new WeakMap<
  RegistryBrokerClient,
  RegistryBrokerClient['encryption']
>();

Object.defineProperty(RegistryBrokerClient.prototype, 'encryption', {
  get(this: RegistryBrokerClient) {
    const existing = encryptionApis.get(this);
    if (existing) {
      return existing;
    }
    const api = {
      registerKey: (payload: RegisterEncryptionKeyPayload) =>
        registerEncryptionKey(this, payload),
      generateEphemeralKeyPair: () => this.createEphemeralKeyPair(),
      deriveSharedSecret: (options: DeriveSharedSecretOptions) =>
        this.deriveSharedSecret(options),
      encryptCipherEnvelope: (options: EncryptCipherEnvelopeOptions) =>
        this.buildCipherEnvelope(options),
      decryptCipherEnvelope: (options: DecryptCipherEnvelopeOptions) =>
        this.openCipherEnvelope(options),
      ensureAgentKey: (options: EnsureAgentKeyOptions) =>
        ensureAgentEncryptionKey(this, options),
    };
    encryptionApis.set(this, api);
    return api;
  },
});

RegistryBrokerClient.prototype.bootstrapEncryptionOptions = async function (
  this: RegistryBrokerClient,
  options?: ClientEncryptionOptions,
): Promise<{ publicKey: string; privateKey?: string } | null> {
  if (!options?.autoRegister || options.autoRegister.enabled === false) {
    return null;
  }
  return autoRegisterEncryptionKey(this, options.autoRegister);
};

RegistryBrokerClient.prototype.generateEncryptionKeyPair = async function (
  this: RegistryBrokerClient,
  options: GenerateEncryptionKeyPairOptions = {},
): Promise<{
  privateKey: string;
  publicKey: string;
  envPath?: string;
  envVar: string;
}> {
  this.assertNodeRuntime('generateEncryptionKeyPair');

  const keyType = options.keyType ?? 'secp256k1';
  if (keyType !== 'secp256k1') {
    throw new Error('Only secp256k1 key generation is supported currently');
  }

  const privateKeyBytes = randomBytes(32);
  const privateKey = Buffer.from(privateKeyBytes).toString('hex');
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
  const publicKey = Buffer.from(publicKeyBytes).toString('hex');

  const envVar = options.envVar ?? 'RB_ENCRYPTION_PRIVATE_KEY';
  const resolvedPath = options.envPath
    ? path.resolve(options.envPath)
    : undefined;

  if (resolvedPath) {
    const fsModule = await getFs();

    if (!fsModule) {
      throw new Error(
        'File system module is not available; cannot write encryption key env file',
      );
    }

    const envLine = `${envVar}=${privateKey}`;
    if (fsModule.existsSync(resolvedPath)) {
      const content = fsModule.readFileSync(resolvedPath, 'utf-8');
      const lineRegex = new RegExp(`^${envVar}=.*$`, 'm');
      if (lineRegex.test(content)) {
        if (!options.overwrite) {
          throw new Error(
            `${envVar} already exists in ${resolvedPath}; set overwrite=true to replace it`,
          );
        }
        const updated = content.replace(lineRegex, envLine);
        fsModule.writeFileSync(resolvedPath, updated);
      } else {
        const needsNewline = !content.endsWith('\n');
        fsModule.appendFileSync(
          resolvedPath,
          `${needsNewline ? '\n' : ''}${envLine}\n`,
        );
      }
    } else {
      fsModule.writeFileSync(resolvedPath, `${envLine}\n`);
    }
  }

  return {
    privateKey,
    publicKey,
    envPath: resolvedPath,
    envVar,
  };
};
