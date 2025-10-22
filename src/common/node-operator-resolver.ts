import { AccountId, Client, PrivateKey } from '@hashgraph/sdk';
import { HederaMirrorNode } from '../services/mirror-node';
import { ILogger } from '../utils/logger';
import { detectKeyTypeFromString } from '../utils/key-type-detector';
import { NetworkType } from '../utils/types';

/**
 * Resolves operator and supply private keys using Mirror Node as source of truth
 * with format-detection fallbacks for string keys.
 */
export class NodeOperatorResolver {
  private readonly mirror: HederaMirrorNode;
  private readonly logger: ILogger;

  constructor(params: { mirrorNode: HederaMirrorNode; logger: ILogger }) {
    this.mirror = params.mirrorNode;
    this.logger = params.logger;
  }

  /**
   * Best-guess parsing for an operator key without network calls.
   * - If PrivateKey: returns immediately with provided or fallback type.
   * - If string with explicitType: parse directly.
   * - If string without type: detect format; fallback to ECDSA.
   */
  bestGuessOperatorKey(
    operatorKeyInput: string | PrivateKey,
    explicitType?: 'ed25519' | 'ecdsa',
  ): { keyType: 'ed25519' | 'ecdsa'; privateKey: PrivateKey } {
    if (typeof operatorKeyInput !== 'string') {
      return { keyType: explicitType || 'ecdsa', privateKey: operatorKeyInput };
    }
    if (explicitType) {
      const pk =
        explicitType === 'ed25519'
          ? PrivateKey.fromStringED25519(operatorKeyInput)
          : PrivateKey.fromStringECDSA(operatorKeyInput);
      return { keyType: explicitType, privateKey: pk };
    }
    try {
      const detected = detectKeyTypeFromString(operatorKeyInput);
      return {
        keyType: detected.detectedType,
        privateKey: detected.privateKey,
      };
    } catch {
      return {
        keyType: 'ecdsa',
        privateKey: PrivateKey.fromStringECDSA(operatorKeyInput),
      };
    }
  }

  /**
   * Resolve an operator key using Mirror Node for key type when possible.
   * - If PrivateKey: return immediately.
   * - If explicitType: parse directly.
   * - Else: query Mirror Node; fallback to local detection.
   */
  async resolveOperatorKey(
    operatorId: string | AccountId,
    operatorKeyInput: string | PrivateKey,
    explicitType?: 'ed25519' | 'ecdsa',
  ): Promise<{ keyType: 'ed25519' | 'ecdsa'; privateKey: PrivateKey }> {
    if (typeof operatorKeyInput !== 'string') {
      return { keyType: explicitType || 'ecdsa', privateKey: operatorKeyInput };
    }
    if (explicitType) {
      const pk =
        explicitType === 'ed25519'
          ? PrivateKey.fromStringED25519(operatorKeyInput)
          : PrivateKey.fromStringECDSA(operatorKeyInput);
      return { keyType: explicitType, privateKey: pk };
    }
    const account =
      typeof operatorId === 'string' ? operatorId : operatorId.toString();
    try {
      const info = await this.mirror.requestAccount(account);
      const t = info?.key?._type || '';
      const keyType: 'ed25519' | 'ecdsa' = t.includes('ED25519')
        ? 'ed25519'
        : 'ecdsa';
      const privateKey =
        keyType === 'ed25519'
          ? PrivateKey.fromStringED25519(operatorKeyInput)
          : PrivateKey.fromStringECDSA(operatorKeyInput);
      return { keyType, privateKey };
    } catch {
      this.logger.warn(
        'Mirror node key detection failed; using local detection or default ECDSA',
      );
      return this.bestGuessOperatorKey(operatorKeyInput);
    }
  }

  /**
   * Resolve a supply key for the given token using Mirror Node token supply_key._type when possible.
   */
  async resolveSupplyKey(
    tokenId: string,
    keyInput: string | PrivateKey,
    fallbackType: 'ed25519' | 'ecdsa',
    explicitType?: 'ed25519' | 'ecdsa',
  ): Promise<PrivateKey> {
    try {
      const info = await this.mirror.getTokenInfo(tokenId);
      const t = info?.supply_key?._type || '';
      if (typeof keyInput !== 'string') {
        return keyInput;
      }
      if (explicitType) {
        return explicitType === 'ed25519'
          ? PrivateKey.fromStringED25519(keyInput)
          : PrivateKey.fromStringECDSA(keyInput);
      }
      if (t.includes('ED25519')) {
        return PrivateKey.fromStringED25519(keyInput);
      }
      if (t.includes('ECDSA')) {
        return PrivateKey.fromStringECDSA(keyInput);
      }
      return fallbackType === 'ed25519'
        ? PrivateKey.fromStringED25519(keyInput)
        : PrivateKey.fromStringECDSA(keyInput);
    } catch {
      if (typeof keyInput !== 'string') {
        return keyInput;
      }
      if (explicitType) {
        return explicitType === 'ed25519'
          ? PrivateKey.fromStringED25519(keyInput)
          : PrivateKey.fromStringECDSA(keyInput);
      }
      return fallbackType === 'ed25519'
        ? PrivateKey.fromStringED25519(keyInput)
        : PrivateKey.fromStringECDSA(keyInput);
    }
  }
}

export interface NodeOperatorInitParams {
  network: NetworkType;
  operatorId: string | AccountId;
  operatorKey: string | PrivateKey;
  keyType?: 'ed25519' | 'ecdsa';
  mirrorNode: HederaMirrorNode;
  logger: ILogger;
  client?: Client;
}

export interface NodeOperatorContext {
  client: Client;
  operatorId: AccountId;
  readonly operatorKey: PrivateKey;
  readonly keyType: 'ed25519' | 'ecdsa';
  ensureInitialized(): Promise<void>;
}

export function createNodeOperatorContext(
  params: NodeOperatorInitParams,
): NodeOperatorContext {
  const operatorId: AccountId =
    typeof params.operatorId === 'string'
      ? AccountId.fromString(params.operatorId)
      : params.operatorId;

  const client: Client = params.client
    ? params.client
    : params.network === 'mainnet'
      ? Client.forMainnet()
      : Client.forTestnet();

  const resolver = new NodeOperatorResolver({
    mirrorNode: params.mirrorNode,
    logger: params.logger,
  });

  let currentKeyType: 'ed25519' | 'ecdsa';
  let currentPrivateKey: PrivateKey;

  const guess = resolver.bestGuessOperatorKey(
    params.operatorKey,
    params.keyType,
  );
  currentKeyType = guess.keyType;
  currentPrivateKey = guess.privateKey;
  client.setOperator(operatorId.toString(), currentPrivateKey);

  const initPromise = (async () => {
    try {
      const resolved = await resolver.resolveOperatorKey(
        operatorId,
        params.operatorKey,
        params.keyType,
      );
      currentKeyType = resolved.keyType;
      currentPrivateKey = resolved.privateKey;
      client.setOperator(operatorId.toString(), currentPrivateKey);
    } catch {}
  })();

  return {
    client,
    operatorId,
    get operatorKey() {
      return currentPrivateKey;
    },
    get keyType() {
      return currentKeyType;
    },
    ensureInitialized: async () => {
      await initPromise;
    },
  };
}
