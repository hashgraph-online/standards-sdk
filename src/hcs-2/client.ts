import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  PrivateKey,
  TopicId,
  TransactionReceipt,
  AccountId,
  PublicKey,
} from '@hashgraph/sdk';
import { HCS2BaseClient } from './base-client';
import {
  HCS2ClientConfig,
  HCS2Message,
  HCS2Operation,
  HCS2RegistryType,
  TopicRegistrationResponse,
  RegistryOperationResponse,
  TopicRegistry,
  CreateRegistryOptions,
  RegisterEntryOptions,
  UpdateEntryOptions,
  DeleteEntryOptions,
  MigrateTopicOptions,
  QueryRegistryOptions,
  RegistryEntry,
} from './types';
import { NetworkType } from '../utils/types';
import {
  NodeOperatorResolver,
  createNodeOperatorContext,
  type NodeOperatorContext,
} from '../common/node-operator-resolver';
import { buildMessageTx } from '../common/tx/tx-utils';
import { buildHcs2CreateRegistryTx } from './tx';

/**
 * SDK client configuration for HCS-2
 */
export interface SDKHCS2ClientConfig extends HCS2ClientConfig {
  operatorId: string | AccountId;
  operatorKey: string | PrivateKey;
  keyType?: 'ed25519' | 'ecdsa';
}

/**
 * SDK client for HCS-2 operations
 */
export class HCS2Client extends HCS2BaseClient {
  private static readonly operationAnalyticsCode: Record<
    HCS2Operation,
    number
  > = {
    [HCS2Operation.REGISTER]: 0,
    [HCS2Operation.UPDATE]: 1,
    [HCS2Operation.DELETE]: 2,
    [HCS2Operation.MIGRATE]: 3,
  };

  private client: Client;
  private operatorId: AccountId;
  private operatorCtx: NodeOperatorContext;
  private readonly registryTypeCache = new Map<string, HCS2RegistryType>();

  /**
   * Create a new HCS-2 client
   * @param config Client configuration
   */
  constructor(config: SDKHCS2ClientConfig) {
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

  /**
   * Initialize the Hedera client with operator information
   */
  private async ensureInitialized(): Promise<void> {
    await this.operatorCtx.ensureInitialized();
  }

  /**
   * Create a Hedera client for the specified network
   * @param network The network to connect to
   * @returns The Hedera client
   */
  private createClient(network: NetworkType): Client {
    if (network === 'mainnet') {
      return Client.forMainnet();
    } else {
      return Client.forTestnet();
    }
  }

  /**
   * Create a new registry topic
   * @param options Registry creation options
   * @returns Promise resolving to the transaction result
   */
  async createRegistry(
    options: CreateRegistryOptions = {},
  ): Promise<TopicRegistrationResponse> {
    try {
      await this.ensureInitialized();
      const registryType = options.registryType ?? HCS2RegistryType.INDEXED;
      const ttl = options.ttl ?? 86400; // Default TTL: 24 hours

      const memo = this.generateRegistryMemo(registryType, ttl);

      let adminKeyPrivate: PrivateKey | undefined;
      let adminPublicKey: PublicKey | undefined;
      if (options.adminKey) {
        if (typeof options.adminKey === 'string') {
          try {
            adminPublicKey = PublicKey.fromString(options.adminKey);
          } catch {
            const keyBytes = Buffer.from(
              options.adminKey.replace(/^0x/i, ''),
              'hex',
            );
            adminPublicKey =
              this.operatorCtx.keyType === 'ed25519'
                ? PublicKey.fromBytesED25519(keyBytes)
                : PublicKey.fromBytesECDSA(keyBytes);
          }
        } else if (typeof options.adminKey === 'boolean') {
          adminPublicKey = this.operatorCtx.operatorKey.publicKey;
        } else {
          adminPublicKey = options.adminKey.publicKey;
          adminKeyPrivate = options.adminKey;
        }
      }

      let submitKeyPrivate: PrivateKey | undefined;
      let submitPublicKey: PublicKey | undefined;
      if (options.submitKey) {
        if (typeof options.submitKey === 'string') {
          try {
            submitPublicKey = PublicKey.fromString(options.submitKey);
          } catch {
            const keyBytes = Buffer.from(
              options.submitKey.replace(/^0x/i, ''),
              'hex',
            );
            submitPublicKey =
              this.operatorCtx.keyType === 'ed25519'
                ? PublicKey.fromBytesED25519(keyBytes)
                : PublicKey.fromBytesECDSA(keyBytes);
          }
        } else if (typeof options.submitKey === 'boolean') {
          submitPublicKey = this.operatorCtx.operatorKey.publicKey;
        } else {
          submitPublicKey = options.submitKey.publicKey;
          submitKeyPrivate = options.submitKey;
        }
      }

      const transaction = buildHcs2CreateRegistryTx({
        registryType,
        ttl,
        adminKey: adminPublicKey,
        submitKey: submitPublicKey,
        operatorPublicKey: this.operatorCtx.operatorKey.publicKey,
      });

      const frozenTx = await transaction.freezeWith(this.client);

      if (adminKeyPrivate) {
        await frozenTx.sign(adminKeyPrivate);
      }

      if (submitKeyPrivate) {
        await frozenTx.sign(submitKeyPrivate);
      }

      const txResponse = await frozenTx.execute(this.client);

      const receipt = await txResponse.getReceipt(this.client);
      const topicId = receipt.topicId;

      if (!topicId) {
        throw new Error('Failed to create registry: No topic ID in receipt');
      }

      const topicIdStr = topicId.toString();
      this.registryTypeCache.set(topicIdStr, registryType);

      this.logger.info(
        `Created registry topic: ${topicIdStr} (${registryType === HCS2RegistryType.INDEXED ? 'Indexed' : 'Non-indexed'}, TTL: ${ttl}s)`,
      );

      return {
        success: true,
        topicId: topicIdStr,
        transactionId: txResponse.transactionId.toString(),
      };
    } catch (error) {
      this.logger.error(`Failed to create registry: ${error}`);
      return {
        success: false,
        error: `Failed to create registry: ${error}`,
      };
    }
  }

  /**
   * Register a new entry in the registry
   * @param registryTopicId The topic ID of the registry
   * @param options Registration options
   * @param protocol Optional protocol version (defaults to 'hcs-2')
   * @returns Promise resolving to the operation result
   */
  async registerEntry(
    registryTopicId: string,
    options: RegisterEntryOptions,
    protocol: string = 'hcs-2',
  ): Promise<RegistryOperationResponse> {
    try {
      await this.ensureInitialized();
      const message = this.createRegisterMessage(
        options.targetTopicId,
        options.metadata,
        options.memo,
        protocol,
      );

      const registryType =
        options.registryType ??
        (await this.resolveRegistryType(registryTopicId));
      this.registryTypeCache.set(registryTopicId, registryType);
      const analyticsMemo =
        options.analyticsMemo ??
        this.buildAnalyticsMemo(HCS2Operation.REGISTER, registryType);

      const receipt = await this.submitMessage(
        registryTopicId,
        message,
        analyticsMemo,
      );

      this.logger.info(
        `Registered entry in registry ${registryTopicId} pointing to topic ${options.targetTopicId} using protocol ${protocol}`,
      );

      return {
        success: true,
        receipt,
        sequenceNumber: receipt.topicSequenceNumber?.low ?? undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to register entry: ${error}`);
      return {
        success: false,
        error: `Failed to register entry: ${error}`,
      };
    }
  }

  /**
   * Update an existing entry in the registry (indexed registries only)
   * @param registryTopicId The topic ID of the registry
   * @param options Update options
   * @returns Promise resolving to the operation result
   */
  async updateEntry(
    registryTopicId: string,
    options: UpdateEntryOptions,
  ): Promise<RegistryOperationResponse> {
    try {
      await this.ensureInitialized();
      const registryInfo = await this.mirrorNode.getTopicInfo(registryTopicId);
      const memoInfo = this.parseRegistryTypeFromMemo(registryInfo.memo);

      if (!memoInfo || memoInfo.registryType !== HCS2RegistryType.INDEXED) {
        throw new Error(
          'Update operation is only valid for indexed registries',
        );
      }

      const message = this.createUpdateMessage(
        options.targetTopicId,
        options.uid,
        options.metadata,
        options.memo,
      );

      const registryType =
        options.registryType ??
        (await this.resolveRegistryType(registryTopicId));
      this.registryTypeCache.set(registryTopicId, registryType);
      const analyticsMemo =
        options.analyticsMemo ??
        this.buildAnalyticsMemo(HCS2Operation.UPDATE, registryType);

      const receipt = await this.submitMessage(
        registryTopicId,
        message,
        analyticsMemo,
      );

      this.logger.info(
        `Updated entry with UID ${options.uid} in registry ${registryTopicId}`,
      );

      return {
        success: true,
        receipt,
        sequenceNumber: receipt.topicSequenceNumber?.low ?? undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to update entry: ${error}`);
      throw error;
    }
  }

  /**
   * Delete an entry from the registry (indexed registries only)
   * @param registryTopicId The topic ID of the registry
   * @param options Delete options
   * @returns Promise resolving to the operation result
   */
  async deleteEntry(
    registryTopicId: string,
    options: DeleteEntryOptions,
  ): Promise<RegistryOperationResponse> {
    try {
      await this.ensureInitialized();
      const registryInfo = await this.mirrorNode.getTopicInfo(registryTopicId);
      const memoInfo = this.parseRegistryTypeFromMemo(registryInfo.memo);

      if (!memoInfo || memoInfo.registryType !== HCS2RegistryType.INDEXED) {
        throw new Error(
          'Delete operation is only valid for indexed registries',
        );
      }

      const message = this.createDeleteMessage(options.uid, options.memo);

      const registryType =
        options.registryType ??
        (await this.resolveRegistryType(registryTopicId));
      this.registryTypeCache.set(registryTopicId, registryType);
      const analyticsMemo =
        options.analyticsMemo ??
        this.buildAnalyticsMemo(HCS2Operation.DELETE, registryType);

      const receipt = await this.submitMessage(
        registryTopicId,
        message,
        analyticsMemo,
      );

      this.logger.info(
        `Deleted entry with UID ${options.uid} from registry ${registryTopicId}`,
      );

      return {
        success: true,
        receipt,
        sequenceNumber: receipt.topicSequenceNumber?.low ?? undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to delete entry: ${error}`);
      throw error;
    }
  }

  /**
   * Migrate a registry to a new topic
   * @param registryTopicId The topic ID of the registry
   * @param options Migration options
   * @returns Promise resolving to the operation result
   */
  async migrateRegistry(
    registryTopicId: string,
    options: MigrateTopicOptions,
  ): Promise<RegistryOperationResponse> {
    try {
      await this.ensureInitialized();
      const message = this.createMigrateMessage(
        options.targetTopicId,
        options.metadata,
        options.memo,
      );

      const registryType =
        options.registryType ??
        (await this.resolveRegistryType(registryTopicId));
      this.registryTypeCache.set(registryTopicId, registryType);
      const analyticsMemo =
        options.analyticsMemo ??
        this.buildAnalyticsMemo(HCS2Operation.MIGRATE, registryType);

      const receipt = await this.submitMessage(
        registryTopicId,
        message,
        analyticsMemo,
      );

      this.logger.info(
        `Migrated registry ${registryTopicId} to ${options.targetTopicId}`,
      );

      return {
        success: true,
        receipt,
        sequenceNumber: receipt.topicSequenceNumber?.low ?? undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to migrate registry: ${error}`);
      throw error;
    }
  }

  /**
   * Get all entries from a registry
   * @param topicId The topic ID of the registry
   * @param options Query options
   * @returns Promise resolving to the registry information
   */
  async getRegistry(
    topicId: string,
    options: QueryRegistryOptions = {},
  ): Promise<TopicRegistry> {
    try {
      await this.ensureInitialized();
      const topicInfo = await this.mirrorNode.getTopicInfo(topicId);
      this.logger.debug(
        `Retrieved topic info for ${topicId}: ${JSON.stringify(topicInfo)}`,
      );

      const memoInfo = this.parseRegistryTypeFromMemo(topicInfo.memo);

      if (!memoInfo) {
        throw new Error(
          `Topic ${topicId} is not an HCS-2 registry (invalid memo format)`,
        );
      }

      this.logger.debug(
        `Retrieving messages for topic ${topicId} with limit ${options.limit ?? 100}`,
      );
      const rawMessagesResult = (await this.mirrorNode.getTopicMessages(
        topicId,
        {
          sequenceNumber:
            options.skip && options.skip > 0 ? `gt:${options.skip}` : undefined,
          limit: options.limit ?? 100,
          order: options.order ?? 'asc',
        },
      )) as any[];

      const rawMessages = options.limit
        ? rawMessagesResult.slice(0, options.limit)
        : rawMessagesResult;

      this.logger.debug(
        `Retrieved ${rawMessagesResult.length} messages, using ${rawMessages.length} after applying limit.`,
      );

      const entries: RegistryEntry[] = [];
      let latestEntry: RegistryEntry | undefined;

      for (const msg of rawMessages) {
        try {
          const message: HCS2Message = {
            p: 'hcs-2',
            op: msg.op,
            t_id: msg.t_id,
            uid: msg.uid,
            metadata: msg.metadata,
            m: msg.m,
          } as HCS2Message;

          const { valid, errors } = this.validateMessage(message);
          if (!valid) {
            this.logger.warn(`Invalid HCS-2 message: ${errors.join(', ')}`);
            continue;
          }

          const entry: RegistryEntry = {
            topicId,
            sequence: msg.sequence_number,
            timestamp: msg.consensus_timestamp,
            payer: msg.payer_account_id || msg.payer || '',
            message,
            consensus_timestamp: msg.consensus_timestamp,
            registry_type: memoInfo.registryType,
          };

          entries.push(entry);

          if (
            memoInfo.registryType === HCS2RegistryType.NON_INDEXED ||
            !latestEntry ||
            entry.timestamp > latestEntry.timestamp
          ) {
            latestEntry = entry;
          }
        } catch (error) {
          this.logger.warn(`Error processing message: ${error}`);
        }
      }

      this.logger.debug(
        `Processed ${entries.length} valid entries for registry ${topicId}`,
      );

      const registry: TopicRegistry = {
        topicId,
        registryType: memoInfo.registryType,
        ttl: memoInfo.ttl,
        entries:
          memoInfo.registryType === HCS2RegistryType.INDEXED
            ? entries
            : latestEntry
              ? [latestEntry]
              : [],
        latestEntry,
      };

      return registry;
    } catch (error) {
      this.logger.error(`Failed to get registry: ${error}`);
      throw error;
    }
  }

  private buildAnalyticsMemo(
    operation: HCS2Operation,
    registryType: HCS2RegistryType,
  ): string {
    const opCode = HCS2Client.operationAnalyticsCode[operation];
    return `hcs-2:op:${opCode}:${registryType}`;
  }

  private async resolveRegistryType(
    topicId: string,
  ): Promise<HCS2RegistryType> {
    const cached = this.registryTypeCache.get(topicId);
    if (cached !== undefined) {
      return cached;
    }

    const topicInfo = await this.mirrorNode.getTopicInfo(topicId);
    const memoInfo = this.parseRegistryTypeFromMemo(topicInfo.memo);
    if (!memoInfo) {
      throw new Error(
        `Topic ${topicId} is not an HCS-2 registry (invalid memo format)`,
      );
    }

    this.registryTypeCache.set(topicId, memoInfo.registryType);
    return memoInfo.registryType;
  }

  /**
   * Submit a message to a topic
   * @param topicId The topic ID to submit to
   * @param payload The message payload
   * @returns Promise resolving to the transaction receipt
   */
  async submitMessage(
    topicId: string,
    payload: HCS2Message,
    analyticsMemo?: string,
  ): Promise<TransactionReceipt> {
    try {
      await this.ensureInitialized();
      const { valid, errors } = this.validateMessage(payload);
      if (!valid) {
        throw new Error(`Invalid HCS-2 message: ${errors.join(', ')}`);
      }

      const transaction = buildMessageTx({
        topicId,
        message: JSON.stringify(payload),
        transactionMemo: analyticsMemo,
      });

      const txResponse = await transaction.execute(this.client);

      const receipt = await txResponse.getReceipt(this.client);

      return receipt;
    } catch (error) {
      this.logger.error(`Failed to submit message: ${error}`);
      throw error;
    }
  }

  /**
   * @param topicId The topic ID to query
   * @returns Promise resolving to the topic information
   */
  public async getTopicInfo(topicId: string): Promise<any> {
    return this.mirrorNode.getTopicInfo(topicId);
  }

  /**
   * Close the client and release resources
   */
  public close(): void {
    this.logger.info('HCS-2 client closed.');
  }

  /**
   * Get the configured key type (ed25519 or ecdsa)
   */
  public getKeyType(): 'ed25519' | 'ecdsa' {
    return this.operatorCtx.keyType;
  }

  /**
   * Get the configured operator private key
   */
  public getOperatorKey(): PrivateKey {
    return this.operatorCtx.operatorKey;
  }
}
