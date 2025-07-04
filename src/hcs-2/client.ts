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
  RegistryEntry
} from './types';
import { NetworkType } from '../utils/types';
import { detectKeyTypeFromString } from '../utils/key-type-detector';

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
  private client: Client;
  private operatorId: AccountId;
  private operatorKey: PrivateKey;
  private initialized = false;
  private keyType: 'ed25519' | 'ecdsa';

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
    });

    // Store operator information
    this.operatorId = typeof config.operatorId === 'string' 
      ? AccountId.fromString(config.operatorId) 
      : config.operatorId;

    // Handle key type detection
    if (config.keyType) {
      this.keyType = config.keyType;
      this.operatorKey = typeof config.operatorKey === 'string'
        ? this.keyType === 'ecdsa'
          ? PrivateKey.fromStringECDSA(config.operatorKey)
          : PrivateKey.fromStringED25519(config.operatorKey)
        : config.operatorKey;
    } else if (typeof config.operatorKey === 'string') {
      try {
        const keyDetection = detectKeyTypeFromString(config.operatorKey);
        this.operatorKey = keyDetection.privateKey;
        this.keyType = keyDetection.detectedType;
      } catch (error) {
        this.logger.warn(
          'Failed to detect key type from private key format, defaulting to ED25519',
        );
        this.keyType = 'ed25519';
        try {
          this.operatorKey = PrivateKey.fromStringED25519(config.operatorKey);
        } catch (ed25519Error) {
          try {
            this.operatorKey = PrivateKey.fromStringECDSA(config.operatorKey);
            this.keyType = 'ecdsa';
          } catch (ecdsaError) {
            throw new Error(`Failed to parse private key with either ED25519 or ECDSA: ${ed25519Error}`);
          }
        }
      }
    } else {
      this.operatorKey = config.operatorKey;
      this.keyType = 'ed25519'; // Default if we can't detect
    }

    // Create Hedera client
    this.client = this.createClient(config.network);
    
    // Initialize the client
    this.initializeClient();
  }

  /**
   * Initialize the Hedera client with operator information
   */
  private initializeClient(): void {
    try {
      this.client.setOperator(this.operatorId, this.operatorKey);
      this.initialized = true;
      this.logger.info(`HCS-2 client initialized successfully with key type: ${this.keyType}`);
    } catch (error) {
      this.logger.error(`Failed to initialize HCS-2 client: ${error}`);
      throw error;
    }
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
  async createRegistry(options: CreateRegistryOptions = {}): Promise<TopicRegistrationResponse> {
    try {
      const registryType = options.registryType ?? HCS2RegistryType.INDEXED;
      const ttl = options.ttl ?? 86400; // Default TTL: 24 hours
      
      const memo = this.generateRegistryMemo(registryType, ttl);
      
      let transaction = new TopicCreateTransaction()
        .setTopicMemo(memo);
      
      // Add admin key if requested
      let adminKeyPrivate: PrivateKey | undefined;
      if (options.adminKey) {
        let adminPublicKey: PublicKey;
        if (typeof options.adminKey === 'string') {
          adminPublicKey = PublicKey.fromString(options.adminKey);
        } else if (typeof options.adminKey === 'boolean') {
          adminPublicKey = this.operatorKey.publicKey;
        } else {
          // Provided as PrivateKey instance
          adminPublicKey = options.adminKey.publicKey;
          adminKeyPrivate = options.adminKey;
        }
        transaction = transaction.setAdminKey(adminPublicKey);
      }
      
      // Add submit key if requested
      let submitKeyPrivate: PrivateKey | undefined;
      if (options.submitKey) {
        let submitPublicKey: PublicKey;
        if (typeof options.submitKey === 'string') {
          submitPublicKey = PublicKey.fromString(options.submitKey);
        } else if (typeof options.submitKey === 'boolean') {
          submitPublicKey = this.operatorKey.publicKey;
        } else {
          submitPublicKey = options.submitKey.publicKey;
          submitKeyPrivate = options.submitKey;
        }
        transaction = transaction.setSubmitKey(submitPublicKey);
      }
      

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
      
      this.logger.info(`Created registry topic: ${topicIdStr} (${registryType === HCS2RegistryType.INDEXED ? 'Indexed' : 'Non-indexed'}, TTL: ${ttl}s)`);
      
      return {
        success: true,
        topicId: topicIdStr,
        transactionId: txResponse.transactionId.toString()
      };
    } catch (error) {
      this.logger.error(`Failed to create registry: ${error}`);
      return {
        success: false,
        error: `Failed to create registry: ${error}`
      };
    }
  }

  /**
   * Register a new entry in the registry
   * @param registryTopicId The topic ID of the registry
   * @param options Registration options
   * @returns Promise resolving to the operation result
   */
  async registerEntry(registryTopicId: string, options: RegisterEntryOptions): Promise<RegistryOperationResponse> {
    try {
      // Create register message
      const message = this.createRegisterMessage(
        options.targetTopicId,
        options.metadata,
        options.memo
      );

      
      const receipt = await this.submitMessage(registryTopicId, message);
      
      this.logger.info(`Registered entry in registry ${registryTopicId} pointing to topic ${options.targetTopicId}`);
      
      return {
        success: true,
        receipt,
        sequenceNumber: receipt.topicSequenceNumber?.low ?? undefined
      };
    } catch (error) {
      this.logger.error(`Failed to register entry: ${error}`);
      return {
        success: false,
        error: `Failed to register entry: ${error}`
      };
    }
  }

  /**
   * Update an existing entry in the registry (indexed registries only)
   * @param registryTopicId The topic ID of the registry
   * @param options Update options
   * @returns Promise resolving to the operation result
   */
  async updateEntry(registryTopicId: string, options: UpdateEntryOptions): Promise<RegistryOperationResponse> {
    try {
      // Verify registry type (only indexed registries support updates)
      const registryInfo = await this.mirrorNode.getTopicInfo(registryTopicId);
      const memoInfo = this.parseRegistryTypeFromMemo(registryInfo.memo);
      
      if (!memoInfo || memoInfo.registryType !== HCS2RegistryType.INDEXED) {
        throw new Error('Update operation is only valid for indexed registries');
      }
      
      const message = this.createUpdateMessage(
        options.targetTopicId,
        options.uid,
        options.metadata,
        options.memo
      );
      
      const receipt = await this.submitMessage(registryTopicId, message);
      
      this.logger.info(`Updated entry with UID ${options.uid} in registry ${registryTopicId}`);
      
      return {
        success: true,
        receipt,
        sequenceNumber: receipt.topicSequenceNumber?.low ?? undefined
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
  async deleteEntry(registryTopicId: string, options: DeleteEntryOptions): Promise<RegistryOperationResponse> {
    try {
      // Verify registry type (only indexed registries support deletions)
      const registryInfo = await this.mirrorNode.getTopicInfo(registryTopicId);
      const memoInfo = this.parseRegistryTypeFromMemo(registryInfo.memo);
      
      if (!memoInfo || memoInfo.registryType !== HCS2RegistryType.INDEXED) {
        throw new Error('Delete operation is only valid for indexed registries');
      }
      
      const message = this.createDeleteMessage(
        options.uid,
        options.memo
      );
      
      const receipt = await this.submitMessage(registryTopicId, message);
      
      this.logger.info(`Deleted entry with UID ${options.uid} from registry ${registryTopicId}`);
      
      return {
        success: true,
        receipt,
        sequenceNumber: receipt.topicSequenceNumber?.low ?? undefined
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
  async migrateRegistry(registryTopicId: string, options: MigrateTopicOptions): Promise<RegistryOperationResponse> {
    try {
      const message = this.createMigrateMessage(
        options.targetTopicId,
        options.metadata,
        options.memo
      );
      
      const receipt = await this.submitMessage(registryTopicId, message);
      
      this.logger.info(`Migrated registry ${registryTopicId} to ${options.targetTopicId}`);
      
      return {
        success: true,
        receipt,
        sequenceNumber: receipt.topicSequenceNumber?.low ?? undefined
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
  async getRegistry(topicId: string, options: QueryRegistryOptions = {}): Promise<TopicRegistry> {
    try {
      const topicInfo = await this.mirrorNode.getTopicInfo(topicId);
      this.logger.debug(`Retrieved topic info for ${topicId}: ${JSON.stringify(topicInfo)}`);
      
      const memoInfo = this.parseRegistryTypeFromMemo(topicInfo.memo);
      
      if (!memoInfo) {
        throw new Error(`Topic ${topicId} is not an HCS-2 registry (invalid memo format)`);
      }
      
      this.logger.debug(`Retrieving messages for topic ${topicId} with limit ${options.limit ?? 100}`);
      const rawMessagesResult = await this.mirrorNode.getTopicMessages(
        topicId,
        {
          sequenceNumber: options.skip && options.skip > 0 ? `gt:${options.skip}` : undefined,
          limit: options.limit ?? 100,
          order: options.order ?? 'asc'
        }
      ) as any[];
      
      const rawMessages = options.limit ? rawMessagesResult.slice(0, options.limit) : rawMessagesResult;
      
      this.logger.debug(`Retrieved ${rawMessagesResult.length} messages, using ${rawMessages.length} after applying limit.`);
      
      // Convert messages to the format expected by parseRegistryEntries
      const entries: RegistryEntry[] = [];
      let latestEntry: RegistryEntry | undefined;
      
      for (const msg of rawMessages) {
        try {
          // The mirror node service already parsed the JSON, so we can use it directly
          const message: HCS2Message = {
            p: 'hcs-2',
            op: msg.op,
            t_id: msg.t_id,
            uid: msg.uid,
            metadata: msg.metadata,
            m: msg.m
          } as HCS2Message;
          
          // Validate message
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
            registry_type: memoInfo.registryType
          };
          
          entries.push(entry);
          
          // For non-indexed registries, we only care about the latest message
          if (memoInfo.registryType === HCS2RegistryType.NON_INDEXED || !latestEntry || entry.timestamp > latestEntry.timestamp) {
            latestEntry = entry;
          }
        } catch (error) {
          this.logger.warn(`Error processing message: ${error}`);
        }
      }
      
      this.logger.debug(`Processed ${entries.length} valid entries for registry ${topicId}`);
      
      const registry: TopicRegistry = {
        topicId,
        registryType: memoInfo.registryType,
        ttl: memoInfo.ttl,
        entries: memoInfo.registryType === HCS2RegistryType.INDEXED ? entries : (latestEntry ? [latestEntry] : []),
        latestEntry
      };
      
      return registry;
    } catch (error) {
      this.logger.error(`Failed to get registry: ${error}`);
      throw error;
    }
  }

  /**
   * Submit a message to a topic
   * @param topicId The topic ID to submit to
   * @param payload The message payload
   * @returns Promise resolving to the transaction receipt
   */
  async submitMessage(topicId: string, payload: HCS2Message): Promise<TransactionReceipt> {
    try {
      // Validate message
      const { valid, errors } = this.validateMessage(payload);
      if (!valid) {
        throw new Error(`Invalid HCS-2 message: ${errors.join(', ')}`);
      }
      
      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(TopicId.fromString(topicId))
        .setMessage(JSON.stringify(payload));
      
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
    this.client.close();
    this.logger.info('HCS-2 client closed.');
  }

  /**
   * Get the configured key type (ed25519 or ecdsa)
   */
  public getKeyType(): 'ed25519' | 'ecdsa' {
    return this.keyType;
  }

  /**
   * Get the configured operator private key
   */
  public getOperatorKey(): PrivateKey {
    return this.operatorKey;
  }
} 