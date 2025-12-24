import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  PublicKey,
  TransactionReceipt,
} from '@hashgraph/sdk';
import { NetworkType } from '../utils/types';
import {
  createNodeOperatorContext,
  type NodeOperatorContext,
} from '../common/node-operator-resolver';
import {
  buildHcs15BaseAccountCreateTx,
  buildHcs15PetalAccountCreateTx,
} from './tx';
import type {
  PetalProfileOptions,
  PetalProfileResult,
  SDKHCS15ClientConfig,
} from './types';
import { HCS15BaseClient } from './base-client';

export class HCS15Client extends HCS15BaseClient {
  private readonly operatorCtx: NodeOperatorContext;
  private readonly client: Client;
  private readonly operatorId: AccountId;

  constructor(config: SDKHCS15ClientConfig) {
    super(config);
    this.operatorId = AccountId.fromString(config.operatorId);
    this.operatorCtx = createNodeOperatorContext({
      network: this.network,
      operatorId: this.operatorId,
      operatorKey: config.operatorKey,
      keyType: config.keyType,
      mirrorNode: this.mirrorNode,
      logger: this.logger,
      client:
        this.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet(),
    });
    this.client = this.operatorCtx.client;
  }

  public getKeyType(): 'ed25519' | 'ecdsa' {
    return this.operatorCtx.keyType;
  }

  public async close(): Promise<void> {
    try {
      this.client.close();
    } catch {}
  }

  private async ensureOperatorReady(): Promise<void> {
    await this.operatorCtx.ensureInitialized();
  }

  /**
   * Create a new base account with a newly generated ECDSA key and EVM alias.
   */
  async createBaseAccount(options?: {
    initialBalance?: number;
    maxAutomaticTokenAssociations?: number;
    accountMemo?: string;
    transactionMemo?: string;
  }): Promise<{
    accountId: string;
    privateKey: PrivateKey;
    privateKeyHex: string;
    publicKey: PublicKey;
    evmAddress: string;
    receipt: TransactionReceipt;
  }> {
    await this.ensureOperatorReady();
    const priv = PrivateKey.generateECDSA();
    const pub = priv.publicKey;
    const tx = buildHcs15BaseAccountCreateTx({
      publicKey: pub,
      initialBalance: new Hbar(options?.initialBalance ?? 10),
      maxAutomaticTokenAssociations: options?.maxAutomaticTokenAssociations,
      accountMemo: options?.accountMemo,
      transactionMemo: options?.transactionMemo,
    });
    const resp = await tx.execute(this.client);
    const receipt = await resp.getReceipt(this.client);
    if (!receipt.accountId) {
      throw new Error('HCS-15 BASE_ACCOUNT_CREATE_FAILED');
    }
    const accountId = receipt.accountId.toString();
    const evmAddress = `0x${pub.toEvmAddress()}`;
    this.logger.info('Created HCS-15 base account', { accountId, evmAddress });
    return {
      accountId,
      privateKey: priv,
      privateKeyHex: priv.toStringRaw(),
      publicKey: pub,
      evmAddress,
      receipt,
    };
  }

  /**
   * Create a Petal account that reuses the base account ECDSA key (no alias).
   */
  async createPetalAccount(params: {
    basePrivateKey: string | PrivateKey;
    initialBalance?: number;
    maxAutomaticTokenAssociations?: number;
    accountMemo?: string;
    transactionMemo?: string;
    profile?: PetalProfileOptions;
  }): Promise<{
    accountId: string;
    receipt: TransactionReceipt;
    profile?: PetalProfileResult;
  }> {
    await this.ensureOperatorReady();
    const baseKey =
      typeof params.basePrivateKey === 'string'
        ? PrivateKey.fromStringECDSA(params.basePrivateKey)
        : params.basePrivateKey;
    const pub = baseKey.publicKey;
    const tx = buildHcs15PetalAccountCreateTx({
      publicKey: pub,
      initialBalance: new Hbar(params.initialBalance ?? 1),
      maxAutomaticTokenAssociations: params.maxAutomaticTokenAssociations,
      accountMemo: params.accountMemo,
      transactionMemo: params.transactionMemo,
    });
    const resp = await tx.execute(this.client);
    const receipt = await resp.getReceipt(this.client);
    if (!receipt.accountId) {
      throw new Error('HCS-15 PETAL_ACCOUNT_CREATE_FAILED');
    }
    const accountId = receipt.accountId.toString();
    this.logger.info('Created HCS-15 petal account', { accountId });
    let profile: PetalProfileResult | undefined;
    if (params.profile) {
      profile = await this.createPetalProfile({
        accountId,
        basePrivateKey: baseKey,
        profile: params.profile,
      });
    }
    return { accountId, receipt, profile };
  }

  private async createPetalProfile(params: {
    accountId: string;
    basePrivateKey: PrivateKey;
    profile: PetalProfileOptions;
  }): Promise<PetalProfileResult> {
    const { HCS10Client } = await import('../hcs-10');
    const { PersonBuilder } = await import('../hcs-11');
    const hcs10 = new HCS10Client({
      network: this.network,
      operatorId: params.accountId,
      operatorPrivateKey: params.basePrivateKey.toString(),
      logLevel: this.logger.getLevel(),
    });

    try {
      const builder = new PersonBuilder()
        .setName(params.profile.displayName)
        .setBaseAccount(params.profile.baseAccountId);

      if (params.profile.alias) {
        builder.setAlias(params.profile.alias);
      }

      if (params.profile.bio) {
        builder.setBio(params.profile.bio);
      }

      if (params.profile.profileImage) {
        builder.setProfileImage(params.profile.profileImage);
      }

      if (params.profile.socials) {
        for (const social of params.profile.socials) {
          builder.addSocial(social.platform, social.handle);
        }
      }

      if (params.profile.properties) {
        for (const [key, value] of Object.entries(params.profile.properties)) {
          builder.addProperty(key, value);
        }
      }

      const result = await hcs10.create(builder, {
        ttl: params.profile.ttl ?? 300,
        updateAccountMemo: true,
      });

      if ('success' in result && result.success === false) {
        throw new Error(result.error ?? 'Failed to create petal profile');
      }

      const inboundTopicId =
        'inboundTopicId' in result ? result.inboundTopicId : '';
      const outboundTopicId =
        'outboundTopicId' in result ? result.outboundTopicId : '';
      const profileTopicId =
        'profileTopicId' in result ? result.profileTopicId : '';

      if (!profileTopicId) {
        throw new Error('Failed to resolve petal profile topic ID');
      }

      return {
        profileTopicId,
        inboundTopicId,
        outboundTopicId,
      };
    } finally {
      try {
        hcs10.getClient().close();
      } catch {}
    }
  }
}
