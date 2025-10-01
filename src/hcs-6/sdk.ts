import { HCS6BaseClient } from './base-client';
import {
  HCS6ClientConfig,
  HCS6CreateHashinalOptions,
  HCS6CreateHashinalResponse,
  HCS6RegisterOptions,
  HCS6RegisterEntryOptions,
  HCS6TopicRegistrationResponse,
  HCS6RegistryOperationResponse,
  HCS6QueryRegistryOptions,
  HCS6TopicRegistry,
  HCS6Message,
  HCS6RegistryType,
  HCS6MintOptions,
  HCS6InscribeAndMintOptions,
  HCS6MintResponse,
  buildHcs6Hrl,
} from './types';
import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  PrivateKey,
  TopicId,
  TransactionReceipt,
  AccountId,
  PublicKey,
  TokenMintTransaction,
  TokenId,
} from '@hashgraph/sdk';
import { NetworkType } from '../utils/types';
import { buildHcs6CreateRegistryTx } from './tx';
import {
  NodeOperatorResolver,
  createNodeOperatorContext,
  type NodeOperatorContext,
} from '../common/node-operator-resolver';
import {
  inscribe,
  type InscriptionInput,
  type InscriptionOptions,
} from '../inscribe/inscriber';

export interface SDKHCS6ClientConfig extends HCS6ClientConfig {
  operatorId: string | AccountId;
  operatorKey: string | PrivateKey;
  keyType?: 'ed25519' | 'ecdsa';
}

export class HCS6Client extends HCS6BaseClient {
  private client: Client;
  private operatorId: AccountId;
  private operatorCtx: NodeOperatorContext;

  constructor(config: SDKHCS6ClientConfig) {
    super({
      network: config.network,
      logLevel: config.logLevel,
      silent: config.silent,
      mirrorNodeUrl: config.mirrorNodeUrl,
      logger: config.logger,
    });

    this.operatorId =
      typeof config.operatorId === 'string'
        ? AccountId.fromString(config.operatorId)
        : config.operatorId;

    this.operatorCtx = createNodeOperatorContext({
      network: this.network,
      operatorId: this.operatorId,
      operatorKey: config.operatorKey,
      keyType: config.keyType,
      mirrorNode: this.mirrorNode,
      logger: this.logger,
      client: this.createClient(config.network),
    });
    this.client = this.operatorCtx.client;
  }

  private async ensureInitialized(): Promise<void> {
    await this.operatorCtx.ensureInitialized();
  }

  private createClient(network: NetworkType): Client {
    if (network === 'mainnet') {
      return Client.forMainnet();
    } else {
      return Client.forTestnet();
    }
  }

  public close(): void {
    this.logger.info('HCS-6 client closed.');
  }

  public getKeyType(): 'ed25519' | 'ecdsa' {
    return this.operatorCtx.keyType;
  }

  public getOperatorKey(): PrivateKey {
    return this.operatorCtx.operatorKey;
  }

  public async submitMessage(
    topicId: string,
    payload: HCS6Message,
  ): Promise<TransactionReceipt> {
    return this.submitMessageWithKey(topicId, payload, undefined);
  }

  public async submitMessageWithKey(
    topicId: string,
    payload: HCS6Message,
    submitKey?: string | PrivateKey,
  ): Promise<TransactionReceipt> {
    const { valid, errors } = this.validateMessage(payload);
    if (!valid) {
      throw new Error(`Invalid HCS-6 message: ${errors.join(', ')}`);
    }

    let tx = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(JSON.stringify(payload));

    if (!submitKey) {
      const txResponse = await tx.execute(this.client);
      return await txResponse.getReceipt(this.client);
    }
    const privateKey =
      typeof submitKey === 'string'
        ? PrivateKey.fromString(submitKey)
        : submitKey;
    const frozen = await tx.freezeWith(this.client);
    await frozen.sign(privateKey);
    const resp = await frozen.execute(this.client);
    return await resp.getReceipt(this.client);
  }

  public async registerEntryWithKey(
    registryTopicId: string,
    options: HCS6RegisterEntryOptions,
    submitKey?: string | PrivateKey,
  ): Promise<HCS6RegistryOperationResponse> {
    try {
      const payload: HCS6Message = this.createRegisterMessage(
        options.targetTopicId,
        options.memo,
      );
      const receipt = await this.submitMessageWithKey(
        registryTopicId,
        payload,
        submitKey,
      );
      const sequenceNumber = (receipt as TransactionReceipt).topicSequenceNumber?.toNumber();
      return { success: true, receipt, sequenceNumber };
    } catch (error) {
      this.logger.error(`Failed to register HCS-6 entry: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  public async createRegistry(
    options: { ttl?: number; submitKey?: string | boolean | PrivateKey } = {},
  ): Promise<HCS6TopicRegistrationResponse> {
    try {
      await this.ensureInitialized();
      const ttl = options.ttl ?? 86400;
      if (!(ttl >= 3600)) {
        throw new Error('TTL must be at least 3600 seconds (1 hour)');
      }
      let submitKeyPublic: PublicKey | undefined;
      let submitKeyPrivate: PrivateKey | undefined;
      if (options.submitKey) {
        if (typeof options.submitKey === 'string') {
          try {
            submitKeyPublic = PublicKey.fromString(options.submitKey);
          } catch {
            const keyBytes = Buffer.from(
              options.submitKey.replace(/^0x/i, ''),
              'hex',
            );
            submitKeyPublic =
              this.operatorCtx.keyType === 'ed25519'
                ? PublicKey.fromBytesED25519(keyBytes)
                : PublicKey.fromBytesECDSA(keyBytes);
          }
        } else if (typeof options.submitKey === 'boolean') {
          submitKeyPublic = this.operatorCtx.operatorKey.publicKey;
        } else {
          submitKeyPublic = options.submitKey.publicKey;
          submitKeyPrivate = options.submitKey;
        }
      }

      let transaction = buildHcs6CreateRegistryTx({
        ttl,
        submitKey: submitKeyPublic,
        adminKey: this.operatorCtx.operatorKey.publicKey,
        operatorPublicKey: this.operatorCtx.operatorKey.publicKey,
      });

      const frozenTx = await transaction.freezeWith(this.client);
      if (submitKeyPrivate) {
        await frozenTx.sign(submitKeyPrivate);
      }
      const txResponse = await frozenTx.execute(this.client);
      const receipt = await txResponse.getReceipt(this.client);
      const topicId = receipt.topicId;
      if (!topicId) {
        throw new Error(
          'Failed to create HCS-6 registry: No topic ID in receipt',
        );
      }
      return {
        success: true,
        topicId: topicId.toString(),
        transactionId: txResponse.transactionId.toString(),
      };
    } catch (error) {
      this.logger.error(`Failed to create HCS-6 registry: ${error}`);
      return {
        success: false,
        error: `Failed to create HCS-6 registry: ${error}`,
      };
    }
  }

  public async registerEntry(
    registryTopicId: string,
    options: HCS6RegisterEntryOptions,
  ): Promise<HCS6RegistryOperationResponse> {
    await this.ensureInitialized();
    return this.registerEntryWithKey(registryTopicId, options, undefined);
  }

  public async getRegistry(
    topicId: string,
    options: HCS6QueryRegistryOptions = {},
  ): Promise<HCS6TopicRegistry> {
    await this.ensureInitialized();
    const topicInfo = await this.mirrorNode.getTopicInfo(topicId);
    const memo = topicInfo.memo || '';
    const match = memo.match(/^hcs-6:(\d):(\d+)$/);
    if (!match) {
      throw new Error(
        `Topic ${topicId} is not an HCS-6 registry (invalid memo format)`,
      );
    }
    const ttl = parseInt(match[2]);
    const regType = parseInt(match[1]) as HCS6RegistryType;
    const messages = (await this.mirrorNode.getTopicMessages(topicId, {
      sequenceNumber:
        options.skip && options.skip > 0 ? `gt:${options.skip}` : undefined,
      limit: options.limit ?? 100,
      order: options.order ?? 'asc',
    }));
    const entries = messages
      .map(m => {
        try {
          const decoded = m as unknown as HCS6Message & {
            consensus_timestamp?: string;
            sequence_number: number;
            payer?: string;
          };
          const { valid } = this.validateMessage(decoded as unknown as HCS6Message);
          if (!valid) return null;
          return {
            topicId,
            sequence: decoded.sequence_number,
            timestamp: decoded.consensus_timestamp || '',
            payer: decoded.payer || '',
            message: decoded as unknown as HCS6Message,
            consensus_timestamp: decoded.consensus_timestamp || '',
            registry_type: regType,
          };
        } catch {
          return null;
        }
      })
      .filter(
        (v): v is {
          topicId: string;
          sequence: number;
          timestamp: string;
          payer: string;
          message: HCS6Message;
          consensus_timestamp: string;
          registry_type: HCS6RegistryType;
        } => Boolean(v),
      );
    const latest = entries.length > 0 ? entries[entries.length - 1] : undefined;
    return {
      topicId,
      registryType: regType,
      ttl,
      entries,
      latestEntry: latest,
    };
  }

  public async mint(options: HCS6MintOptions): Promise<HCS6MintResponse> {
    try {
      await this.ensureInitialized();
      if (!options.metadataTopicId) {
        return {
          success: false,
          error: 'metadataTopicId is required for mint()',
        };
      }
      const metadata = buildHcs6Hrl(options.metadataTopicId);
      let tx = new TokenMintTransaction()
        .setTokenId(TokenId.fromString(options.tokenId))
        .setMetadata([Buffer.from(metadata)]);
      const frozen = await tx.freezeWith(this.client);

      if (options.supplyKey) {
        const resolver = new NodeOperatorResolver({
          mirrorNode: this.mirrorNode,
          logger: this.logger,
        });
        const privKey =
          typeof options.supplyKey === 'string'
            ? await resolver.resolveSupplyKey(
                options.tokenId,
                options.supplyKey,
                this.operatorCtx.keyType,
              )
            : options.supplyKey;
        await frozen.sign(privKey);
      }

      const resp = await frozen.execute(this.client);
      const receipt = await resp.getReceipt(this.client);
      const serial =
        receipt.serials && receipt.serials[0]
          ? Number(receipt.serials[0].toString())
          : undefined;
      return {
        success: true,
        serialNumber: serial,
        transactionId: resp.transactionId?.toString?.(),
        metadata,
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  public async inscribeAndMint(
    options: HCS6InscribeAndMintOptions,
  ): Promise<HCS6MintResponse> {
    try {
      await this.ensureInitialized();
      const inscribeOptions: InscriptionOptions = {
        ...(options.inscriptionOptions as InscriptionOptions | undefined),
        mode: 'hashinal',
        waitForConfirmation: true,
      };
      const result = await inscribe(
        options.inscriptionInput as InscriptionInput,
        {
          accountId: this.operatorId.toString(),
          privateKey: this.operatorCtx.operatorKey,
          network: this.network,
        },
        inscribeOptions,
      );
      if (!result.confirmed || !result.inscription) {
        return { success: false, error: 'Failed to inscribe content' };
      }
      const topicId =
        result.inscription.jsonTopicId || result.inscription.topic_id;
      if (!topicId) {
        return { success: false, error: 'No topic ID from inscription' };
      }
      return await this.mint({
        tokenId: options.tokenId,
        metadataTopicId: topicId,
        supplyKey: options.supplyKey,
        memo: options.memo,
      });
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  public async createHashinal(
    options: HCS6CreateHashinalOptions,
  ): Promise<HCS6CreateHashinalResponse> {
    try {
      await this.ensureInitialized();

      let registryTopicId: string;
      let registryTransactionId: string | undefined;

      if (options.registryTopicId) {
        registryTopicId = options.registryTopicId;
        const topicInfo = await this.mirrorNode.getTopicInfo(registryTopicId);
        const memo = topicInfo.memo || '';
        if (!/^hcs-6:\d:\d+$/.test(memo)) {
          throw new Error(
            `Topic ${registryTopicId} is not a valid HCS-6 registry`,
          );
        }
      } else {
        const res = await this.createRegistry({
          ttl: options.ttl,
          submitKey: true,
        });
        if (!res.success || !res.topicId) {
          throw new Error(res.error || 'Failed to create HCS-6 registry');
        }
        registryTopicId = res.topicId;
        registryTransactionId = res.transactionId;
      }

      const inscriptionBuffer = Buffer.from(JSON.stringify(options.metadata));
      const inscribeOptions: InscriptionOptions = {
        ...(options.inscriptionOptions as InscriptionOptions | undefined),
        mode: 'hashinal',
        metadata: options.metadata,
        waitForConfirmation: true,
      };

      const result = await inscribe(
        {
          type: 'buffer',
          buffer: inscriptionBuffer,
          fileName: 'metadata.json',
          mimeType: 'application/json',
        },
        {
          accountId: this.operatorId.toString(),
          privateKey: this.operatorCtx.operatorKey,
          network: this.network,
        },
        inscribeOptions,
      );

      if (!result.confirmed || !result.inscription) {
        throw new Error('Failed to inscribe metadata');
      }
      const topicId =
        result.inscription.jsonTopicId || result.inscription.topic_id;
      if (!topicId) {
        throw new Error('No inscription topic ID available');
      }

      const reg = await this.registerEntryWithKey(
        registryTopicId,
        {
          targetTopicId: topicId,
          memo: options.memo || 'Dynamic hashinal registration',
        },
        options.submitKey,
      );
      if (!reg.success) {
        throw new Error(reg.error || 'Failed to register entry');
      }

      return {
        success: true,
        registryTopicId,
        inscriptionTopicId: topicId,
        transactionId: registryTransactionId,
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  public async register(
    options: HCS6RegisterOptions,
  ): Promise<HCS6CreateHashinalResponse> {
    try {
      await this.ensureInitialized();

      let registryTopicId: string;
      let registryTransactionId: string | undefined;

      if (options.registryTopicId) {
        registryTopicId = options.registryTopicId;
        const topicInfo = await this.mirrorNode.getTopicInfo(registryTopicId);
        const memo = topicInfo.memo || '';
        if (!/^hcs-6:\d:\d+$/.test(memo)) {
          throw new Error(
            `Topic ${registryTopicId} is not a valid HCS-6 registry`,
          );
        }
      } else {
        const res = await this.createRegistry({
          ttl: options.ttl,
          submitKey: true,
        });
        if (!res.success || !res.topicId) {
          throw new Error(res.error || 'Failed to create HCS-6 registry');
        }
        registryTopicId = res.topicId;
        registryTransactionId = res.transactionId;
      }

      let inscriptionInput: InscriptionInput;
      if (options.data?.base64) {
        const buffer = Buffer.from(options.data.base64, 'base64');
        inscriptionInput = {
          type: 'buffer',
          buffer,
          fileName: `data.${options.data.mimeType?.split('/')[1] || 'bin'}`,
          mimeType: options.data.mimeType || 'application/octet-stream',
        };
      } else if (options.data?.url) {
        inscriptionInput = { type: 'url', url: options.data.url };
      } else {
        inscriptionInput = {
          type: 'buffer',
          buffer: Buffer.from(JSON.stringify(options.metadata)),
          fileName: 'metadata.json',
          mimeType: 'application/json',
        };
      }

      const inscribeOptions: InscriptionOptions = {
        ...(options.inscriptionOptions as InscriptionOptions | undefined),
        mode: 'hashinal',
        metadata: options.metadata,
        waitForConfirmation: true,
      };

      const result = await inscribe(
        inscriptionInput,
        {
          accountId: this.operatorId.toString(),
          privateKey: this.operatorCtx.operatorKey,
          network: this.network,
        },
        inscribeOptions,
      );
      if (!result.confirmed || !result.inscription) {
        throw new Error('Failed to inscribe data');
      }
      const topicId =
        result.inscription.jsonTopicId || result.inscription.topic_id;
      if (!topicId) {
        throw new Error('No inscription topic ID available');
      }

      const reg = await this.registerEntryWithKey(
        registryTopicId,
        {
          targetTopicId: topicId,
          memo: options.memo || 'Dynamic hashinal registration',
        },
        options.submitKey,
      );
      if (!reg.success) {
        throw new Error(reg.error || 'Failed to register entry');
      }

      return {
        success: true,
        registryTopicId,
        inscriptionTopicId: topicId,
        transactionId: registryTransactionId,
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}
