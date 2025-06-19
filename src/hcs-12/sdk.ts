import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicId,
  TransactionResponse,
  TransactionReceipt,
  PrivateKey,
  PublicKey,
  KeyList,
  AccountId,
  Hbar,
} from '@hashgraph/sdk';
import { HCS12BaseClient, HCS12Config } from './base-client';
import { Logger, detectKeyTypeFromString } from '../utils';
import {
  ActionRegistry,
  BlockRegistry,
  AssemblyRegistry,
  HashLinksRegistry,
} from './registries';
import { RegistryType } from './types';
import { inscribe } from '../inscribe/inscriber';
import { InscriptionSDK } from '@kiloscribe/inscription-sdk';
import type { RetrievedInscriptionResult } from '../inscribe/types';
import * as mime from 'mime-types';

/**
 * Configuration for HCS-12 SDK client
 */
export interface HCS12ClientConfig extends HCS12Config {
  /** Operator account ID */
  operatorId: string;
  /** Operator private key */
  operatorPrivateKey: string;
}

/**
 * HCS-12 SDK client for server-side HashLinks operations
 */
export class HCS12Client extends HCS12BaseClient {
  private client: Client;
  private operatorPrivateKey: string;
  private operatorAccountId: string;
  private keyType: 'ed25519' | 'ecdsa';

  constructor(config: HCS12ClientConfig) {
    super(config);

    this.client =
      config.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

    this.operatorPrivateKey = config.operatorPrivateKey;
    this.operatorAccountId = config.operatorId;

    if (config.keyType) {
      this.keyType = config.keyType;
      const PK =
        this.keyType === 'ecdsa'
          ? PrivateKey.fromStringECDSA(this.operatorPrivateKey)
          : PrivateKey.fromStringED25519(this.operatorPrivateKey);
      this.client.setOperator(config.operatorId, PK);
    } else {
      try {
        const keyDetection = detectKeyTypeFromString(this.operatorPrivateKey);
        this.keyType = keyDetection.detectedType;
        this.client.setOperator(config.operatorId, keyDetection.privateKey);
        this.logger.debug(`Detected key type: ${this.keyType}`);
      } catch (error) {
        this.logger.error('Failed to detect key type:', error);
        throw new Error('Invalid private key format');
      }
    }

    this.logger.info('HCS-12 SDK Client initialized', {
      network: config.network,
      operatorId: this.operatorAccountId,
      keyType: this.keyType,
    });
  }

  /**
   * Initialize registries with optional existing topic IDs
   */
  initializeRegistries(topicIds?: {
    action?: string;
    block?: string;
    assembly?: string;
    hashlinks?: string;
  }): void {
    super.initializeRegistries(topicIds);

    this._actionRegistry = new ActionRegistry(
      this.network,
      this.logger,
      this.actionRegistryTopicId,
      this,
    );

    this._blockRegistry = new BlockRegistry(
      this.network,
      this.logger,
      this._blockRegistryTopicId,
      this,
    );

    this._assemblyRegistry = new AssemblyRegistry(
      this.network,
      this.logger,
      this._assemblyRegistryTopicId,
      this,
    );

    this._hashLinksRegistry = new HashLinksRegistry(
      this.network,
      this.logger,
      this._hashLinksRegistryTopicId,
      this,
    );

    this.logger.info('Registries initialized', {
      actionTopicId: this.actionRegistryTopicId,
      blockTopicId: this._blockRegistryTopicId,
      assemblyTopicId: this._assemblyRegistryTopicId,
      hashLinksTopicId: this._hashLinksRegistryTopicId,
    });
  }

  /**
   * Create a new HCS topic for a registry
   */
  async createRegistryTopic(
    registryType: RegistryType,
    adminKey?: boolean | PublicKey | KeyList,
    submitKey?: boolean | PublicKey | KeyList,
  ): Promise<string> {
    const memos: Record<RegistryType, string> = {
      [RegistryType.ACTION]: 'hcs-12:1:60:0',
      [RegistryType.BLOCK]: 'hcs-12:1:60:1',
      [RegistryType.ASSEMBLY]: 'hcs-12:1:60:2',
      [RegistryType.HASHLINKS]: 'hcs-12:1:60:3',
    };
    const memo = memos[registryType];

    this.logger.info('Creating registry topic', {
      registryType: RegistryType[registryType],
      memo,
    });

    const transaction = new TopicCreateTransaction().setTopicMemo(memo);

    if (adminKey) {
      if (
        typeof adminKey === 'boolean' &&
        adminKey &&
        this.client.operatorPublicKey
      ) {
        transaction.setAdminKey(this.client.operatorPublicKey);
        transaction.setAutoRenewAccountId(this.client.operatorAccountId!);
      } else if (adminKey instanceof PublicKey || adminKey instanceof KeyList) {
        transaction.setAdminKey(adminKey);
        if (this.client.operatorAccountId) {
          transaction.setAutoRenewAccountId(this.client.operatorAccountId);
        }
      }
    }

    if (submitKey) {
      if (
        typeof submitKey === 'boolean' &&
        submitKey &&
        this.client.operatorPublicKey
      ) {
        transaction.setSubmitKey(this.client.operatorPublicKey);
      } else if (
        submitKey instanceof PublicKey ||
        submitKey instanceof KeyList
      ) {
        transaction.setSubmitKey(submitKey);
      }
    }

    const txResponse = await transaction.execute(this.client);
    const receipt = await txResponse.getReceipt(this.client);

    if (!receipt.topicId) {
      throw new Error('Failed to create topic: topicId is null');
    }

    const topicId = receipt.topicId.toString();
    this.logger.info('Registry topic created', {
      topicId,
      registryType: RegistryType[registryType],
    });

    switch (registryType) {
      case RegistryType.ACTION:
        this.actionRegistryTopicId = topicId;
        break;
      case RegistryType.BLOCK:
        this._blockRegistryTopicId = topicId;
        break;
      case RegistryType.ASSEMBLY:
        this._assemblyRegistryTopicId = topicId;
        break;
      case RegistryType.HASHLINKS:
        break;
    }

    return topicId;
  }

  /**
   * Submit a message to an HCS topic
   */
  async submitMessage(
    topicId: string,
    message: string,
    submitKey?: PrivateKey,
  ): Promise<{ transactionId: string; sequenceNumber?: number }> {
    this.logger.debug('Submitting message to topic', {
      topicId,
      messageLength: message.length,
    });

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(message);

    let transactionResponse: TransactionResponse;
    if (submitKey) {
      const frozenTransaction = transaction.freezeWith(this.client);
      const signedTransaction = await frozenTransaction.sign(submitKey);
      transactionResponse = await signedTransaction.execute(this.client);
    } else {
      transactionResponse = await transaction.execute(this.client);
    }

    const receipt = await transactionResponse.getReceipt(this.client);

    this.logger.info('Message submitted successfully', {
      topicId,
      transactionId: transactionResponse.transactionId.toString(),
      sequenceNumber: receipt.topicSequenceNumber?.toString(),
    });

    return {
      transactionId: transactionResponse.transactionId.toString(),
      sequenceNumber: receipt.topicSequenceNumber
        ? Number(receipt.topicSequenceNumber)
        : undefined,
    };
  }

  /**
   * Get the Hedera client instance
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * Get operator account ID
   */
  getOperatorAccountId(): string {
    return this.operatorAccountId;
  }

  /**
   * Get operator private key
   */
  getOperatorPrivateKey(): string {
    return this.operatorPrivateKey;
  }

  /**
   * Inscribe a file using HCS-1 protocol
   */
  async inscribeFile(
    buffer: Buffer,
    fileName: string,
    options?: {
      progressCallback?: (progress: any) => void;
      waitMaxAttempts?: number;
      waitIntervalMs?: number;
    },
  ): Promise<RetrievedInscriptionResult> {
    this.logger.info('Inscribing file via HCS-1', { fileName });

    const mimeType = mime.lookup(fileName) || 'application/octet-stream';

    const sdk = await InscriptionSDK.createWithAuth({
      type: 'server',
      accountId: this.operatorAccountId,
      privateKey: this.operatorPrivateKey,
      network: this.network as 'testnet' | 'mainnet',
    });

    const inscriptionOptions = {
      mode: 'file' as const,
      waitForConfirmation: true,
      waitMaxAttempts: options?.waitMaxAttempts || 30,
      waitIntervalMs: options?.waitIntervalMs || 4000,
      progressCallback: options?.progressCallback,
      logging: {
        level: this.logger.getLevel ? this.logger.getLevel() : 'info',
      },
    };

    const response = await inscribe(
      {
        type: 'buffer',
        buffer,
        fileName,
        mimeType,
      },
      {
        accountId: this.operatorAccountId,
        privateKey: this.operatorPrivateKey,
        network: this.network,
      },
      inscriptionOptions,
      sdk,
    );

    if (!response.confirmed || !response.inscription) {
      throw new Error('Inscription failed to confirm');
    }

    return response.inscription;
  }
}
