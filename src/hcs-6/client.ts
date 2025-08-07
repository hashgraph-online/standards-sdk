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
import { HCS6BaseClient } from './base-client';
import {
  HCS6ClientConfig,
  HCS6Message,
  HCS6RegistryType,
  HCS6TopicRegistrationResponse,
  HCS6RegistryOperationResponse,
  HCS6TopicRegistry,
  HCS6CreateRegistryOptions,
  HCS6RegisterEntryOptions,
  HCS6QueryRegistryOptions,
  HCS6RegistryEntry,
  HCS6CreateHashinalOptions,
  HCS6CreateHashinalResponse,
  HCS6RegisterOptions,
} from './types';
import { NetworkType } from '../utils/types';
import { detectKeyTypeFromString } from '../utils/key-type-detector';
import {
  inscribe,
  InscriptionInput,
  InscriptionResponse,
} from '../inscribe/inscriber';
import { InscriptionOptions } from '../inscribe/types';

/**
 * Mirror node message format for HCS-6 registry entries
 */
interface MirrorNodeMessage {
  sequence_number: number;
  consensus_timestamp: string;
  payer_account_id?: string;
  payer?: string;
  op?: string;
  t_id?: string;
  m?: string;
}

/**
 * Type guard to validate mirror node message format
 */
function isMirrorNodeMessage(obj: unknown): obj is MirrorNodeMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'sequence_number' in obj &&
    'consensus_timestamp' in obj &&
    typeof (obj as Record<string, unknown>).sequence_number === 'number' &&
    typeof (obj as Record<string, unknown>).consensus_timestamp === 'string'
  );
}

/**
 * SDK client configuration for HCS-6
 */
export interface SDKHCS6ClientConfig extends HCS6ClientConfig {
  operatorId: string | AccountId;
  operatorKey: string | PrivateKey;
  keyType?: 'ed25519' | 'ecdsa';
}

/**
 * SDK client for HCS-6 operations
 */
export class HCS6Client extends HCS6BaseClient {
  private client: Client;
  private operatorId: AccountId;
  private operatorKey: PrivateKey;
  private initialized = false;
  private keyType: 'ed25519' | 'ecdsa';

  /**
   * Create a new HCS-6 client
   * @param config Client configuration
   */
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

    if (config.keyType) {
      this.keyType = config.keyType;
      this.operatorKey =
        typeof config.operatorKey === 'string'
          ? this.keyType === 'ecdsa'
            ? PrivateKey.fromStringECDSA(config.operatorKey)
            : PrivateKey.fromStringED25519(config.operatorKey)
          : config.operatorKey;
    } else if (typeof config.operatorKey === 'string') {
      try {
        const keyDetection = detectKeyTypeFromString(config.operatorKey);
        this.operatorKey = keyDetection.privateKey;
        this.keyType = keyDetection.detectedType;

        if (keyDetection.warning) {
          this.logger.warn(keyDetection.warning);
        }
      } catch (error) {
        this.logger.warn(
          'Failed to detect key type from private key format, defaulting to ECDSA',
        );
        this.keyType = 'ecdsa';
        this.operatorKey = PrivateKey.fromStringECDSA(config.operatorKey);
      }
    } else {
      this.operatorKey = config.operatorKey;
      this.keyType = 'ecdsa';
    }

    this.client = this.createClient(config.network);

    this.initializeClient();
  }

  /**
   * Initialize the Hedera client with operator information
   */
  private initializeClient(): void {
    try {
      this.client.setOperator(this.operatorId, this.operatorKey);
      this.initialized = true;
      this.logger.info(
        `HCS-6 client initialized successfully with key type: ${this.keyType}`,
      );
    } catch (error) {
      this.logger.error(`Failed to initialize HCS-6 client: ${error}`);
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
   * Create a new HCS-6 registry topic (for dynamic hashinals)
   * @param options Registry creation options
   * @returns Promise resolving to the transaction result
   */
  public async createRegistry(
    options: HCS6CreateRegistryOptions = {},
  ): Promise<HCS6TopicRegistrationResponse> {
    try {
      const ttl = options.ttl ?? 86400;

      if (!validateHCS6TTL(ttl)) {
        throw new Error('TTL must be at least 3600 seconds (1 hour)');
      }

      const memo = this.generateRegistryMemo(ttl);

      let transaction = new TopicCreateTransaction().setTopicMemo(memo);



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

      const topicIdStr = topicId.toString();

      this.logger.info(
        `Created HCS-6 registry topic: ${topicIdStr} (Non-indexed, TTL: ${ttl}s)`,
      );

      return {
        success: true,
        topicId: topicIdStr,
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

  /**
   * Register a new dynamic hashinal update in the registry
   * @param registryTopicId The topic ID of the HCS-6 registry
   * @param options Registration options
   * @returns Promise resolving to the operation result
   */
  public async registerEntry(
    registryTopicId: string,
    options: HCS6RegisterEntryOptions,
  ): Promise<HCS6RegistryOperationResponse> {
    return this.registerEntryWithKey(registryTopicId, options, undefined);
  }

  /**
   * Register a new dynamic hashinal update in the registry with custom submit key
   * @param registryTopicId The topic ID of the HCS-6 registry
   * @param options Registration options
   * @param submitKey Optional submit key for the registry topic
   * @returns Promise resolving to the operation result
   */
  private async registerEntryWithKey(
    registryTopicId: string,
    options: HCS6RegisterEntryOptions,
    submitKey?: string | PrivateKey,
  ): Promise<HCS6RegistryOperationResponse> {
    try {
      const isValid = await this.validateHCS6Topic(registryTopicId);
      if (!isValid) {
        throw new Error(
          `Topic ${registryTopicId} is not a valid HCS-6 registry`,
        );
      }

      const message = this.createRegisterMessage(
        options.targetTopicId,
        options.memo,
      );

      const receipt = await this.submitMessageWithKey(
        registryTopicId,
        message,
        submitKey,
      );

      this.logger.info(
        `Registered dynamic hashinal update in registry ${registryTopicId} pointing to HCS-1 topic ${options.targetTopicId}`,
      );

      return {
        success: true,
        receipt,
        sequenceNumber: receipt.topicSequenceNumber?.low ?? undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to register HCS-6 entry: ${error}`);
      return {
        success: false,
        error: `Failed to register HCS-6 entry: ${error}`,
      };
    }
  }

  /**
   * Get the latest entry from a HCS-6 registry (non-indexed, so only latest matters)
   * @param topicId The topic ID of the registry
   * @param options Query options
   * @returns Promise resolving to the registry information
   */
  public async getRegistry(
    topicId: string,
    options: HCS6QueryRegistryOptions = {},
  ): Promise<HCS6TopicRegistry> {
    try {
      const topicInfo = await this.mirrorNode.getTopicInfo(topicId);
      this.logger.debug(
        `Retrieved topic info for HCS-6 ${topicId}: ${JSON.stringify(topicInfo)}`,
      );

      const memoInfo = this.parseRegistryTypeFromMemo(topicInfo.memo);

      if (!memoInfo) {
        throw new Error(
          `Topic ${topicId} is not an HCS-6 registry (invalid memo format)`,
        );
      }

      this.logger.debug(
        `Retrieving messages for HCS-6 topic ${topicId} with limit ${options.limit ?? 100}`,
      );
      const rawMessagesResponse = await this.mirrorNode.getTopicMessages(
        topicId,
        {
          sequenceNumber:
            options.skip && options.skip > 0 ? `gt:${options.skip}` : undefined,
          limit: options.limit ?? 100,
          order: options.order ?? 'asc',
        },
      );

      if (!Array.isArray(rawMessagesResponse)) {
        throw new Error(
          'Invalid response format from mirror node: expected array',
        );
      }

      const rawMessagesResult = rawMessagesResponse.filter(isMirrorNodeMessage);
      if (rawMessagesResult.length !== rawMessagesResponse.length) {
        this.logger.warn(
          `Some messages from mirror node had invalid format. Expected ${rawMessagesResponse.length}, got ${rawMessagesResult.length} valid messages.`,
        );
      }

      const rawMessages = options.limit
        ? rawMessagesResult.slice(0, options.limit)
        : rawMessagesResult;

      this.logger.debug(
        `Retrieved ${rawMessagesResult.length} messages, using ${rawMessages.length} after applying limit.`,
      );

      const entries: HCS6RegistryEntry[] = [];
      let latestEntry: HCS6RegistryEntry | undefined;

      for (const msg of rawMessages) {
        try {
          const mirrorMsg = msg as MirrorNodeMessage;

          const message: HCS6Message = {
            p: 'hcs-6',
            op: mirrorMsg.op,
            t_id: mirrorMsg.t_id,
            m: mirrorMsg.m,
          } as HCS6Message;

          const { valid, errors } = this.validateMessage(message);
          if (!valid) {
            this.logger.warn(`Invalid HCS-6 message: ${errors.join(', ')}`);
            continue;
          }

          const entry: HCS6RegistryEntry = {
            topicId,
            sequence: mirrorMsg.sequence_number,
            timestamp: mirrorMsg.consensus_timestamp,
            payer: mirrorMsg.payer_account_id || mirrorMsg.payer || '',
            message,
            consensus_timestamp: mirrorMsg.consensus_timestamp,
            registry_type: memoInfo.registryType,
          };

          entries.push(entry);

          if (!latestEntry || entry.timestamp > latestEntry.timestamp) {
            latestEntry = entry;
          }
        } catch (error) {
          this.logger.warn(`Error processing HCS-6 message: ${error}`);
        }
      }

      this.logger.debug(
        `Processed ${entries.length} valid entries for HCS-6 registry ${topicId}`,
      );

      const registry: HCS6TopicRegistry = {
        topicId,
        registryType: memoInfo.registryType,
        ttl: memoInfo.ttl,
        entries: latestEntry ? [latestEntry] : [],
        latestEntry,
      };

      return registry;
    } catch (error) {
      this.logger.error(`Failed to get HCS-6 registry: ${error}`);
      throw error;
    }
  }

  /**
   * Submit a message to a HCS-6 topic
   * @param topicId The topic ID to submit to
   * @param payload The message payload
   * @returns Promise resolving to the transaction receipt
   */
  public async submitMessage(
    topicId: string,
    payload: HCS6Message,
  ): Promise<TransactionReceipt> {
    return this.submitMessageWithKey(topicId, payload, undefined);
  }

  /**
   * Submit a message to a HCS-6 topic with custom submit key
   * @param topicId The topic ID to submit to
   * @param payload The message payload
   * @param submitKey Optional submit key for the topic
   * @returns Promise resolving to the transaction receipt
   */
  private async submitMessageWithKey(
    topicId: string,
    payload: HCS6Message,
    submitKey?: string | PrivateKey,
  ): Promise<TransactionReceipt> {
    try {
      const { valid, errors } = this.validateMessage(payload);
      if (!valid) {
        throw new Error(`Invalid HCS-6 message: ${errors.join(', ')}`);
      }

      let transaction = new TopicMessageSubmitTransaction()
        .setTopicId(TopicId.fromString(topicId))
        .setMessage(JSON.stringify(payload));

      if (submitKey) {
        const privateKey =
          typeof submitKey === 'string'
            ? PrivateKey.fromString(submitKey)
            : submitKey;

        const frozenTx = await transaction.freezeWith(this.client);
        await frozenTx.sign(privateKey);
        transaction = frozenTx;
      }

      const txResponse = await transaction.execute(this.client);
      const receipt = await txResponse.getReceipt(this.client);

      return receipt;
    } catch (error) {
      this.logger.error(`Failed to submit HCS-6 message: ${error}`);
      throw error;
    }
  }

  /**
   * Create a complete dynamic hashinal with inscription and registry
   * @param options Options for creating the dynamic hashinal
   * @returns Promise resolving to the creation response
   */
  public async createHashinal(
    options: HCS6CreateHashinalOptions,
  ): Promise<HCS6CreateHashinalResponse> {
    try {
      this.logger.info('Starting dynamic hashinal creation process');

      let registryTopicId: string;
      let registryTransactionId: string | undefined;

      if (options.registryTopicId) {
        this.logger.info(
          `Using existing HCS-6 registry topic: ${options.registryTopicId}`,
        );
        registryTopicId = options.registryTopicId;

          const isValid = await this.validateHCS6Topic(registryTopicId);
        if (!isValid) {
          throw new Error(
            `Topic ${registryTopicId} is not a valid HCS-6 registry`,
          );
        }
      } else {
        const registryResponse = await this.createRegistry({
          ttl: options.ttl,
          adminKey: true,
          submitKey: true,
        });

        if (!registryResponse.success || !registryResponse.topicId) {
          throw new Error(
            `Failed to create HCS-6 registry: ${registryResponse.error}`,
          );
        }

        registryTopicId = registryResponse.topicId;
        registryTransactionId = registryResponse.transactionId;
        this.logger.info(`Created HCS-6 registry topic: ${registryTopicId}`);
      }

      let inscriptionTopicId: string | undefined;

      if (options.inscriptionOptions) {
        const inscriptionInput: InscriptionInput = {
          type: 'buffer',
          buffer: Buffer.from(JSON.stringify(options.metadata)),
          fileName: 'metadata.json',
          mimeType: 'application/json',
        };

        const inscriptionOptions: InscriptionOptions = {
          ...options.inscriptionOptions,
          mode: 'hashinal',
          metadata: options.metadata,
          waitForConfirmation: true,
        };

        const inscriptionResponse = await inscribe(
          inscriptionInput,
          {
            accountId: this.operatorId.toString(),
            privateKey: this.operatorKey.toString(),
            network: this.network,
          },
          inscriptionOptions,
        );

        if (inscriptionResponse.confirmed && inscriptionResponse.inscription) {
          inscriptionTopicId =
            inscriptionResponse.inscription.jsonTopicId ||
            inscriptionResponse.inscription.topic_id;
          this.logger.info(
            `Inscribed metadata to topic: ${inscriptionTopicId}`,
          );
        } else {
          throw new Error('Failed to inscribe metadata');
        }
      }

      if (!inscriptionTopicId) {
        throw new Error('No inscription topic ID available for registration');
      }

      const registerResponse = await this.registerEntryWithKey(
        registryTopicId,
        {
          targetTopicId: inscriptionTopicId,
          memo: options.memo || 'Initial dynamic hashinal registration',
        },
        options.submitKey,
      );

      if (!registerResponse.success) {
        throw new Error(
          `Failed to register in HCS-6: ${registerResponse.error}`,
        );
      }

      this.logger.info('Successfully created dynamic hashinal');

      return {
        success: true,
        registryTopicId,
        inscriptionTopicId,
        transactionId: registryTransactionId,
      };
    } catch (error) {
      this.logger.error(`Failed to create dynamic hashinal: ${error}`);
      return {
        success: false,
        error: `Failed to create dynamic hashinal: ${error}`,
      };
    }
  }

  /**
   * Register a dynamic hashinal with combined inscription and registry creation
   * This method combines createHashinal and registerEntry into a single operation
   * @param options Options for registering the dynamic hashinal
   * @returns Promise resolving to the creation response
   */
  public async register(
    options: HCS6RegisterOptions,
  ): Promise<HCS6CreateHashinalResponse> {
    try {
      this.logger.info('Starting dynamic hashinal registration process');

      let registryTopicId: string;
      let registryTransactionId: string | undefined;

      if (options.registryTopicId) {
        this.logger.info(
          `Using existing HCS-6 registry topic: ${options.registryTopicId}`,
        );
        registryTopicId = options.registryTopicId;

          const isValid = await this.validateHCS6Topic(registryTopicId);
        if (!isValid) {
          throw new Error(
            `Topic ${registryTopicId} is not a valid HCS-6 registry`,
          );
        }
      } else {
        const registryResponse = await this.createRegistry({
          ttl: options.ttl,
          adminKey: true,
          submitKey: true,
        });

        if (!registryResponse.success || !registryResponse.topicId) {
          throw new Error(
            `Failed to create HCS-6 registry: ${registryResponse.error}`,
          );
        }

        registryTopicId = registryResponse.topicId;
        registryTransactionId = registryResponse.transactionId;
        this.logger.info(`Created HCS-6 registry topic: ${registryTopicId}`);
      }

      let inscriptionInput: InscriptionInput;

      if (options.data?.base64) {
        const buffer = Buffer.from(options.data.base64, 'base64');
        inscriptionInput = {
          type: 'buffer',
          buffer: buffer,
          fileName: 'data.' + (options.data.mimeType?.split('/')[1] || 'bin'),
          mimeType: options.data.mimeType || 'application/octet-stream',
        };
      } else if (options.data?.url) {
        inscriptionInput = {
          type: 'url',
          url: options.data.url,
        };
      } else {
        inscriptionInput = {
          type: 'buffer',
          buffer: Buffer.from(JSON.stringify(options.metadata)),
          fileName: 'metadata.json',
          mimeType: 'application/json',
        };
      }

      const inscriptionOptions: InscriptionOptions = {
        ...options.inscriptionOptions,
        mode: 'hashinal',
        metadata: options.metadata,
        waitForConfirmation: true,
      };

      const inscriptionResponse = await inscribe(
        inscriptionInput,
        {
          accountId: this.operatorId.toString(),
          privateKey: this.operatorKey.toString(),
          network: this.network,
        },
        inscriptionOptions,
      );

      if (!inscriptionResponse.confirmed || !inscriptionResponse.inscription) {
        throw new Error('Failed to inscribe data');
      }

      const metadataTopicId =
        inscriptionResponse.inscription.jsonTopicId ||
        inscriptionResponse.inscription.topic_id;
      this.logger.info(
        `Inscribed image to topic: ${inscriptionResponse.inscription.topic_id}`,
      );
      if (inscriptionResponse.inscription.jsonTopicId) {
        this.logger.info(
          `Inscribed metadata to topic: ${inscriptionResponse.inscription.jsonTopicId}`,
        );
        this.logger.info(
          `Using metadata topic ID ${metadataTopicId} for HCS-6 registry`,
        );
      } else {
        this.logger.info(
          `No separate metadata topic, using data topic ${metadataTopicId} for HCS-6 registry`,
        );
      }

      const registerResponse = await this.registerEntryWithKey(
        registryTopicId,
        {
          targetTopicId: metadataTopicId,
          memo: options.memo || 'Dynamic hashinal registration',
        },
        options.submitKey,
      );

      if (!registerResponse.success) {
        throw new Error(
          `Failed to register in HCS-6: ${registerResponse.error}`,
        );
      }

      this.logger.info('Successfully registered dynamic hashinal');

      return {
        success: true,
        registryTopicId,
        inscriptionTopicId: metadataTopicId,
        transactionId: registryTransactionId,
      };
    } catch (error) {
      this.logger.error(`Failed to register dynamic hashinal: ${error}`);
      return {
        success: false,
        error: `Failed to register dynamic hashinal: ${error}`,
      };
    }
  }

  /**
   * @param topicId The topic ID to query
   * @returns Promise resolving to the topic information
   */
  public async getTopicInfo(topicId: string): Promise<{
    memo: string;
    admin_key?: string;
    submit_key?: string;
  }> {
    const topicInfo = await this.mirrorNode.getTopicInfo(topicId);
    return {
      memo: topicInfo.memo,
      admin_key: topicInfo.admin_key?.key,
      submit_key: topicInfo.submit_key?.key,
    };
  }

  /**
   * Close the client and release resources
   */
  public close(): void {
    this.logger.info('HCS-6 client closed.');
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

function validateHCS6TTL(ttl: number): boolean {
  return ttl >= 3600;
}
