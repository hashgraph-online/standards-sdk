import {
  CanonicalizationResult,
  CanonicalAgentData,
  DidRoutingParams,
  ParsedHcs14Did,
} from './types';
import { canonicalizeAgentData } from './canonical';
import { createUaid as createUaidFn, parseHcs14Did } from './did';
import {
  isHederaNetwork,
  isHederaCaip10,
  toHederaCaip10,
  parseHederaCaip10,
  isEip155Caip10,
  toEip155Caip10,
} from './caip';
import {
  ResolverRegistry,
  defaultResolverRegistry,
} from './resolvers/registry';
import { HieroDidResolver } from './resolvers/hiero';
import { IssuerRegistry } from './issuers/registry';
import { HederaHieroIssuer } from './issuers/hiero';
import type { DidIssueRequest } from './issuers/types';
import { Client, PrivateKey } from '@hashgraph/sdk';
import { HCS11Client } from '../hcs-11/client';
import { NetworkType, detectKeyTypeFromString } from '../utils';
import { HederaMirrorNode } from '../services';
import { HCS10Client } from '../hcs-10/sdk';

/**
 * HCS-14 SDK client - lightweight facade around AID/UAID helpers and resolver registry.
 */
export interface HCS14ClientOptions {
  client?: Client;
  network?: NetworkType;
  operatorId?: string;
  privateKey?: string;
  registry?: ResolverRegistry;
  hcs10Client?: HCS10Client;
}

export class HCS14Client {
  private readonly registry: ResolverRegistry;
  private client?: Client;
  private network?: NetworkType;
  private operatorId?: string;
  private operatorPrivateKey?: string;
  private hcs10Client?: HCS10Client;
  private issuers: IssuerRegistry;

  constructor(options?: HCS14ClientOptions) {
    this.registry = options?.registry ?? defaultResolverRegistry;
    this.issuers = new IssuerRegistry();
    this.registerHederaIssuer();
    // Auto-register Hedera resolver for convenience
    this.registerHederaResolver();
    this.client = options?.client;
    this.network = options?.network;
    this.operatorId = options?.operatorId;
    if (
      !this.client &&
      options?.network &&
      options?.operatorId &&
      options?.privateKey
    ) {
      this.configureHederaClient(
        options.network,
        options.operatorId,
        options.privateKey,
      );
    }
    if (options?.privateKey) this.operatorPrivateKey = options.privateKey;
    if (options?.hcs10Client) this.hcs10Client = options.hcs10Client;
  }

  configureHederaClient(
    network: NetworkType,
    operatorId: string,
    privateKey: string,
  ): void {
    const client = Client.forName(network);
    const initial = detectKeyTypeFromString(privateKey);
    client.setOperator(operatorId, initial.privateKey);
    (async () => {
      try {
        const mirror = new HederaMirrorNode(network);
        const info = await mirror.requestAccount(operatorId);
        const keyType = info?.key?._type || '';
        const needsEcdsa = keyType.includes('ECDSA');
        const needsEd25519 = keyType.includes('ED25519');
        if (needsEcdsa && initial.detectedType !== 'ecdsa') {
          client.setOperator(
            operatorId,
            PrivateKey.fromStringECDSA(privateKey),
          );
        } else if (needsEd25519 && initial.detectedType !== 'ed25519') {
          client.setOperator(
            operatorId,
            PrivateKey.fromStringED25519(privateKey),
          );
        }
      } catch {}
    })();

    this.client = client;
    this.network = network;
    this.operatorId = operatorId;
    this.operatorPrivateKey = privateKey;
  }

  /**
   * DID issuance adapters
   */
  getIssuerRegistry(): IssuerRegistry {
    return this.issuers;
  }

  /** Convenience: list registered issuers with metadata. */
  listIssuers(): ReadonlyArray<import('./issuers/types').DidIssuer> {
    return this.issuers.list();
  }

  /** Convenience: list registered resolvers with metadata. */
  listResolvers(): ReadonlyArray<import('./resolvers/types').DidResolver> {
    return this.registry.list();
  }

  /** Convenience: filter issuers by DID method. */
  filterIssuersByMethod(method: string) {
    return this.issuers.filterByDidMethod(method);
  }

  /** Convenience: filter resolvers by DID method. */
  filterResolversByMethod(method: string) {
    return this.registry.filterByDidMethod(method);
  }

  registerHederaIssuer(): void {
    this.issuers.register(new HederaHieroIssuer());
  }

  async createDid(request: DidIssueRequest): Promise<string> {
    return this.issuers.issue(request);
  }

  canonicalizeAgentData(input: unknown): CanonicalizationResult {
    return canonicalizeAgentData(input);
  }

  createUaid(existingDid: string, params?: DidRoutingParams): string;
  createUaid(
    input: CanonicalAgentData | string,
    params?: DidRoutingParams,
    options?: { includeParams?: boolean },
  ): Promise<string> | string {
    if (typeof input === 'string') {
      return createUaidFn(input, params);
    }
    return createUaidFn(input, params, options);
  }

  parseHcs14Did(did: string): ParsedHcs14Did {
    return parseHcs14Did(did);
  }

  isHederaNetwork(value: string): boolean {
    return isHederaNetwork(value);
  }
  isHederaCaip10(value: string): boolean {
    return isHederaCaip10(value);
  }
  toHederaCaip10(
    network: Parameters<typeof toHederaCaip10>[0],
    accountId: string,
  ): string {
    return toHederaCaip10(network, accountId);
  }
  parseHederaCaip10(value: string): {
    network: Parameters<typeof toHederaCaip10>[0];
    accountId: string;
  } {
    return parseHederaCaip10(value);
  }
  isEip155Caip10(value: string): boolean {
    return isEip155Caip10(value);
  }
  toEip155Caip10(chainId: number | string, address: string): string {
    return toEip155Caip10(chainId, address);
  }

  getResolverRegistry(): ResolverRegistry {
    return this.registry;
  }

  registerHederaResolver(): void {
    this.registry.register(new HieroDidResolver());
  }

  /**
   * Issue a DID via adapters and immediately wrap as UAID with routing params.
   * For Hedera + proto=hcs-10, nativeId and uid are derived when possible.
   */
  async createDidWithUaid(options: {
    issue: DidIssueRequest;
    uid?: string;
    proto?: string;
    nativeId?: string;
  }): Promise<{ did: string; uaid: string; parsed: ParsedHcs14Did }> {
    const did = await this.createDid(options.issue);
    let uid = options.uid;
    const proto = options.proto;
    let nativeId = options.nativeId;

    const isHedera = options.issue.method === 'hedera';
    if (isHedera) {
      if (!nativeId) {
        if (!this.network || !this.operatorId) {
          throw new Error(
            'nativeId not provided and network/operatorId are not configured',
          );
        }
        nativeId = toHederaCaip10(this.network, this.operatorId);
      }
      if (!uid && proto === 'hcs-10' && this.network && this.operatorId) {
        try {
          if (!this.hcs10Client && this.operatorPrivateKey) {
            this.hcs10Client = new HCS10Client({
              network: this.network,
              operatorId: this.operatorId,
              operatorPrivateKey: this.operatorPrivateKey,
              silent: true,
            });
          }
          if (this.hcs10Client) {
            uid = await this.hcs10Client.getOperatorId();
          } else {
            const h11 = new HCS11Client({
              network: this.network,
              auth: { operatorId: this.operatorId },
              silent: true,
            });
            const fetched = await h11.fetchProfileByAccountId(
              this.operatorId,
              this.network,
            );
            const inbound = fetched?.topicInfo?.inboundTopic;
            uid = inbound ? `${inbound}@${this.operatorId}` : this.operatorId;
          }
        } catch {
          uid = this.operatorId;
        }
      }
    }

    uid = uid ?? '0';
    const uaid = this.createUaid(did, {
      uid,
      proto,
      nativeId,
    });
    const parsed = parseHcs14Did(uaid);
    return { did, uaid, parsed };
  }
}

export type {
  CanonicalizationResult,
  CanonicalAgentData,
  DidRoutingParams,
  ParsedHcs14Did,
};
